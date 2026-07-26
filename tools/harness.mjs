// Node-side test harness. Lets the real render/physics modules run outside a
// browser so each milestone's "done when" is a repeatable assertion.

// A canvas 2D context that records every call instead of rasterising.
export function fakeCanvas(w, h) {
  const calls = [];
  const ctx = {
    calls,
    reset() { calls.length = 0; },
    _rec(name, args) { calls.push({ name, args }); },
    set fillStyle(v) {}, get fillStyle() { return '#000'; },
    set strokeStyle(v) {}, get strokeStyle() { return '#000'; },
    set lineWidth(v) {}, get lineWidth() { return 1; },
    set font(v) {}, get font() { return ''; },
    set textAlign(v) {}, get textAlign() { return 'left'; },
    set globalAlpha(v) {}, get globalAlpha() { return 1; },
    set lineCap(v) {}, get lineCap() { return 'butt'; },
    set lineJoin(v) {}, get lineJoin() { return 'miter'; },
    set shadowBlur(v) {}, get shadowBlur() { return 0; },
    set shadowColor(v) {}, get shadowColor() { return '#000'; },
    fillRect(...a) { this._rec('fillRect', a); },
    strokeRect(...a) { this._rec('strokeRect', a); },
    clearRect(...a) { this._rec('clearRect', a); },
    fillText(...a) { this._rec('fillText', a.filter(x => typeof x === 'number')); },
    strokeText(...a) { this._rec('strokeText', a.filter(x => typeof x === 'number')); },
    beginPath() { this._rec('beginPath', []); },
    closePath() { this._rec('closePath', []); },
    moveTo(...a) { this._rec('moveTo', a); },
    lineTo(...a) { this._rec('lineTo', a); },
    arc(...a) { this._rec('arc', a); },
    ellipse(...a) { this._rec('ellipse', a); },
    quadraticCurveTo(...a) { this._rec('quadraticCurveTo', a); },
    bezierCurveTo(...a) { this._rec('bezierCurveTo', a); },
    rect(...a) { this._rec('rect', a); },
    fill() { this._rec('fill', []); },
    stroke() { this._rec('stroke', []); },
    save() {}, restore() {},
    translate(...a) { this._rec('translate', a); },
    rotate(...a) { this._rec('rotate', a); },
    scale(...a) { this._rec('scale', a); },
    clip() {},
    setTransform() {},
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    measureText(t) { return { width: String(t).length * 6 }; },
    drawImage(...a) { this._rec('drawImage', a.filter(x => typeof x === 'number')); },
  };
  return { width: w, height: h, ctx, getContext: () => ctx };
}

const results = [];

export function check(name, pass, detail = '') {
  results.push({ name, pass: !!pass, detail });
  const mark = pass ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  console.log(`  ${mark}  ${name}${detail ? `\n          ${detail}` : ''}`);
}

export function report(label) {
  const failed = results.filter(r => !r.pass);
  console.log(`\n${label}: ${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log(`\x1b[31m${label} NOT DONE — ${failed.length} failing:\x1b[0m`);
    for (const f of failed) console.log(`  - ${f.name}`);
    process.exitCode = 1;
  } else {
    console.log(`\x1b[32m${label} done.\x1b[0m`);
  }
  return failed.length === 0;
}
