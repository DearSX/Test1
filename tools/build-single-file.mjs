// Builds a single self-contained velocity3000.html that runs by double-clicking
// it — no server, no dependencies, no build tooling.
//
//   node tools/build-single-file.mjs
//
// Why this exists: ES modules are blocked over file://, so the normal entry
// point needs a web server. This bundles the module graph into one classic
// <script>, which file:// is happy with.
//
// Each module keeps its own scope. Concatenating the sources naively would
// collide immediately — five modules define `clamp`, three define a module-level
// `ctx`, two define `roundRect`, two define `cache` — so every module is wrapped
// in its own function and wired through a tiny registry, exactly as its imports
// and exports describe.
//
// The bundler understands only the syntax this codebase actually uses:
//   import { a, b as c } from './x.js';
//   export function|const|let|class NAME
//   export { a, b as c };
//   export { a, b } from './x.js';
// Anything else throws rather than silently emitting something broken.

import { readFileSync, writeFileSync } from 'fs';
import { dirname, resolve, relative } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = resolve(ROOT, 'src/main.js');
const OUT = resolve(ROOT, 'velocity3000.html');

const IMPORT_RE = /^import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]\s*;?\s*$/;
const REEXPORT_RE = /^export\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]\s*;?\s*$/;
const EXPORT_LIST_RE = /^export\s*\{([^}]*)\}\s*;?\s*$/;
const EXPORT_DECL_RE = /^export\s+(function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/;

const modules = new Map();   // path -> { id, source, deps, exports, reexports }

function parseSpecifiers(text) {
  return text.split(',').map(s => s.trim()).filter(Boolean).map(s => {
    const m = /^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/.exec(s);
    if (!m) throw new Error(`unsupported specifier: "${s}"`);
    return { local: m[1], exported: m[2] ?? m[1] };
  });
}

function load(path) {
  if (modules.has(path)) return modules.get(path);

  const raw = readFileSync(path, 'utf8');
  const id = relative(ROOT, path).replace(/\\/g, '/');
  const mod = { id, path, deps: [], exports: [], reexports: [], lines: [] };
  modules.set(path, mod);

  // Multi-line `import { ... } from '...'` and `export { ... }` are joined onto
  // one line before parsing, so the line matchers stay simple.
  const src = raw
    .replace(/^import\s*\{[^}]*\}\s*from\s*['"][^'"]+['"]\s*;?/gm, m => m.replace(/\s+/g, ' '))
    .replace(/^export\s*\{[^}]*\}(\s*from\s*['"][^'"]+['"])?\s*;?/gm, m => m.replace(/\s+/g, ' '));

  for (const line of src.split('\n')) {
    const trimmed = line.trim();

    let m = IMPORT_RE.exec(trimmed);
    if (m) {
      const dep = resolve(dirname(path), m[2]);
      mod.deps.push({ path: dep, names: parseSpecifiers(m[1]) });
      mod.lines.push('');                      // keep line numbers honest
      continue;
    }

    m = REEXPORT_RE.exec(trimmed);
    if (m) {
      const dep = resolve(dirname(path), m[2]);
      const names = parseSpecifiers(m[1]);
      // Ordering dependency only — a re-export must NOT create a local binding.
      // cars.js both imports CARS and re-exports it, and emitting a const for
      // each produced "Identifier 'CARS' has already been declared".
      mod.deps.push({ path: dep, names: [] });
      mod.reexports.push(...names.map(n => ({ ...n, from: dep })));
      mod.lines.push('');
      continue;
    }

    m = EXPORT_LIST_RE.exec(trimmed);
    if (m) {
      // `export { a, b as c };` — a is the local name, c the exported name.
      for (const spec of parseSpecifiers(m[1])) mod.exports.push(spec);
      mod.lines.push('');
      continue;
    }

    m = EXPORT_DECL_RE.exec(trimmed);
    if (m) {
      mod.exports.push({ local: m[2], exported: m[2] });
      mod.lines.push(line.replace(/^(\s*)export\s+/, '$1'));
      continue;
    }

    if (/^export\b/.test(trimmed)) {
      throw new Error(`${id}: unsupported export syntax:\n  ${trimmed}`);
    }
    if (/^import\b/.test(trimmed)) {
      throw new Error(`${id}: unsupported import syntax:\n  ${trimmed}`);
    }

    mod.lines.push(line);
  }

  for (const d of mod.deps) load(d.path);
  return mod;
}

load(ENTRY);

// Depth-first order so a module is defined before anything that imports it.
const ordered = [];
const seen = new Set();
(function visit(path) {
  if (seen.has(path)) return;
  seen.add(path);
  const mod = modules.get(path);
  for (const d of mod.deps) visit(d.path);
  ordered.push(mod);
})(ENTRY);

const key = p => relative(ROOT, p).replace(/\\/g, '/');

const chunks = ordered.map(mod => {
  // Dedupe by local name: importing the same binding twice is legal in ES
  // modules but would emit two consts here.
  const bound = new Set();
  const imports = mod.deps.flatMap(d =>
    d.names.filter(n => !bound.has(n.local) && bound.add(n.local))
      .map(n => `  const ${n.local} = __m['${key(d.path)}'].${n.exported};`));

  const exports = [
    ...mod.exports.map(e => `    get ${e.exported}() { return ${e.local}; },`),
    ...mod.reexports.map(e => `    get ${e.exported}() { return __m['${key(e.from)}'].${e.exported}; },`),
  ];

  return `// ===== ${mod.id} =====
__m['${mod.id}'] = (function () {
${imports.join('\n')}

${mod.lines.join('\n')}

  return {
${exports.join('\n')}
  };
})();
`;
});

const bundle = `(function () {
'use strict';
// Bundled from ${ordered.length} ES modules by tools/build-single-file.mjs.
// Each module keeps its own scope; getters are used for the exports so
// function declarations still hoist the way they do as real modules.
const __m = {};

${chunks.join('\n')}
})();`;

// Take the real index.html and swap the module <script> for the bundle, so the
// two entry points can never drift apart in markup, styling or controls text.
const html = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
const scriptTag = /<script type="module"[^>]*><\/script>/;
if (!scriptTag.test(html)) throw new Error('index.html: could not find the module <script> tag');

const out = html
  .replace(/<title>[^<]*<\/title>/, '<title>VELOCITY 3000</title>')
  .replace(scriptTag, `<script>\n${bundle}\n</script>`);

writeFileSync(OUT, out);

const kb = (Buffer.byteLength(out) / 1024).toFixed(0);
console.log(`velocity3000.html  ${kb} KB  (${ordered.length} modules)`);
console.log('Open it directly in a browser — no server needed.');
