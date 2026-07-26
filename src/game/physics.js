// Player physics. Build plan section 3 — the heart of it.
//
// Lateral position is a continuous -1..1 across the road. Nothing snaps to a
// lane. |x| > 1 is off-road, |x| > CRASH_X is scenery.
//
// One deliberate deviation from the spec snippet in 3.2, which reads:
//
//     playerX -= dx * speedPct * CENTRIFUGAL * segment.curve * grip
//
// Multiplying by grip makes low-grip surfaces push you out *less*, which
// contradicts 3.3 ("Low grip = more centrifugal push"). Ice has to be
// terrifying, so the push divides by grip here. Steering response multiplies by
// it, which is the other half of what 3.3 asks for.

import { TUNE } from '../tune.js';

export class PlayerCar {
  constructor(track, stats = defaultStats()) {
    this.track = track;
    this.stats = stats;

    this.trackPos = 0;      // z along the track, world units
    this.distance = 0;      // total distance travelled — the honest measure of
                            // race progress, and what M4 burns fuel against
    this.x = 0;             // continuous lateral position, -1..1
    this.speed = 0;         // world units / second
    this.gear = 0;          // index into GEAR_TOP
    this.rpm = TUNE.RPM_IDLE;
    this.damage = 0;        // 0..1

    this.nitroCharges = TUNE.NITRO_CHARGES_START;
    this.nitroTimer = 0;
    this.crashTimer = 0;
    this.offRoad = false;
    this.shake = 0;
    this.shiftFlash = 0;    // >0 just after an upshift; audio resets RPM on this

    this.manualGears = false;
    this.slipstream = 1;         // set by race.js each step (section 4)
    this.centrifugalScale = 1;   // difficulty knob (Arcade softens it)

    // Read by audio and the HUD; set every step.
    this.lateralSlip = 0;   // how hard the corner is currently pushing, 0..1
    this.tyreScrub = 0;     // 0..1, drives scrub audio and dust
  }

  // --- derived stats ---------------------------------------------------------

  get maxSpeed() {
    return TUNE.BASE_MAX_SPEED
      * this.stats.topSpeedMul
      * (this.manualGears ? TUNE.MANUAL_TOP_SPEED_BONUS : 1);
  }

  get effectiveMaxSpeed() {
    return this.maxSpeed
      * (this.nitroTimer > 0 ? TUNE.NITRO_BOOST : 1)
      * this.slipstream;
  }

  get grip() {
    const surface = this.surface;
    const base = TUNE.SURFACE_GRIP[surface] ?? 1;
    const g = base
      * this.stats.gripMul
      * (1 - this.damage * TUNE.DAMAGE_GRIP_LOSS)
      * (this.nitroTimer > 0 ? TUNE.NITRO_GRIP_PENALTY : 1);
    return Math.max(g, 0.12);
  }

  get surface() {
    return this.track.findSegment(this.trackPos).surface;
  }

  get speedKmh() { return this.speed * TUNE.SPEED_TO_KMH; }
  get crashed() { return this.crashTimer > 0; }

  // --- the step --------------------------------------------------------------

  update(dt, input) {
    const maxSpeed = this.maxSpeed;
    const effMax = this.effectiveMaxSpeed;

    if (this.nitroTimer > 0) this.nitroTimer = Math.max(0, this.nitroTimer - dt);
    if (this.shiftFlash > 0) this.shiftFlash = Math.max(0, this.shiftFlash - dt);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 3);

    // Crashed: no control, coasting to a stop, then back on the road.
    if (this.crashTimer > 0) {
      this.crashTimer -= dt;
      this.speed = Math.max(0, this.speed - TUNE.BASE_BRAKING * 1.4 * dt);
      this.advance(dt);
      this.lateralSlip = 0;
      this.tyreScrub = 0;
      return;
    }

    if (input.nitro && this.nitroCharges > 0 && this.nitroTimer <= 0) {
      this.nitroCharges--;
      this.nitroTimer = TUNE.NITRO_DURATION;
    }

    this.updateGears(dt, input, maxSpeed);

    // Off-road is decided from where the car currently is, before this step's
    // steering moves it, so traction loss and engine cut agree with each other.
    this.offRoad = Math.abs(this.x) > TUNE.OFFROAD_X;

    // --- longitudinal ---
    const gearMul = TUNE.GEAR_ACCEL[this.gear];
    // Away from the gear's usable rev band the engine simply doesn't pull. This
    // is what makes manual shifting a skill rather than a free 4%.
    const bandEfficiency = this.manualGears ? this.revBandEfficiency() : 1;
    // Grass and gravel don't put power down.
    const traction = this.offRoad ? TUNE.OFFROAD_POWER : 1;
    const engine = TUNE.BASE_ACCEL * this.stats.accelMul * gearMul * bandEfficiency
      * traction * input.throttle;

    // Drag is scaled so that at speed == effMax it exactly cancels top-gear
    // engine force. Top speed therefore falls out of the numbers instead of
    // being clamped on afterwards.
    const topGearForce = TUNE.BASE_ACCEL * this.stats.accelMul * TUNE.GEAR_ACCEL[TUNE.GEAR_ACCEL.length - 1];
    const dragRatio = effMax > 0 ? this.speed / effMax : 0;
    const drag = topGearForce * TUNE.DRAG_K * dragRatio * dragRatio;

