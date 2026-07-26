// Roadside scenery — PORTED VERBATIM from top-flush-3-10.html. Build plan
// non-negotiable #3: "Scenery is ported, not rewritten... Do not restyle them."
//
// All seven draw functions are byte-identical to the original. They were already
// pure screen-space draws — (x, y, size) against a page-global ctx — which is
// why they transplant cleanly. The only addition is setSceneryContext(), taking
// the place of that global.
//
// x, y is the base of the object on screen; size scales the whole thing.

let ctx = null;

export function setSceneryContext(context) { ctx = context; }

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

function drawPalmTree(x, y, size, seed){
  const lean = Math.sin(seed*2.3) * size*.12;       // each tree leans slightly differently
  const topX = x + lean, topY = y - size*1.05;
  // ground shadow
  ctx.fillStyle = 'rgba(10,50,30,.28)';
  ctx.beginPath(); ctx.ellipse(x, y, size*.32, size*.08, 0, 0, 7); ctx.fill();
  // trunk — tapered, curved, with ring segments
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#9b6b3a';
  ctx.lineWidth = size*.11;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + lean*.4, y - size*.55, topX, topY);
  ctx.stroke();
  ctx.strokeStyle = '#7c5128';
  ctx.lineWidth = size*.11;
  for(let i = 1; i <= 5; i++){
    const tt = i/6;
    const sx = x + (topX - x)*tt + Math.sin(tt*Math.PI)*lean*.2;
    const sy = y + (topY - y)*tt;
    ctx.beginPath();
    ctx.moveTo(sx - size*.05, sy);
    ctx.lineTo(sx + size*.05, sy);
    ctx.stroke();
  }
  ctx.lineWidth = 1;
  // coconuts at the crown
  ctx.fillStyle = '#5a3d22';
  ctx.beginPath(); ctx.arc(topX - size*.05, topY + size*.04, size*.05, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(topX + size*.06, topY + size*.05, size*.05, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(topX + size*.01, topY + size*.09, size*.045, 0, 7); ctx.fill();
  // fronds — 7 drooping leaves radiating from the crown
  const fronds = 7;
  for(let i = 0; i < fronds; i++){
    const ang = (Math.PI * (i / (fronds-1))) - Math.PI*.05; // fan across the top
    const len = size*(.55 + .12*Math.sin(seed + i));
    const ex = topX + Math.cos(ang)*len;
    const ey = topY - Math.sin(ang)*len*.55 + len*.28; // droop downward
    const midX = topX + Math.cos(ang)*len*.5;
    const midY = topY - Math.sin(ang)*len*.55;
    const grad = ctx.createLinearGradient(topX, topY, ex, ey);
    grad.addColorStop(0, '#2f9e4f'); grad.addColorStop(1, '#1d7a3a');
    ctx.strokeStyle = grad;
    ctx.lineWidth = size*.045;
    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.quadraticCurveTo(midX, midY, ex, ey);
    ctx.stroke();
    // leaflets along the frond spine
    ctx.lineWidth = size*.012;
    ctx.strokeStyle = '#37b95c';
    for(let j = 1; j <= 4; j++){
      const tt = j/5;
      const bx = topX + (ex - topX)*tt;
      const by = topY + (ey - topY)*tt;
      const perp = ang + Math.PI/2;
      const ll = size*.08*(1-tt*.5);
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + Math.cos(perp)*ll, by + Math.sin(perp)*ll - ll*.3);
      ctx.moveTo(bx, by);
      ctx.lineTo(bx - Math.cos(perp)*ll, by + Math.sin(perp)*ll - ll*.3);
      ctx.stroke();
    }
  }
  ctx.lineWidth = 1;
}

