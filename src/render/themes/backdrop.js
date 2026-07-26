// Theme backdrops and roadside mix — PORTED VERBATIM from top-flush-3-10.html.
// This is where the four palettes live. Build plan non-negotiable #3: ported,
// not rewritten, not restyled.
//
// drawSky() and makeSideObj() are byte-identical to the original, including every
// `if(theme === N)` branch and every colour literal. What used to be page globals
// is module state instead, set by setBackdrop() each frame:
//
//   ctx, W, H, horizonY, curve, theme, mountains, skyline, bgStars, dpr
//
// theme indices are the original's: 0 tropical island, 1 Providence,
// 2 Dominican Republic, 3 Costa Rica.

// makeSideObj picks from these; they live in scenery.js next to the functions
// that consume them.
import { TRIPLEX_COLORS, AWNING_COLORS, COLMADO_COLORS } from './scenery.js';

let ctx = null;
let W = 0, H = 0, horizonY = 0, curve = 0, theme = 0, dpr = 1;
let mountains = [];
let skyline = [];
let bgStars = [];

export const THEME_NAMES = ['Tropical Island', 'Providence, RI', 'Dominican Republic', 'Costa Rica'];
export const THEME_COUNT = 4;

// Maps this game's track themes onto the original's theme indices, so palettes
// are picked by name rather than by a number nobody can read.
export const THEME_INDEX = { island: 0, providence: 1, dominican: 2, costarica: 3 };

export function themeIndexFor(id) { return THEME_INDEX[id] ?? 0; }

// Rebuilds the parallax silhouettes for the current canvas size, using the
// original's distributions.
export function buildBackdrop(width, height, rng = Math.random) {
  W = width; H = height;
  const horizonBase = H * 0.40;
  horizonY = horizonBase;

  mountains = [];
  let x = -W * 0.1;
  while (x < W * 1.1) {
    const w = W * (0.06 + rng() * 0.12);
    const h = H * (0.03 + rng() * 0.075);
    mountains.push({ x, w, h });
    x += w;
  }

  // daytime: puffy clouds instead of stars
  bgStars = [];
  for (let i = 0; i < 6; i++) {
    bgStars.push({
      x: rng() * W, y: H * 0.04 + rng() * horizonBase * 0.45,
      sc: (0.6 + rng() * 0.9), v: (0.008 + rng() * 0.012) * dpr,
    });
  }

  // downtown Providence in the distance: boxy towers + the stepped 'Superman building'
  skyline = [];
  let sx = W * 0.05;
  while (sx < W * 0.95) {
    const w2 = W * (0.025 + rng() * 0.05);
    const h = H * (0.04 + rng() * 0.09);
    skyline.push({ x: sx, w: w2, h, type: 0 });
    sx += w2 + W * 0.012;
  }
  // the iconic stepped tower, roughly center-right
  skyline.push({ x: W * 0.58, w: W * 0.05, h: H * 0.16, type: 1 });
}

// Call once per frame before drawSky().
export function setBackdrop(context, opts = {}) {
  ctx = context;
  if (opts.W !== undefined) W = opts.W;
  if (opts.H !== undefined) H = opts.H;
  if (opts.horizonY !== undefined) horizonY = opts.horizonY;
  if (opts.curve !== undefined) curve = opts.curve;
  if (opts.theme !== undefined) theme = opts.theme;
  if (opts.dpr !== undefined) dpr = opts.dpr;
}

// ---------------------------------------------------------------------------
// verbatim from top-flush-3-10.html below this line
// ---------------------------------------------------------------------------