    const braking = TUNE.BASE_BRAKING * this.stats.brakingMul * input.brake;
    const engineBrake = (input.throttle === 0 && input.brake === 0) ? TUNE.ENGINE_BRAKE : 0;

    this.speed += (engine - drag - braking - engineBrake) * dt;
    if (this.speed < 0) this.speed = 0;

    // --- off-road drag ---
    if (this.offRoad) {
      const floor = maxSpeed * TUNE.OFFROAD_MAX;
      if (this.speed > floor) {
        // OFFROAD_DECEL is per 60Hz step; convert so the decay is framerate-independent.
        const k = Math.pow(TUNE.OFFROAD_DECEL, dt * 60);
        this.speed = floor + (this.speed - floor) * k;
      }
      this.shake = Math.min(1, this.shake + dt * 4);
    }

    // --- steering (continuous, never snapped) ---
    const speedPct = Math.min(this.speed / maxSpeed, 1.4);
    const grip = this.grip;
    // Faster = less steering authority; low grip = vaguer response.
    const authority = (1 - speedPct * TUNE.STEER_SPEED_FALLOFF)
      * (TUNE.STEER_GRIP_FLOOR + (1 - TUNE.STEER_GRIP_FLOOR) * grip);
    const steerDelta = input.steer * TUNE.STEER_RATE * dt * Math.max(authority, 0.15);
    this.x += steerDelta;

    // --- centrifugal: the soul dial ---
    // Quadratic in speed (real cornering load is v²/r) so lifting the throttle
    // is worth much more than the speed you give up. Divided by grip so ice and
    // dirt throw you further, per section 3.3.
    const curve = this.track.curveAt(this.trackPos);
    const push = TUNE.CENTRIFUGAL * this.centrifugalScale
      * speedPct * speedPct * curve * dt / grip;
    this.x -= push;

    // How close the corner is to overwhelming the tyres — used for scrub audio,
    // dust, and the HUD's grip needle.
    const maxCounter = TUNE.STEER_RATE * dt * Math.max(authority, 0.15);
    this.lateralSlip = maxCounter > 0 ? Math.min(1, Math.abs(push) / maxCounter) : 0;
    this.tyreScrub = this.offRoad ? 1 : Math.max(0, (this.lateralSlip - 0.55) / 0.45);

    // --- scenery = crash ---
    // Note there is no clamp inside |x| <= CRASH_X. Leaving the road has to be
    // possible, or the soul dial has nothing to punish.
    if (Math.abs(this.x) > TUNE.CRASH_X) this.crash();

    this.advance(dt);
    this.rpm = this.computeRpm(maxSpeed);
  }

  crash() {
    this.x = clamp(this.x, -TUNE.CRASH_X, TUNE.CRASH_X) * 0.92;
    this.speed *= TUNE.CRASH_SPEED_KEEP;
    this.damage = Math.min(1, this.damage + TUNE.CRASH_DAMAGE * this.stats.damageTakenMul);
    this.crashTimer = TUNE.CRASH_RECOVERY;
    this.shake = 1;
    this.nitroTimer = 0;
  }

  // --- gearbox ---------------------------------------------------------------

  updateGears(dt, input, maxSpeed) {
    const top = TUNE.GEAR_TOP;
    const last = top.length - 1;

    if (this.manualGears) {
      if (input.shiftUp && this.gear < last) { this.gear++; this.shiftFlash = 0.12; }
      if (input.shiftDown && this.gear > 0) this.gear--;
      return;
    }

    const pct = this.speed / maxSpeed;
    // Upshift at the top of the band, downshift below the band with hysteresis
    // so cresting a shift point doesn't chatter.
    if (this.gear < last && pct > top[this.gear]) {
      this.gear++;
      this.shiftFlash = 0.12;
    } else if (this.gear > 0 && pct < top[this.gear - 1] * TUNE.DOWNSHIFT_HYSTERESIS) {
      this.gear--;
    }
  }

  computeRpm(maxSpeed) {
    const top = TUNE.GEAR_TOP;
    const lo = this.gear === 0 ? 0 : top[this.gear - 1];
    const hi = top[this.gear];
    const pct = clamp((this.speed / maxSpeed - lo) / Math.max(hi - lo, 1e-6), 0, 1.08);
    return TUNE.RPM_IDLE + (TUNE.RPM_REDLINE - TUNE.RPM_IDLE) * pct;
  }

  // 1.0 in the meat of the rev band, falling off when bogged down or bouncing
  // off the limiter. Manual only.
  revBandEfficiency() {
    const r = this.rpm / TUNE.RPM_REDLINE;
    if (r < 0.28) return 0.45;            // bogged
    if (r > 1.0) return 0.55;             // on the limiter, needs an upshift
    return 0.82 + 0.18 * Math.sin(Math.min(r, 1) * Math.PI);
  }

  advance(dt) {
    const moved = this.speed * dt;
    this.distance += moved;
    this.trackPos = this.wrap(this.trackPos + moved);
  }

  wrap(z) {
    const L = this.track.trackLength;
    return ((z % L) + L) % L;
  }
}

// Level-0 car. M3's garage produces these from upgrade levels.
export function defaultStats() {
  return {
    topSpeedMul: 1,
    accelMul: 1,
    brakingMul: 1,
    gripMul: 1,
    damageTakenMul: 1,
    fuelCapacityMul: 1,
  };
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
