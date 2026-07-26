// Car sprites, paint and number decals — PORTED VERBATIM from
// top-flush-3-10.html. Build plan non-negotiable #3: "Scenery is ported, not
// rewritten... Do not restyle them."
//
// Every function body below is byte-identical to the original. The only thing
// added is the plumbing that used to be page globals:
//
//   ctx        the 2D context, set by setSpriteContext() before drawing
//   dpr        device pixel ratio; this renderer draws in CSS pixels, so 1
//   carColor   chosen paint hex, or null for the car's stock paint
//   carNumber  chosen racing number string, or null for none
//
// The sprites draw centred on the origin with the ground at y = 0, exactly as
// the original did inside its own translate(). render/cars.js does the
// translate/rotate and then calls one of these.

let ctx = null;
let dpr = 1;
let carColor = null;
let carNumber = null;

export function setSpriteContext(context, opts = {}) {
  ctx = context;
  if (opts.dpr !== undefined) dpr = opts.dpr;
  if (opts.carColor !== undefined) carColor = opts.carColor;
  if (opts.carNumber !== undefined) carNumber = opts.carNumber;
}

// ---------------------------------------------------------------------------
// verbatim from top-flush-3-10.html below this line
// ---------------------------------------------------------------------------

function roundRect(x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
}

function drawHub(cx, cy, r){
  if(r < 1.5) return;
  const g = ctx.createRadialGradient(cx - r*.3, cy - r*.3, r*.1, cx, cy, r);
  g.addColorStop(0,'#eef2f5'); g.addColorStop(.6,'#aab4bc'); g.addColorStop(1,'#5e676e');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
  // spokes
  ctx.strokeStyle = '#3a4248';
  ctx.lineWidth = Math.max(1, r*.16);
  for(let i = 0; i < 5; i++){
    const a = i*(Math.PI*2/5);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a)*r*.85, cy + Math.sin(a)*r*.85);
    ctx.stroke();
  }
  // center cap
  ctx.fillStyle = '#2c3338';
  ctx.beginPath(); ctx.arc(cx, cy, r*.28, 0, 7); ctx.fill();
}

function hexShift(hex, f){ // f<1 darkens, f>1 lightens
  const n = parseInt(hex.slice(1),16);
  const cl = v => Math.max(0, Math.min(255, Math.round(v)));
  const r = cl(((n>>16)&255)*f), g = cl(((n>>8)&255)*f), b = cl((n&255)*f);
  return `rgb(${r},${g},${b})`;
}

function bodyPaint(y0, y1, stockStops){
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  if(carColor){
    g.addColorStop(0, hexShift(carColor, 1.25));
    g.addColorStop(.55, carColor);
    g.addColorStop(1, hexShift(carColor, .62));
  } else {
    stockStops.forEach(([stop, col]) => g.addColorStop(stop, col));
  }
  return g;
}