function drawRoyalPalm(x, y, size, seed){
  const sway = Math.sin(seed*1.7) * size*.05;
  const topX = x + sway, topY = y - size*1.5;
  // shadow
  ctx.fillStyle = 'rgba(10,50,30,.26)';
  ctx.beginPath(); ctx.ellipse(x, y, size*.28, size*.07, 0, 0, 7); ctx.fill();
  // smooth pale grey trunk, slight bulge low-down
  const tg = ctx.createLinearGradient(x - size*.08, 0, x + size*.08, 0);
  tg.addColorStop(0,'#d9d2c0'); tg.addColorStop(.5,'#cbc3ad'); tg.addColorStop(1,'#a89e86');
  ctx.fillStyle = tg;
  ctx.beginPath();
  ctx.moveTo(x - size*.07, y);
  ctx.quadraticCurveTo(x - size*.045, y - size*.7, topX - size*.035, topY);
  ctx.lineTo(topX + size*.035, topY);
  ctx.quadraticCurveTo(x + size*.045, y - size*.7, x + size*.07, y);
  ctx.closePath(); ctx.fill();
  // faint trunk rings
  ctx.strokeStyle = 'rgba(120,108,84,.4)'; ctx.lineWidth = Math.max(1, size*.012);
  for(let i = 1; i <= 6; i++){
    const tt = i/7, yy = y + (topY - y)*tt, ww = size*(.065 - tt*.03);
    ctx.beginPath(); ctx.moveTo(x - ww, yy); ctx.lineTo(x + ww, yy); ctx.stroke();
  }
  // green crownshaft
  ctx.fillStyle = '#3a8f3f';
  roundRect(topX - size*.05, topY - size*.02, size*.1, size*.16, size*.03); ctx.fill();
  // big arching fronds radiating up & out
  const fronds = 9;
  for(let i = 0; i < fronds; i++){
    const ang = (Math.PI * (i/(fronds-1))) - 0; // fan upward
    const len = size*(.5 + .12*Math.sin(seed + i*1.3));
    const ex = topX + Math.cos(ang)*len;
    const ey = topY - Math.sin(ang)*len*.7 + len*.25;
    const midX = topX + Math.cos(ang)*len*.5;
    const midY = topY - Math.sin(ang)*len*.6;
    const grad = ctx.createLinearGradient(topX, topY, ex, ey);
    grad.addColorStop(0,'#2f9e4f'); grad.addColorStop(1,'#176b30');
    ctx.strokeStyle = grad; ctx.lineWidth = size*.05;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(topX, topY - size*.02);
    ctx.quadraticCurveTo(midX, midY, ex, ey); ctx.stroke();
  }
  ctx.lineWidth = 1;
}

function drawJungleTree(x, y, size, seed){
  const lean = Math.sin(seed*1.9) * size*.06;
  const topY = y - size*1.0;
  // shadow
  ctx.fillStyle = 'rgba(8,40,20,.3)';
  ctx.beginPath(); ctx.ellipse(x, y, size*.4, size*.09, 0, 0, 7); ctx.fill();
  // buttressed trunk
  ctx.fillStyle = '#6e4a2c';
  ctx.beginPath();
  ctx.moveTo(x - size*.12, y);
  ctx.quadraticCurveTo(x - size*.04, y - size*.5, x + lean - size*.05, topY + size*.2);
  ctx.lineTo(x + lean + size*.05, topY + size*.2);
  ctx.quadraticCurveTo(x + size*.04, y - size*.5, x + size*.12, y);
  ctx.closePath(); ctx.fill();
  // big layered canopy — several overlapping green blobs
  const cx = x + lean, cy = topY + size*.1;
  const blobs = [
    [0, 0, .55, '#1f7a38'],
    [-.32, .12, .4, '#268f44'],
    [.32, .1, .42, '#2aa14c'],
    [-.05, -.28, .42, '#33b257'],
    [.16, -.12, .36, '#2f9e4f']
  ];
  for(const [bx, by, br, col] of blobs){
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(cx + bx*size, cy + by*size, br*size, 0, 7); ctx.fill();
  }
  // sun-dapple highlights
  ctx.fillStyle = 'rgba(180,255,170,.25)';
  ctx.beginPath(); ctx.arc(cx - size*.18, cy - size*.18, size*.12, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + size*.2, cy - size*.05, size*.09, 0, 7); ctx.fill();
  // a couple of hanging vines
  ctx.strokeStyle = 'rgba(40,110,55,.7)'; ctx.lineWidth = Math.max(1, size*.02);
  for(const vx of [-.25, .18]){
    ctx.beginPath();
    ctx.moveTo(cx + vx*size, cy + size*.3);
    ctx.quadraticCurveTo(cx + vx*size + size*.04, cy + size*.55, cx + vx*size - size*.02, cy + size*.7);
    ctx.stroke();
  }
}