function drawSky(time){
  // bright tropical sky
  const g = ctx.createLinearGradient(0,0,0,horizonY);
  g.addColorStop(0,'#2f9ef0');
  g.addColorStop(.55,'#8fdcff');
  g.addColorStop(1,'#eafff4');
  ctx.fillStyle = g;
  ctx.fillRect(0,0,W,horizonY+2);

  // bright sun with soft glow, high in the sky
  const sunR = H*.08, sunX = W*.74 - curve*.06, sunY = horizonY*.42;
  ctx.fillStyle = 'rgba(255,250,200,.4)';
  ctx.beginPath(); ctx.arc(sunX, sunY, sunR*1.9, 0, 7); ctx.fill();
  // rotating sun rays
  ctx.save();
  ctx.translate(sunX, sunY);
  ctx.rotate(time*.00008);
  ctx.fillStyle = 'rgba(255,244,180,.18)';
  for(let i = 0; i < 12; i++){
    ctx.rotate(Math.PI/6);
    ctx.beginPath();
    ctx.moveTo(0, -sunR*1.2);
    ctx.lineTo(sunR*.22, -sunR*2.6);
    ctx.lineTo(-sunR*.22, -sunR*2.6);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  const sg = ctx.createRadialGradient(sunX, sunY, sunR*.2, sunX, sunY, sunR);
  sg.addColorStop(0,'#fffdf0'); sg.addColorStop(1,'#ffe96b');
  ctx.fillStyle = sg;
  ctx.beginPath(); ctx.arc(sunX, sunY, sunR, 0, 7); ctx.fill();

  // drifting puffy clouds (slight parallax against the curves)
  for(const c of bgStars){
    const cx2 = ((c.x + time*c.v*.06) % (W*1.3)) - W*.15 - curve*.05;
    const r = H*.035*c.sc;
    ctx.fillStyle = 'rgba(255,255,255,.92)';
    ctx.beginPath();
    ctx.arc(cx2,          c.y,        r,     0, 7);
    ctx.arc(cx2 + r*1.1,  c.y + r*.2, r*.8,  0, 7);
    ctx.arc(cx2 - r*1.1,  c.y + r*.25, r*.75, 0, 7);
    ctx.arc(cx2 + r*.4,   c.y - r*.5, r*.7,  0, 7);
    ctx.fill();
  }

  // turquoise ocean / Providence River band on the horizon
  const og = ctx.createLinearGradient(0, horizonY - H*.045, 0, horizonY);
  if(theme === 0){ og.addColorStop(0,'#1f8fae'); og.addColorStop(1,'#45cfe0'); }
  else if(theme === 2){ og.addColorStop(0,'#0e9fb0'); og.addColorStop(1,'#27d6c8'); } // bright Caribbean sea
  else if(theme === 3){ og.addColorStop(0,'#1f7d5e'); og.addColorStop(1,'#3fb98a'); } // misty Pacific-green coast
  else           { og.addColorStop(0,'#5d83a8'); og.addColorStop(1,'#86a9c4'); }
  ctx.fillStyle = og;
  ctx.fillRect(0, horizonY - H*.045, W, H*.045 + 2);

  // hazy depth band just above the horizon
  const haze = ctx.createLinearGradient(0, horizonY - H*.12, 0, horizonY);
  haze.addColorStop(0, 'rgba(255,255,255,0)');
  haze.addColorStop(1, theme === 1 ? 'rgba(210,220,235,.5)' : theme === 3 ? 'rgba(225,240,225,.55)' : 'rgba(230,250,255,.45)');
  ctx.fillStyle = haze;
  ctx.fillRect(0, horizonY - H*.12, W, H*.12);

  const mShift = -curve*.12;
  if(theme === 0){
    // lush green island hills
    ctx.fillStyle = '#2e9e64';
    ctx.beginPath();
    ctx.moveTo(-10, horizonY+2);
    for(const m of mountains){
      ctx.lineTo(m.x + mShift + m.w/2, horizonY - m.h);
      ctx.lineTo(m.x + mShift + m.w, horizonY+2);
    }
    ctx.lineTo(W+10, horizonY+2);
    ctx.closePath(); ctx.fill();
  } else if(theme === 2){
    // tall blue-green Cordillera Central mountains, layered for depth
    ctx.fillStyle = '#3f7d8c';
    ctx.beginPath();
    ctx.moveTo(-10, horizonY+2);
    for(const m of mountains){
      ctx.lineTo(m.x + mShift + m.w/2, horizonY - m.h*1.55);
      ctx.lineTo(m.x + mShift + m.w, horizonY+2);
    }
    ctx.lineTo(W+10, horizonY+2);
    ctx.closePath(); ctx.fill();
    // nearer green ridge
    ctx.fillStyle = '#2f9d57';
    ctx.beginPath();
    ctx.moveTo(-10, horizonY+2);
    for(const m of mountains){
      ctx.lineTo(m.x + mShift*1.3 + m.w*.6, horizonY - m.h*.8);
      ctx.lineTo(m.x + mShift*1.3 + m.w, horizonY+2);
    }
    ctx.lineTo(W+10, horizonY+2);
    ctx.closePath(); ctx.fill();
  } else if(theme === 3){
    // Costa Rica: a misty volcano + layered deep-green rainforest ridges
    // far hazy ridge
    ctx.fillStyle = '#7fbf9a';
    ctx.beginPath();
    ctx.moveTo(-10, horizonY+2);
    for(const m of mountains){
      ctx.lineTo(m.x + mShift*.6 + m.w/2, horizonY - m.h*1.2);
      ctx.lineTo(m.x + mShift*.6 + m.w, horizonY+2);
    }
    ctx.lineTo(W+10, horizonY+2);
    ctx.closePath(); ctx.fill();
    // a tall conical volcano, center-right, with a wisp of smoke
    const vx = W*.62 - curve*.06, vBase = horizonY+2, vTop = horizonY - H*.26;
    ctx.fillStyle = '#3c6b4e';
    ctx.beginPath();
    ctx.moveTo(vx - W*.14, vBase);
    ctx.lineTo(vx, vTop);
    ctx.lineTo(vx + W*.14, vBase);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.5)'; // smoke
    ctx.beginPath(); ctx.arc(vx, vTop - H*.01, H*.018, 0, 7);
    ctx.arc(vx + W*.012, vTop - H*.035, H*.014, 0, 7); ctx.fill();
    // nearer lush jungle ridge
    ctx.fillStyle = '#2c8a4f';
    ctx.beginPath();
    ctx.moveTo(-10, horizonY+2);
    for(const m of mountains){
      ctx.lineTo(m.x + mShift*1.3 + m.w*.6, horizonY - m.h*.95);
      ctx.lineTo(m.x + mShift*1.3 + m.w, horizonY+2);
    }
    ctx.lineTo(W+10, horizonY+2);
    ctx.closePath(); ctx.fill();
  } else {
    // downtown Providence skyline, hazy in the distance
    ctx.fillStyle = '#5c6b85';
    for(const b of skyline){
      const bx = b.x + mShift*.7;
      if(b.type === 1){
        // stepped art-deco tower
        ctx.fillRect(bx,            horizonY - b.h,      b.w,     b.h);
        ctx.fillRect(bx + b.w*.2,   horizonY - b.h*1.22, b.w*.6,  b.h*.25);
        ctx.fillRect(bx + b.w*.38,  horizonY - b.h*1.38, b.w*.24, b.h*.18);
      } else {
        ctx.fillRect(bx, horizonY - b.h, b.w, b.h + 2);
      }
    }
    // a few lit windows
    ctx.fillStyle = 'rgba(255,235,180,.55)';
    for(let i = 0; i < skyline.length; i += 2){
      const b = skyline[i];
      ctx.fillRect(b.x + mShift*.7 + b.w*.3, horizonY - b.h*.6, Math.max(1.5, b.w*.12), Math.max(1.5, b.w*.12));
    }
  }
}