function drawNumberRoundel(w, cy, cx){
  if(!carNumber) return;
  cx = cx || 0;
  const r = w*.11;
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
  ctx.lineWidth = Math.max(1, w*.012); ctx.strokeStyle = '#1a1a1a';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke();
  ctx.fillStyle = '#1a1a1a';
  ctx.font = `900 ${Math.max(6, w*.15)}px Segoe UI, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(carNumber, cx, cy + w*.004);
}

function drawCarBody(w, color, dark){
  ctx.fillStyle = '#1a1024';
  const wh = w*.16;
  roundRect(-w*.52, -wh*.6, w*.16, wh*1.2, wh*.3); ctx.fill();
  roundRect( w*.36, -wh*.6, w*.16, wh*1.2, wh*.3); ctx.fill();
  const bodyG = ctx.createLinearGradient(0, -w*.3, 0, w*.1);
  bodyG.addColorStop(0, color); bodyG.addColorStop(1, dark);
  ctx.fillStyle = bodyG;
  roundRect(-w*.5, -w*.28, w, w*.34, w*.08); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  roundRect(-w*.46, -w*.30, w*.92, w*.08, w*.04); ctx.fill();
  ctx.fillStyle = '#ffb35c';
  ctx.shadowColor = '#ff7b3d'; ctx.shadowBlur = 8*dpr;
  roundRect(-w*.42, -w*.12, w*.84, w*.07, w*.03); ctx.fill();
  ctx.shadowBlur = 0;
}

function drawCelica(w){
  // tires with flared fenders
  ctx.fillStyle = '#15202b';
  const wh = w*.17;
  roundRect(-w*.54, -wh*.5, w*.18, wh*1.1, wh*.3); ctx.fill();
  roundRect( w*.36, -wh*.5, w*.18, wh*1.1, wh*.3); ctx.fill();
  drawHub(-w*.45, w*.05, wh*.4);
  drawHub( w*.45, w*.05, wh*.4);
  // boxy body (custom paint or stock blue)
  const bodyG = bodyPaint(-w*.32, w*.08, [[0,'#3d7bff'],[.55,'#1f5fd6'],[1,'#143f96']]);
  ctx.fillStyle = bodyG;
  roundRect(-w*.5, -w*.3, w, w*.36, w*.04); ctx.fill();
  // GT-S fender flares bulging past the body
  ctx.fillStyle = carColor ? hexShift(carColor, .62) : '#143f96';
  roundRect(-w*.555, -w*.14, w*.08, w*.17, w*.02); ctx.fill();
  roundRect( w*.475, -w*.14, w*.08, w*.17, w*.02); ctx.fill();
  // sloped liftback glass
  ctx.fillStyle = '#22303c';
  ctx.beginPath();
  ctx.moveTo(-w*.34, -w*.3); ctx.lineTo(-w*.26, -w*.43);
  ctx.lineTo( w*.26, -w*.43); ctx.lineTo( w*.34, -w*.3);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(180,230,255,.3)';
  ctx.beginPath();
  ctx.moveTo(-w*.2, -w*.31); ctx.lineTo(-w*.13, -w*.41);
  ctx.lineTo(-w*.05, -w*.41); ctx.lineTo(-w*.13, -w*.31);
  ctx.closePath(); ctx.fill();
  // rear window louvers — black slats over the hatch glass
  ctx.fillStyle = '#0d1115';
  for(let i = 0; i < 4; i++){
    const halfW = w*(.26 + (i/4)*.08);
    ctx.fillRect(-halfW, -w*.425 + i*w*.031, halfW*2, w*.016);
  }
  // full-width taillight panel
  ctx.fillStyle = '#1a1f24';
  roundRect(-w*.46, -w*.22, w*.92, w*.1, w*.02); ctx.fill();
  // red taillights, glowing
  ctx.fillStyle = '#ff3b30';
  ctx.shadowColor = '#ff3b30'; ctx.shadowBlur = 8*dpr;
  roundRect(-w*.44, -w*.205, w*.19, w*.07, w*.015); ctx.fill();
  roundRect( w*.25, -w*.205, w*.19, w*.07, w*.015); ctx.fill();
  ctx.shadowBlur = 0;
  // amber turn signal segments
  ctx.fillStyle = '#ffb13d';
  roundRect(-w*.245, -w*.205, w*.055, w*.07, w*.01); ctx.fill();
  roundRect( w*.19,  -w*.205, w*.055, w*.07, w*.01); ctx.fill();
  // recessed center garnish with license plate in the middle
  ctx.fillStyle = '#0d1115';
  roundRect(-w*.13, -w*.21, w*.26, w*.08, w*.01); ctx.fill();
  ctx.fillStyle = '#fff';
  roundRect(-w*.065, -w*.2, w*.13, w*.06, w*.012); ctx.fill();
  ctx.fillStyle = '#3a1130';
  ctx.font = `bold ${Math.max(4, w*.033)}px monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('FLUSH-1', 0, -w*.17);
  // GT-S badge on the left deck
  ctx.fillStyle = '#e8edf2';
  ctx.font = `bold ${Math.max(4, w*.038)}px monospace`;
  ctx.fillText('GT-S', -w*.38, -w*.26);
  // black lower body cladding
  ctx.fillStyle = '#23282c';
  ctx.fillRect(-w*.5, -w*.02, w, w*.075);
  // black plastic bumper with rub strip
  ctx.fillStyle = '#2b2f33';
  roundRect(-w*.5, -w*.1, w, w*.08, w*.02); ctx.fill();
  ctx.fillStyle = '#3c4248';
  ctx.fillRect(-w*.5, -w*.07, w, w*.012);
  // single exhaust, offset left
  ctx.fillStyle = '#9aa5ad';
  ctx.beginPath(); ctx.arc(-w*.3, w*.055, w*.03, 0, 7); ctx.fill();
  drawNumberRoundel(w, -w*.28);
}

