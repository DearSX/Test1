// Keyboard, touch and gamepad, all normalized to one shape:
//   { steer: -1..1, throttle: 0..1, brake: 0..1, nitro: bool, shiftUp: bool, shiftDown: bool }
//
// steer is analog on gamepad/touch and ramped on keyboard — a key press is not
// an instant full lock, because lateral position is continuous and a digital
// snap to full lock would fight that.

import { TUNE } from '../tune.js';

const KEYS = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  throttle: ['ArrowUp', 'KeyW'],
  brake: ['ArrowDown', 'KeyS'],
  nitro: ['ShiftLeft', 'ShiftRight', 'KeyN'],
  shiftUp: ['KeyE', 'PageUp'],
  shiftDown: ['KeyQ', 'PageDown'],
};

export class Input {
  constructor(target = window) {
    this.state = {
      steer: 0, throttle: 0, brake: 0,
      nitro: false, shiftUp: false, shiftDown: false,
    };
    this.held = new Set();
    this.keySteer = 0;              // ramped keyboard steering
    this.touch = { steer: 0, throttle: 0, brake: 0, nitro: false };
    this.touchActive = false;
    this.gamepadIndex = null;
    this._edge = { shiftUp: false, shiftDown: false, nitro: false };
    // Rects the HUD's own buttons occupy. A touch inside one of these is not
    // steering, throttle or nitro — without this, tapping an on-screen button
    // would also blip the throttle underneath it.
    this.exclusionZones = [];

    target.addEventListener('keydown', e => {
      if (isGameKey(e.code)) e.preventDefault();
      this.held.add(e.code);
    });
    target.addEventListener('keyup', e => this.held.delete(e.code));
    target.addEventListener('blur', () => this.held.clear());

    window.addEventListener('gamepadconnected', e => { this.gamepadIndex = e.gamepad.index; });
    window.addEventListener('gamepaddisconnected', () => { this.gamepadIndex = null; });
  }

  // Touch: left half of the screen steers (drag), right half is throttle/brake.
  attachTouch(canvas) {
    const zones = new Map();

    const classify = (t) => {
      const r = canvas.getBoundingClientRect();
      const cx = (t.clientX - r.left) * (canvas.width / r.width);
      const cy = (t.clientY - r.top) * (canvas.height / r.height);
      for (const z of this.exclusionZones) {
        if (cx >= z.x && cx <= z.x + z.w && cy >= z.y && cy <= z.y + z.h) return { kind: 'ui' };
      }
      const px = (t.clientX - r.left) / r.width;
      const py = (t.clientY - r.top) / r.height;
      if (px < 0.5) return { kind: 'steer', originX: t.clientX, width: r.width };
      if (py < 0.45) return { kind: 'nitro' };
      return { kind: py < 0.72 ? 'throttle' : 'brake' };
    };

    const refresh = () => {
      const t = { steer: 0, throttle: 0, brake: 0, nitro: false };
      for (const z of zones.values()) {
        if (z.kind === 'steer') t.steer = clamp(z.steer || 0, -1, 1);
        else if (z.kind === 'throttle') t.throttle = 1;
        else if (z.kind === 'brake') t.brake = 1;
        else if (z.kind === 'nitro') t.nitro = true;
      }
      this.touch = t;
      this.touchActive = zones.size > 0;
    };

    canvas.addEventListener('touchstart', e => {
      e.preventDefault();
      for (const t of e.changedTouches) zones.set(t.identifier, classify(t));
      refresh();
    }, { passive: false });

    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        const z = zones.get(t.identifier);
        if (z && z.kind === 'steer') {
          // Drag distance across a quarter of the screen = full lock.
          z.steer = (t.clientX - z.originX) / (z.width * 0.25);
        }
      }
      refresh();
    }, { passive: false });

    const end = e => {
      e.preventDefault();
      for (const t of e.changedTouches) zones.delete(t.identifier);
      refresh();
    };
    canvas.addEventListener('touchend', end, { passive: false });
    canvas.addEventListener('touchcancel', end, { passive: false });
  }

  // Called once per fixed step.
  sample(dt) {
    const s = this.state;
    const pad = this.readGamepad();

    const kLeft = KEYS.left.some(k => this.held.has(k));
    const kRight = KEYS.right.some(k => this.held.has(k));
    const kSteerTarget = (kRight ? 1 : 0) - (kLeft ? 1 : 0);

    // Ramp toward the target; snap back to centre faster than you steer into it.
    const rate = kSteerTarget === 0 ? TUNE.STEER_RETURN : TUNE.STEER_RAMP;
    this.keySteer += clamp(kSteerTarget - this.keySteer, -rate * dt, rate * dt);
    if (kSteerTarget === 0 && Math.abs(this.keySteer) < 0.02) this.keySteer = 0;

    // Analog sources win when they're actually being used.
    if (pad && Math.abs(pad.steer) > 0.08) s.steer = pad.steer;
    else if (this.touchActive && this.touch.steer !== 0) s.steer = this.touch.steer;
    else s.steer = this.keySteer;
    s.steer = clamp(s.steer, -1, 1);

    s.throttle = Math.max(
      KEYS.throttle.some(k => this.held.has(k)) ? 1 : 0,
      this.touch.throttle,
      pad ? pad.throttle : 0,
    );
    s.brake = Math.max(
      KEYS.brake.some(k => this.held.has(k)) ? 1 : 0,
      this.touch.brake,
      pad ? pad.brake : 0,
    );

    // Nitro and shifts are edge-triggered: holding the key is one activation.
    const nitroDown = KEYS.nitro.some(k => this.held.has(k)) || this.touch.nitro || (pad && pad.nitro);
    s.nitro = nitroDown && !this._edge.nitro;
    this._edge.nitro = nitroDown;

    const upDown = KEYS.shiftUp.some(k => this.held.has(k)) || (pad && pad.shiftUp);
    s.shiftUp = upDown && !this._edge.shiftUp;
    this._edge.shiftUp = upDown;

    const downDown = KEYS.shiftDown.some(k => this.held.has(k)) || (pad && pad.shiftDown);
    s.shiftDown = downDown && !this._edge.shiftDown;
    this._edge.shiftDown = downDown;

    return s;
  }

  readGamepad() {
    if (this.gamepadIndex === null || !navigator.getGamepads) return null;
    const gp = navigator.getGamepads()[this.gamepadIndex];
    if (!gp) return null;
    const dz = v => Math.abs(v) < 0.12 ? 0 : v;
    const trigger = i => gp.buttons[i] ? gp.buttons[i].value : 0;
    return {
      steer: dz(gp.axes[0] || 0),
      throttle: Math.max(trigger(7), gp.buttons[0] && gp.buttons[0].pressed ? 1 : 0),
      brake: Math.max(trigger(6), gp.buttons[1] && gp.buttons[1].pressed ? 1 : 0),
      nitro: !!(gp.buttons[2] && gp.buttons[2].pressed),
      shiftUp: !!(gp.buttons[5] && gp.buttons[5].pressed),
      shiftDown: !!(gp.buttons[4] && gp.buttons[4].pressed),
    };
  }
}

// A neutral input, for AI cars and for headless tests.
export function blankInput() {
  return { steer: 0, throttle: 0, brake: 0, nitro: false, shiftUp: false, shiftDown: false };
}

function isGameKey(code) {
  return Object.values(KEYS).some(list => list.includes(code));
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