function makeSideObj(z, side){
  if(theme === 0){
    return {z, side, kind:'palm', seed: Math.random()*100};
  }
  if(theme === 2){
    // Dominican roadside: bright colmados mixed with tall royal palms
    if(Math.random() < .5) return {z, side, kind:'royalpalm', seed: Math.random()*100};
    return {
      z, side, kind:'colmado',
      c1: COLMADO_COLORS[Math.floor(Math.random()*COLMADO_COLORS.length)],
      c2: COLMADO_COLORS[Math.floor(Math.random()*COLMADO_COLORS.length)]
    };
  }
  if(theme === 3){
    // Costa Rica: broad rainforest trees mixed with colorful roadside 'sodas'
    if(Math.random() < .6) return {z, side, kind:'jungletree', seed: Math.random()*100};
    return {
      z, side, kind:'soda',
      c1: COLMADO_COLORS[Math.floor(Math.random()*COLMADO_COLORS.length)],
      c2: COLMADO_COLORS[Math.floor(Math.random()*COLMADO_COLORS.length)]
    };
  }
  const r = Math.random();
  return {
    z, side,
    kind: r < .55 ? 'triplex' : 'bodega',
    c1: TRIPLEX_COLORS[Math.floor(Math.random()*TRIPLEX_COLORS.length)],
    c2: AWNING_COLORS[Math.floor(Math.random()*AWNING_COLORS.length)]
  };
}

// ---------------------------------------------------------------------------
// end verbatim
// ---------------------------------------------------------------------------

export { drawSky, makeSideObj };
