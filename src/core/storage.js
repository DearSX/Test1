// Save slots, JSON export/import, schema versioning. Section 6.
//
// `version` and the migration table are here from day one because the schema
// will change — the alternative is discovering at M7 that every existing save is
// unreadable.
//
// The backend is injectable so this is testable outside a browser and so a
// blocked localStorage (private browsing, storage disabled) degrades to
// in-memory rather than throwing on boot.

export const SAVE_VERSION = 1;
export const SLOT_COUNT = 3;

const KEY_PREFIX = 'velocity3000.slot.';
const KEY_LAST = 'velocity3000.lastSlot';

// Migrations run in order for any save older than SAVE_VERSION. Each entry takes
// the save at version N and returns it at version N+1.
//
// Nothing to migrate yet — version 1 is the first schema. When the shape changes,
// bump SAVE_VERSION and add the step here; do not edit an existing one, or saves
// already through it will be migrated twice.
const MIGRATIONS = {
  // 1: (save) => ({ ...save, version: 2, /* ...changes... */ }),
};

// A localStorage-shaped object that never throws.
function memoryBackend() {
  const map = new Map();
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: k => { map.delete(k); },
    _memory: true,
  };
}

function detectBackend() {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return memoryBackend();
    // Safari in private mode has localStorage but throws on write.
    const probe = '__v3000probe';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return memoryBackend();
  }
}

export class SaveStore {
  constructor(backend = null) {
    this.backend = backend ?? detectBackend();
    this.persistent = !this.backend._memory;
    this.lastError = null;
  }

  // --- raw slot access -------------------------------------------------------

  read(slot) {
    let text;
    try {
      text = this.backend.getItem(KEY_PREFIX + slot);
    } catch (e) {
      this.lastError = e;
      return null;
    }
    if (!text) return null;
    try {
      return this.normalize(JSON.parse(text));
    } catch (e) {
      // A corrupt slot must not take the game down with it.
      this.lastError = e;
      return null;
    }
  }

  write(slot, save) {
    const payload = { ...save, version: SAVE_VERSION, slot, savedAt: Date.now() };
    try {
      this.backend.setItem(KEY_PREFIX + slot, JSON.stringify(payload));
      this.backend.setItem(KEY_LAST, String(slot));
      return true;
    } catch (e) {
      this.lastError = e;    // quota, or storage disabled mid-session
      return false;
    }
  }

  clear(slot) {
    try {
      this.backend.removeItem(KEY_PREFIX + slot);
      return true;
    } catch (e) {
      this.lastError = e;
      return false;
    }
  }

  lastSlot() {
    const v = Number(this.backend.getItem(KEY_LAST));
    return Number.isInteger(v) && v >= 0 && v < SLOT_COUNT ? v : null;
  }

  // --- versioning ------------------------------------------------------------

  // Brings any readable save up to SAVE_VERSION. Returns null if it can't.
  normalize(raw) {
    if (!raw || typeof raw !== 'object') return null;
    let save = raw;
    let version = Number(save.version) || 0;

    if (version > SAVE_VERSION) return null;    // written by a newer build

    let guard = 0;
    while (version < SAVE_VERSION && guard++ < 50) {
      const step = MIGRATIONS[version];
      if (!step) {
        // No path from this version — treat as unreadable rather than guessing.
        return null;
      }
      save = step(save);
      version = Number(save.version) || version + 1;
    }

    return { ...save, version: SAVE_VERSION };
  }

  // --- slot picker -----------------------------------------------------------

  // One line per slot for the load screen.
  summaries() {
    const out = [];
    for (let slot = 0; slot < SLOT_COUNT; slot++) {
      const save = this.read(slot);
      if (!save) {
        out.push({ slot, empty: true });
        continue;
      }
      out.push({
        slot,
        empty: false,
        driverName: save.driverName ?? 'DRIVER',
        division: save.division ?? 'rookie',
        seasonRace: save.seasonRace ?? 0,
        money: save.money ?? 0,
        racesWon: save.records?.racesWon ?? 0,
        savedAt: save.savedAt ?? null,
      });
    }
    return out;
  }

  // --- export / import -------------------------------------------------------

  toJsonText(save) {
    return JSON.stringify({ ...save, version: SAVE_VERSION }, null, 2);
  }

  // Returns { ok, save, error }. Never throws on bad input — this is fed a file
  // the user picked, which may be anything at all.
  fromJsonText(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return { ok: false, error: 'That file is not valid JSON.' };
    }
    const save = this.normalize(parsed);
    if (!save) {
      return {
        ok: false,
        error: Number(parsed?.version) > SAVE_VERSION
          ? 'That save was written by a newer version of the game.'
          : 'That file is not a Velocity 3000 save.',
      };
    }
    if (!save.car || !save.standings) {
      return { ok: false, error: 'That save is missing its car or championship data.' };
    }
    return { ok: true, save };
  }
}

// Triggers a file download in the browser. No-op elsewhere.
export function downloadSave(save, filename = 'velocity3000-save.json') {
  if (typeof document === 'undefined') return false;
  const text = JSON.stringify({ ...save, version: SAVE_VERSION }, null, 2);
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  // Revoke on the next tick; revoking immediately can cancel the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

// Opens a file picker and resolves with the file's text, or null if cancelled.
export function pickSaveFile() {
  if (typeof document === 'undefined') return Promise.resolve(null);
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    });
    input.click();
  });
}