function drawTriplex(x, y, size, color){
  const hw = size*.42, hh = size*1.15;
  // body with a shaded right side for depth
  ctx.fillStyle = color;
  ctx.fillRect(x-hw, y-hh, hw*2, hh);
  ctx.fillStyle = 'rgba(0,0,0,.16)';
  ctx.fillRect(x+hw*.45, y-hh, hw*.55, hh);
  // chimney
  ctx.fillStyle = '#7a5036';
  ctx.fillRect(x+hw*.55, y-hh-size*.18, hw*.22, size*.18);
  // flat roof cornice
  ctx.fillStyle = '#3a3f45';
  ctx.fillRect(x-hw*1.08, y-hh-size*.05, hw*2.16, size*.06);
  ctx.fillStyle = '#2a2e33';
  ctx.fillRect(x-hw*1.08, y-hh-size*.01, hw*2.16, size*.015);
  // three stories: trim band, paned windows, porch railing
  for(let s2 = 0; s2 < 3; s2++){
    const fy = y - hh + s2*(hh/3);
    ctx.fillStyle = '#f0ede6';
    ctx.fillRect(x-hw, fy, hw*2, size*.025);
    const wwin = hw*.4, hwin = hh*.16;
    for(const wx of [x-hw*.7, x+hw*.3]){
      // glass with subtle gradient
      const wg = ctx.createLinearGradient(wx, fy, wx, fy+hwin);
      wg.addColorStop(0,'#3a4e5e'); wg.addColorStop(1,'#243643');
      ctx.fillStyle = wg;
      ctx.fillRect(wx, fy + hh*.08, wwin, hwin);
      // white frame + mullions
      ctx.fillStyle = '#eef0ee';
      ctx.fillRect(wx + wwin/2 - size*.008, fy + hh*.08, size*.016, hwin);
      ctx.fillRect(wx, fy + hh*.08 + hwin/2 - size*.008, wwin, size*.016);
    }
    // porch railing
    ctx.fillStyle = 'rgba(240,237,230,.85)';
    ctx.fillRect(x-hw*.85, fy + hh*.27, hw*1.7, size*.015);
    for(let b = 0; b <= 8; b++){
      ctx.fillRect(x-hw*.85 + b*(hw*1.7/8), fy + hh*.27, size*.01, size*.05);
    }
  }
  // front door with stoop
  ctx.fillStyle = '#cfcabf';
  ctx.fillRect(x-hw*.2, y-size*.05, hw*.4, size*.05);
  ctx.fillStyle = '#5a3b2e';
  ctx.fillRect(x-hw*.12, y-hh*.18, hw*.24, hh*.18);
  ctx.fillStyle = '#caa64a';
  ctx.beginPath(); ctx.arc(x+hw*.06, y-hh*.09, size*.012, 0, 7); ctx.fill();
}