function drawSoul(w){
  // tires
  ctx.fillStyle = '#15202b';
  const wh = w*.17;
  roundRect(-w*.52, -wh*.5, w*.17, wh*1.1, wh*.3); ctx.fill();
  roundRect( w*.35, -wh*.5, w*.17, wh*1.1, wh*.3); ctx.fill();
  drawHub(-w*.435, w*.05, wh*.4);
  drawHub( w*.435, w*.05, wh*.4);
  // tall body (custom paint or stock gloss-black)
  const bodyG = bodyPaint(-w*.62, w*.08, [[0,'#3d434b'],[.5,'#22262b'],[1,'#0f1114']]);
  ctx.fillStyle = bodyG;
  roundRect(-w*.47, -w*.6, w*.94, w*.66, w*.07); ctx.fill();
  // roof spoiler over the hatch
  ctx.fillStyle = '#0b0d10';
  roundRect(-w*.4, -w*.655, w*.8, w*.07, w*.03); ctx.fill();
  // big upright rear window
  ctx.fillStyle = '#2b3a47';
  roundRect(-w*.32, -w*.555, w*.64, w*.26, w*.04); ctx.fill();
  ctx.fillStyle = 'rgba(180,230,255,.28)';
  roundRect(-w*.28, -w*.535, w*.18, w*.2, w*.03); ctx.fill();
  // driver helmet through the glass
  ctx.fillStyle = '#f5f5f5';
  ctx.beginPath(); ctx.arc(w*.07, -w*.43, w*.05, 0, 7); ctx.fill();
  // signature boomerang taillights wrapping the glass
  ctx.fillStyle = '#ff3b30';
  ctx.shadowColor = '#ff3b30'; ctx.shadowBlur = 8*dpr;
  roundRect(-w*.405, -w*.56, w*.05, w*.31, w*.02); ctx.fill();
  roundRect( w*.355, -w*.56, w*.05, w*.31, w*.02); ctx.fill();
  roundRect(-w*.405, -w*.585, w*.81, w*.045, w*.02); ctx.fill();
  ctx.shadowBlur = 0;
  // recessed garnish + license plate
  ctx.fillStyle = '#0d1115';
  roundRect(-w*.13, -w*.2, w*.26, w*.085, w*.01); ctx.fill();
  ctx.fillStyle = '#fff';
  roundRect(-w*.065, -w*.19, w*.13, w*.065, w*.012); ctx.fill();
  ctx.fillStyle = '#3a1130';
  ctx.font = `bold ${Math.max(4, w*.033)}px monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('SOUL-1', 0, -w*.157);
  // KIA badge on the hatch
  ctx.fillStyle = '#e8edf2';
  ctx.font = `bold ${Math.max(4, w*.042)}px monospace`;
  ctx.fillText('KIA', 0, -w*.265);
  // grey plastic lower cladding + bumper with reflectors
  ctx.fillStyle = '#2b2f33';
  roundRect(-w*.47, -w*.1, w*.94, w*.09, w*.02); ctx.fill();
  ctx.fillStyle = '#3c4248';
  ctx.fillRect(-w*.47, -w*.06, w*.94, w*.012);
  ctx.fillStyle = '#ff3b30';
  ctx.fillRect(-w*.43, -w*.088, w*.06, w*.022);
  ctx.fillRect( w*.37, -w*.088, w*.06, w*.022);
  drawNumberRoundel(w, -w*.31);
}

function drawLucid(w){
  // tires
  ctx.fillStyle = '#15202b';
  const wh = w*.16;
  roundRect(-w*.55, -wh*.5, w*.17, wh*1.05, wh*.3); ctx.fill();
  roundRect( w*.38, -wh*.5, w*.17, wh*1.05, wh*.3); ctx.fill();
  drawHub(-w*.465, w*.02, wh*.38);
  drawHub( w*.465, w*.02, wh*.38);
  // low, wide body (custom paint or stock silver)
  const bodyG = bodyPaint(-w*.32, w*.08, [[0,'#e9edf2'],[.5,'#c4ccd4'],[1,'#8b949d']]);
  ctx.fillStyle = bodyG;
  roundRect(-w*.52, -w*.24, w*1.04, w*.3, w*.07); ctx.fill();
  // gently sloped rear glass (fastback)
  ctx.fillStyle = '#1d2730';
  ctx.beginPath();
  ctx.moveTo(-w*.36, -w*.24); ctx.lineTo(-w*.24, -w*.38);
  ctx.lineTo( w*.24, -w*.38); ctx.lineTo( w*.36, -w*.24);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(180,230,255,.3)';
  ctx.beginPath();
  ctx.moveTo(-w*.2, -w*.25); ctx.lineTo(-w*.12, -w*.36);
  ctx.lineTo(-w*.03, -w*.36); ctx.lineTo(-w*.12, -w*.25);
  ctx.closePath(); ctx.fill();
  // driver helmet
  ctx.fillStyle = '#f5f5f5';
  ctx.beginPath(); ctx.arc(0, -w*.31, w*.048, 0, 7); ctx.fill();
  // signature full-width thin lightbar
  ctx.fillStyle = '#ff3b30';
  ctx.shadowColor = '#ff5247'; ctx.shadowBlur = 10*dpr;
  roundRect(-w*.49, -w*.15, w*.98, w*.035, w*.017); ctx.fill();
  ctx.shadowBlur = 0;
  // micro-segment detail in the bar
  ctx.fillStyle = 'rgba(255,150,140,.55)';
  for(let i = -8; i <= 8; i++){ ctx.fillRect(i*w*.055 - w*.004, -w*.146, w*.008, w*.027); }
  // chrome window trim accent
  ctx.fillStyle = '#dfe5ea';
  ctx.fillRect(-w*.36, -w*.245, w*.72, w*.012);
  // license plate
  ctx.fillStyle = '#fff';
  roundRect(-w*.065, -w*.105, w*.13, w*.06, w*.012); ctx.fill();
  ctx.fillStyle = '#3a1130';
  ctx.font = `bold ${Math.max(4, w*.033)}px monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('AIR-1', 0, -w*.075);
  // LUCID wordmark
  ctx.fillStyle = '#5a636b';
  ctx.font = `bold ${Math.max(4, w*.036)}px monospace`;
  ctx.fillText('LUCID', 0, -w*.205);
  // subtle lower diffuser
  ctx.fillStyle = '#2b2f33';
  roundRect(-w*.4, -w*.02, w*.8, w*.06, w*.02); ctx.fill();
  ctx.fillStyle = '#1a1d20';
  for(let i = -2; i <= 2; i++){ ctx.fillRect(i*w*.1 - w*.012, -w*.015, w*.024, w*.05); }
  drawNumberRoundel(w, -w*.19, -w*.34);
}

// ---------------------------------------------------------------------------
// end verbatim
// ---------------------------------------------------------------------------

// The three selectable rides, and the paint/number options, as the original had
// them.
export const CARS = [
  { id: 'celica', name: 'GT-S Coupe', draw: drawCelica },
  { id: 'soul', name: 'Kia Soul', draw: drawSoul },
  { id: 'lucid', name: 'Lucid Air', draw: drawLucid },
];

export const PAINT_OPTIONS = [
  { name: 'Crimson', hex: '#e02234' },
  { name: 'Sunburst', hex: '#ff9d1e' },
  { name: 'Lime', hex: '#5fd130' },
  { name: 'Violet', hex: '#9b4dff' },
  { name: 'Pink', hex: '#ff5ad0' },
  { name: 'Midnight', hex: '#1c2740' },
];

export const NUMBER_OPTIONS = ['6', '1', '3', '7', '11', '23'];

export function carById(id) {
  return CARS.find(c => c.id === id) ?? CARS[0];
}

// Rival bodies use the original's simpler drawCarBody, which takes its own
// colour rather than the player's paint.
export { drawCarBody as drawRivalBody, drawCelica, drawSoul, drawLucid };
