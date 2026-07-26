// WebAudio: engine pitch by RPM, tyre scrub, crash. Section 2.1's file list, and
// section 3.1's "engine audio pitch = RPM, and RPM resets on upshift — that sound
// is 60% of the feel."
//
// Everything is synthesised. No assets, so nothing to load and nothing to 404.
//
// Two rules from the section 11 checklist are structural here rather than
// bolted on:
//   - Nothing is created until a user gesture. An AudioContext built during page
//     load starts suspended and browsers log a warning; more to the point, a game
//     that makes noise before you touch it is obnoxious. `unlock()` is called
//     from the first key or touch.
//   - Mute is a real gate on the master gain AND stops the oscillators, so a
//     muted game costs nothing.

const ENGINE_MIN_HZ = 45;
const ENGINE_MAX_HZ = 220;

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.ready = false;
    this.nodes = null;
  }

  // Call from a real user gesture. Safe to call repeatedly.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ready;
    }
    const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Ctor) return false;

    try {
      this.ctx = new Ctor();
    } catch {
      return false;
    }

    const ctx = this.ctx;
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : 0.5;
    master.connect(ctx.destination);

    // --- engine: two saw oscillators an octave apart through a lowpass ---
    const engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 900;
    engineGain.connect(engineFilter).connect(master);

    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.value = ENGINE_MIN_HZ;
    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.value = ENGINE_MIN_HZ * 0.5;
    const osc2Gain = ctx.createGain();
    osc2Gain.gain.value = 0.35;
    osc1.connect(engineGain);
    osc2.connect(osc2Gain).connect(engineGain);
    osc1.start();
    osc2.start();

    // --- tyre scrub / off-road: filtered noise ---
    const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 1400;
    noiseFilter.Q.value = 0.8;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0;
    noise.connect(noiseFilter).connect(noiseGain).connect(master);
    noise.start();

    this.nodes = { master, engineGain, engineFilter, osc1, osc2, noiseGain, noiseFilter };
    this.ready = true;
    return true;
  }

  setMuted(muted) {
    this.muted = !!muted;
    if (this.nodes) {
      this.nodes.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.02);
    }
    return this.muted;
  }

  toggleMute() { return this.setMuted(!this.muted); }

  // Called every frame with the car. Cheap: a few setTargetAtTime calls.
  update(car, { racing = true } = {}) {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime;
    const n = this.nodes;

    // Pitch tracks RPM directly, so an upshift drops the note — the shift is
    // audible because the RPM model resets, not because of a scripted sound.
    const revs = Math.max(0, Math.min(car.rpm / 8200, 1.08));
    const hz = ENGINE_MIN_HZ + (ENGINE_MAX_HZ - ENGINE_MIN_HZ) * revs;
    n.osc1.frequency.setTargetAtTime(hz, t, 0.02);
    n.osc2.frequency.setTargetAtTime(hz * 0.5, t, 0.02);

    // Louder and brighter under load.
    const load = car.outOfFuel ? 0 : (racing ? 0.1 + revs * 0.22 : 0.04);
    n.engineGain.gain.setTargetAtTime(load, t, 0.05);
    n.engineFilter.frequency.setTargetAtTime(600 + revs * 2600, t, 0.05);

    // Scrub when the tyres are working, roar when off-road.
    const scrub = car.offRoad ? 0.28 : Math.min(0.2, (car.tyreScrub ?? 0) * 0.22);
    n.noiseGain.gain.setTargetAtTime(scrub, t, 0.04);
    n.noiseFilter.frequency.setTargetAtTime(car.offRoad ? 700 : 1800, t, 0.06);
  }

  // One-shot crash thump.
  crash() {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.35);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc.connect(gain).connect(this.nodes.master);
    osc.start(t);
    osc.stop(t + 0.45);
  }

  // Short blip — used for the countdown and for menu confirmation.
  blip(hz = 660, duration = 0.09) {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = hz;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.28, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain).connect(this.nodes.master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  // Quieten everything without tearing the graph down (menus, results).
  idle() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.nodes.engineGain.gain.setTargetAtTime(0, t, 0.1);
    this.nodes.noiseGain.gain.setTargetAtTime(0, t, 0.1);
  }
}