function drawBodega(x, y, size, color, awn){
  const hw = size*.5, hh = size*.5;
  ctx.fillStyle = color;
  ctx.fillRect(x-hw, y-hh, hw*2, hh);
  // sign band
  ctx.fillStyle = '#ffd23d';
  ctx.fillRect(x-hw*.9, y-hh*.96, hw*1.8, hh*.2);
  ctx.fillStyle = '#3a1130';
  if(size > 30){
    ctx.font = `bold ${Math.max(5, size*.09)}px monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('BODEGA', x, y-hh*.86);
  }
  // striped awning
  const aw = hw*1.9, ah = hh*.18, ay = y-hh*.68;
  for(let i = 0; i < 6; i++){
    ctx.fillStyle = i % 2 ? '#f0ede6' : awn;
    ctx.fillRect(x-aw/2 + i*(aw/6), ay, aw/6 + 1, ah);
  }
  // storefront window + door
  ctx.fillStyle = '#274b5e';
  ctx.fillRect(x-hw*.78, y-hh*.46, hw*.95, hh*.42);
  ctx.fillStyle = '#5a3b2e';
  ctx.fillRect(x+hw*.3, y-hh*.46, hw*.4, hh*.46);
}

// bright Dominican colmado — vivid concrete box, hand-painted sign, soda crates outside
function drawColmado(x, y, size, color, accent){
  const hw = size*.52, hh = size*.62;
  // body
  ctx.fillStyle = color;
  ctx.fillRect(x-hw, y-hh, hw*2, hh);
  // shaded right wall for depth
  ctx.fillStyle = 'rgba(0,0,0,.16)';
  ctx.fillRect(x+hw*.5, y-hh, hw*.5, hh);
  // flat roof lip
  ctx.fillStyle = '#e9e4d8';
  ctx.fillRect(x-hw*1.05, y-hh-size*.05, hw*2.1, size*.06);
  // big painted sign band in an accent color
  ctx.fillStyle = accent;
  ctx.fillRect(x-hw*.95, y-hh*.94, hw*1.9, hh*.24);
  ctx.fillStyle = 'rgba(255,255,255,.92)';
  if(size > 30){
    ctx.font = `bold ${Math.max(5, size*.11)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('COLMADO', x, y-hh*.82);
  }
  // open storefront: dark interior + roll-up shutter sides
  ctx.fillStyle = '#241c16';
  ctx.fillRect(x-hw*.6, y-hh*.55, hw*1.2, hh*.5);
  ctx.fillStyle = 'rgba(255,225,150,.35)'; // warm interior light
  ctx.fillRect(x-hw*.5, y-hh*.48, hw*.4, hh*.32);
  // counter
  ctx.fillStyle = '#9c7b4f';
  ctx.fillRect(x-hw*.6, y-hh*.12, hw*1.2, hh*.12);
  // stacked soda crates out front (red & blue)
  ctx.fillStyle = '#d23b2e'; ctx.fillRect(x-hw*.95, y-size*.16, size*.16, size*.16);
  ctx.fillStyle = '#2b6fd0'; ctx.fillRect(x-hw*.95, y-size*.32, size*.16, size*.14);
  ctx.fillStyle = '#f2b417'; ctx.fillRect(x+hw*.78, y-size*.16, size*.16, size*.16);
  // string of festival flags along the roof
  ctx.lineWidth = Math.max(1, size*.01); ctx.strokeStyle = 'rgba(255,255,255,.6)';
  ctx.beginPath(); ctx.moveTo(x-hw, y-hh-size*.02); ctx.lineTo(x+hw, y-hh-size*.02); ctx.stroke();
  const flagC = ['#e8482e','#2ba3d4','#f2b417','#37a85a'];
  for(let i = 0; i < 6; i++){
    const fx = x - hw + (i+.5)*(hw*2/6);
    ctx.fillStyle = flagC[i % flagC.length];
    ctx.beginPath();
    ctx.moveTo(fx - size*.03, y-hh-size*.02);
    ctx.lineTo(fx + size*.03, y-hh-size*.02);
    ctx.lineTo(fx, y-hh+size*.04);
    ctx.closePath(); ctx.fill();
  }
}

function drawSoda(x, y, size, color, accent){
  const hw = size*.5, hh = size*.5;
  // body
  ctx.fillStyle = color;
  ctx.fillRect(x-hw, y-hh, hw*2, hh);
  ctx.fillStyle = 'rgba(0,0,0,.15)';
  ctx.fillRect(x+hw*.5, y-hh, hw*.5, hh);
  // corrugated tin gable roof (overhanging)
  ctx.fillStyle = '#9aa0a4';
  ctx.beginPath();
  ctx.moveTo(x-hw*1.15, y-hh);
  ctx.lineTo(x, y-hh-size*.32);
  ctx.lineTo(x+hw*1.15, y-hh);
  ctx.closePath(); ctx.fill();
  // roof ridges
  ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = Math.max(1, size*.012);
  for(let i = -3; i <= 3; i++){
    ctx.beginPath();
    ctx.moveTo(x + i*hw*.32, y-hh);
    ctx.lineTo(x + i*hw*.16, y-hh-size*.16);
    ctx.stroke();
  }
  // painted sign band
  ctx.fillStyle = accent;
  ctx.fillRect(x-hw*.9, y-hh*.9, hw*1.8, hh*.22);
  ctx.fillStyle = 'rgba(255,255,255,.95)';
  if(size > 30){
    ctx.font = `bold ${Math.max(5, size*.1)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('SODA', x, y-hh*.79);
  }
  // open serving window + counter
  ctx.fillStyle = '#241c16';
  ctx.fillRect(x-hw*.62, y-hh*.5, hw*1.24, hh*.42);
  ctx.fillStyle = 'rgba(255,225,150,.3)';
  ctx.fillRect(x-hw*.52, y-hh*.44, hw*.5, hh*.26);
  ctx.fillStyle = '#b07a44';
  ctx.fillRect(x-hw*.62, y-hh*.12, hw*1.24, hh*.12);
  // two plastic stools out front
  ctx.fillStyle = accent;
  ctx.fillRect(x-hw*.5, y-size*.1, size*.1, size*.1);
  ctx.fillRect(x+hw*.4, y-size*.1, size*.1, size*.1);
}

// The original's colour tables for the roadside buildings, unchanged.
export const TRIPLEX_COLORS = ['#c8b48a','#9fb6c4','#c98f7a','#b9c9a1','#d4c49a','#a9929e'];
export const AWNING_COLORS = ['#d23b3b','#2e8b57','#2e6bd2','#d2902e'];
export const COLMADO_COLORS = ['#e8482e','#f2b417','#2ba3d4','#37a85a','#e85aa0','#7b54c4'];

// ---------------------------------------------------------------------------
// end verbatim
// ---------------------------------------------------------------------------

// Draws one placed object. `kind` matches the original's side-object kinds, and
// the argument order per kind is the original's too.
export function drawSceneryObject(obj, x, y, size) {
  switch (obj.kind) {
    case 'palm': return drawPalmTree(x, y, size, obj.seed || 0);
    case 'royalpalm': return drawRoyalPalm(x, y, size, obj.seed || 0);
    case 'jungletree': return drawJungleTree(x, y, size, obj.seed || 0);
    case 'triplex': return drawTriplex(x, y, size, obj.c1);
    case 'bodega': return drawBodega(x, y, size, obj.c1, obj.c2);
    case 'colmado': return drawColmado(x, y, size, obj.c1, obj.c2);
    case 'soda': return drawSoda(x, y, size, obj.c1, obj.c2);
    default: return undefined;
  }
}

export {
  drawPalmTree, drawRoyalPalm, drawJungleTree,
  drawTriplex, drawBodega, drawColmado, drawSoda,
};
