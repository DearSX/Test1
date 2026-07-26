// Fixed 60Hz timestep + accumulator. Spec section 2.1.
// update(dtSeconds) runs at exactly 60Hz; render(alpha) interpolates between states.
// Never read dt inside render.

const STEP_MS = 1000 / 60;
const MAX_FRAME_MS = 250; // clamp stalls so we never spiral

export function startLoop(update, render) {
  let acc = 0;
  let prev = performance.now();

  function frame(now) {
    acc += Math.min(now - prev, MAX_FRAME_MS);
    prev = now;
    while (acc >= STEP_MS) {
      update(STEP_MS / 1000);
      acc -= STEP_MS;
    }
    render(acc / STEP_MS); // alpha in [0,1)
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
