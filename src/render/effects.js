// Dust and gravel off-road, sparks on contact, and screen shake. Section 3.4.
// Particles live in screen space — they're kicked up under the car and thrown
// backwards, so they don't need projecting.

const MAX_PARTICLES = 140;

export class Effects {
  constructor() {
    this.particles = [];
    this.shake = 0;
  }

  // Called every fixed step.
  update(dt, car, canvas) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 900 * dt;
      p.vx *= 0.98;
    }

    const W = canvas.width, H = canvas.height;
    if (car.crashed) {
      this.emit(W / 2, H * 0.94, 6, '#c8b48a', 260);
    } else if (car.offRoad && car.speed > 500) {
      const rate = Math.min(1, car.speed / 6000);
      if (Math.random() < rate) {
        const side = Math.sign(car.x) || 1;
        this.emit(W / 2 + side * W * 0.07, H * 0.95, 2, dustColor(car.surface), 150 + rate * 220);
      }
    } else if (car.tyreScrub > 0.25 && car.speed > 2000) {
      if (Math.random() < car.tyreScrub * 0.5) {
        const side = -Math.sign(car.x) || 1;
        this.emit(W / 2 + side * W * 0.06, H * 0.95, 1, 'rgba(210,210,215,0.8)', 120);
      }
    }

    this.shake = car.shake;
  }

  emit(x, y, n, color, spread) {
    for (let i = 0; i < n && this.particles.length < MAX_PARTICLES; i++) {
      this.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * spread * 2,
        vy: -Math.random() * spread,
        life: 0.35 + Math.random() * 0.5,
        maxLife: 0.85,
        size: 1.5 + Math.random() * 3.5,
        color,
      });
    }
  }

  draw(ctx) {
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.maxLife)) * 0.8;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  // Wrap the world render so shake moves the road and cars but not the HUD.
  beginShake(ctx, canvas) {
    if (this.shake <= 0.001) return false;
    const amp = this.shake * Math.min(canvas.width, canvas.height) * 0.014;
    ctx.save();
    ctx.translate((Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp);
    return true;
  }

  endShake(ctx, shaken) {
    if (shaken) ctx.restore();
  }
}

function dustColor(surface) {
  switch (surface) {
    case 'dirt': return '#b08d5a';
    case 'ice': return '#dff2ff';
    case 'wet': return '#8aa0a8';
    default: return '#c8b48a';
  }
}
