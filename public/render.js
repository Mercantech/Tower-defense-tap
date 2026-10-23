/**
 * Tower Defense Tap — soft canvas layers, VFX, polish
 */
(function (global) {
  function hexAlpha(hex, a) {
    const h = String(hex || '#fff').replace('#', '');
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const n = parseInt(full, 16);
    if (Number.isNaN(n)) return `rgba(255,255,255,${a})`;
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return `rgba(${r},${g},${b},${a})`;
  }

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  class TowerRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.groundCache = null;
      this.groundKey = '';
      this.particles = [];
      this.floaters = [];
      this.chains = [];
      this.shake = 0;
      this.animT = 0;
    }

    invalidateGround() {
      this.groundCache = null;
      this.groundKey = '';
    }

    consumeEvents(events) {
      if (!events || !events.length) return;
      for (const ev of events) {
        if (ev.type === 'kill') {
          this._burst(ev.x, ev.y, ev.kind === 'boss' ? 22 : 10, '#f0d48a');
          if (ev.gold) this._float(ev.x, ev.y, `+${ev.gold}`, '#f0d48a');
        } else if (ev.type === 'hit' && ev.crit) {
          this._float(ev.x, ev.y, 'CRIT', '#ff8a7a');
          this._burst(ev.x, ev.y, 6, '#ff8a7a');
        } else if (ev.type === 'leak') {
          this.shake = Math.min(14, this.shake + 7);
          this._burst(ev.x, ev.y, 12, '#e25555');
        } else if (ev.type === 'gold' && ev.amount) {
          this._float(0.8, 0.6, `+${ev.amount}g`, '#7ecf6a');
        } else if (ev.type === 'chain') {
          this.chains.push({
            x: ev.x,
            y: ev.y,
            x2: ev.x2,
            y2: ev.y2,
            life: 0.32,
          });
        } else if (ev.type === 'place' || ev.type === 'upgrade') {
          this._burst(ev.x, ev.y, 8, '#efe6d4');
        }
      }
    }

    _burst(tx, ty, n, color) {
      for (let i = 0; i < n; i++) {
        const ang = Math.random() * Math.PI * 2;
        const sp = 0.6 + Math.random() * 2.4;
        this.particles.push({
          x: tx + 0.5,
          y: ty + 0.5,
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp,
          life: 0.4 + Math.random() * 0.4,
          color,
          r: 1.2 + Math.random() * 2.8,
        });
      }
    }

    _float(tx, ty, text, color) {
      this.floaters.push({
        x: tx + 0.5,
        y: ty + 0.15,
        text,
        color,
        life: 1,
      });
    }

    _ensureGround(state) {
      const key = `${state.mapId}|${state.path.length}|${state.buildSlots.length}`;
      const tw = state.grid.tile;
      const gw = state.grid.width;
      const gh = state.grid.height;
      if (this.groundCache && this.groundKey === key) return;

      const off = document.createElement('canvas');
      off.width = gw * tw;
      off.height = gh * tw;
      const g = off.getContext('2d');

      // Soft grass field
      for (let y = 0; y < gh; y++) {
        for (let x = 0; x < gw; x++) {
          const base = (x + y) % 2 === 0;
          const grad = g.createLinearGradient(x * tw, y * tw, x * tw, y * tw + tw);
          grad.addColorStop(0, base ? '#2f5238' : '#274830');
          grad.addColorStop(1, base ? '#26452f' : '#1f3a28');
          g.fillStyle = grad;
          g.fillRect(x * tw, y * tw, tw, tw);
        }
      }

      // Ambient vignette
      const vig = g.createRadialGradient(
        (gw * tw) / 2,
        (gh * tw) / 2,
        Math.min(gw, gh) * tw * 0.25,
        (gw * tw) / 2,
        (gh * tw) / 2,
        Math.max(gw, gh) * tw * 0.72
      );
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, 'rgba(0,0,0,0.28)');
      g.fillStyle = vig;
      g.fillRect(0, 0, gw * tw, gh * tw);

      // Soft stone rim
      g.fillStyle = 'rgba(42, 36, 28, 0.55)';
      g.fillRect(0, 0, gw * tw, 6);
      g.fillRect(0, gh * tw - 6, gw * tw, 6);
      g.fillRect(0, 0, 6, gh * tw);
      g.fillRect(gw * tw - 6, 0, 6, gh * tw);

      // Rounded path tiles
      for (const p of state.path) {
        const px = p.x * tw + 3;
        const py = p.y * tw + 3;
        const pw = tw - 6;
        const ph = tw - 6;
        roundRect(g, px, py, pw, ph, 10);
        const pg = g.createLinearGradient(px, py, px, py + ph);
        pg.addColorStop(0, '#d4b484');
        pg.addColorStop(1, '#b8925c');
        g.fillStyle = pg;
        g.fill();
        g.strokeStyle = 'rgba(60, 40, 20, 0.25)';
        g.lineWidth = 1;
        g.stroke();

        roundRect(g, px + 9, py + 9, pw - 18, ph - 18, 6);
        g.fillStyle = 'rgba(140, 100, 55, 0.35)';
        g.fill();
      }

      const pathSet = new Set(state.path.map((p) => `${p.x},${p.y}`));
      for (const s of state.buildSlots) {
        if (pathSet.has(`${s.x},${s.y}`)) continue;
        const hx = s.x * tw + tw / 2;
        const hy = s.y * tw + tw / 2;
        g.beginPath();
        g.arc(hx, hy, 6, 0, Math.PI * 2);
        g.fillStyle = 'rgba(232,196,106,0.12)';
        g.fill();
        g.strokeStyle = 'rgba(232,196,106,0.28)';
        g.lineWidth = 1.25;
        g.stroke();
      }

      const start = state.path[0];
      const end = state.path[state.path.length - 1];
      if (start) {
        roundRect(g, start.x * tw + 7, start.y * tw + 7, tw - 14, tw - 14, 10);
        g.fillStyle = 'rgba(224, 122, 58, 0.92)';
        g.fill();
        g.fillStyle = '#fff';
        g.font = '10px Bungee, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('IN', start.x * tw + tw / 2, start.y * tw + tw / 2);
      }
      if (end) {
        roundRect(g, end.x * tw + 7, end.y * tw + 7, tw - 14, tw - 14, 10);
        g.fillStyle = 'rgba(226, 85, 85, 0.92)';
        g.fill();
        g.fillStyle = '#fff';
        g.font = '10px Bungee, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('OUT', end.x * tw + tw / 2, end.y * tw + tw / 2);
      }

      this.groundCache = off;
      this.groundKey = key;
    }

    drawTowerBody(cx, cy, color, level, alpha, typeId) {
      const ctx = this.ctx;
      ctx.save();
      ctx.globalAlpha = alpha;
      const r = 11 + level * 2;

      // Soft drop shadow
      ctx.beginPath();
      ctx.ellipse(cx, cy + r * 0.75, r * 0.75, r * 0.28, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fill();

      const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, 2, cx, cy, r);
      grad.addColorStop(0, hexAlpha('#ffffff', 0.35));
      grad.addColorStop(0.35, color);
      grad.addColorStop(1, hexAlpha(color, 0.75));

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, r - 1.5, -Math.PI * 0.85, -Math.PI * 0.15);
      ctx.stroke();

      if (typeId === 'cannon') {
        roundRect(ctx, cx - 4, cy - r - 5, 8, 11, 3);
        ctx.fillStyle = hexAlpha(color, 0.95);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.stroke();
      } else if (typeId === 'frost') {
        ctx.strokeStyle = 'rgba(200,240,255,0.95)';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx, cy - r * 0.65);
        ctx.lineTo(cx, cy + r * 0.45);
        ctx.moveTo(cx - r * 0.45, cy);
        ctx.lineTo(cx + r * 0.45, cy);
        ctx.stroke();
      } else if (typeId === 'sniper') {
        roundRect(ctx, cx - 2.5, cy - r - 9, 5, 13, 2);
        ctx.fillStyle = '#1a1a1a';
        ctx.fill();
      } else if (typeId === 'barracks') {
        roundRect(ctx, cx - r * 0.55, cy - r * 0.35, r * 1.1, r * 0.8, 4);
        ctx.fillStyle = hexAlpha(color, 0.95);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.stroke();
      } else if (typeId === 'arc') {
        ctx.strokeStyle = 'rgba(220,210,255,0.95)';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 1.5);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.5, cy - r * 0.1);
        ctx.lineTo(cx, cy - r * 0.9);
        ctx.lineTo(cx + r * 0.5, cy - r * 0.1);
        ctx.closePath();
        ctx.fillStyle = hexAlpha(color, 0.95);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.stroke();
      }

      // Level badge
      ctx.beginPath();
      ctx.arc(cx, cy + 1, 7, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(10,14,12,0.75)';
      ctx.fill();
      ctx.fillStyle = '#efe6d4';
      ctx.font = 'bold 10px IBM Plex Mono, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(level), cx, cy + 1.5);
      ctx.restore();
    }

    drawRange(cx, cy, rangeTiles, tw, color, pulse) {
      const ctx = this.ctx;
      const r = rangeTiles * tw;
      const a = 0.08 + pulse * 0.06;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = hexAlpha(color, a);
      ctx.fill();
      ctx.strokeStyle = hexAlpha(color, 0.35 + pulse * 0.25);
      ctx.lineWidth = 1.75;
      ctx.setLineDash([5, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    drawEnemy(e, tw, pulse) {
      const ctx = this.ctx;
      const cx = e.x * tw + tw / 2;
      const cy = e.y * tw + tw / 2;
      const r = Math.max(7, (e.radius || 0.28) * tw);
      const color = e.color || '#e25555';

      // Shadow
      ctx.beginPath();
      ctx.ellipse(cx, cy + r * 0.7, r * 0.7, r * 0.25, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fill();

      if (e.kind === 'boss') {
        ctx.beginPath();
        ctx.arc(cx, cy, r + 7 + pulse * 5, 0, Math.PI * 2);
        ctx.strokeStyle = hexAlpha(color, 0.3 + pulse * 0.3);
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      const fill = e.slowed ? hexAlpha('#5eb8d4', 0.9) : color;
      const grad = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.3, 1, cx, cy, r);
      grad.addColorStop(0, hexAlpha('#ffffff', 0.28));
      grad.addColorStop(0.5, fill);
      grad.addColorStop(1, hexAlpha(fill, 0.8));

      ctx.beginPath();
      if (e.flying) {
        ctx.ellipse(cx, cy - 3, r * 0.95, r * 0.68, 0, 0, Math.PI * 2);
      } else if (e.kind === 'tank' || e.kind === 'armored') {
        roundRect(ctx, cx - r, cy - r * 0.85, r * 2, r * 1.7, 6);
      } else if (e.kind === 'swarm') {
        ctx.arc(cx, cy, r * 0.85, 0, Math.PI * 2);
      } else {
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
      }
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1.75;
      ctx.stroke();

      if (e.flying) {
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.beginPath();
        ctx.ellipse(cx, cy + r + 1, r * 0.75, 3.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Soft HP bar
      const pct = Math.max(0, e.hp / e.maxHp);
      const bw = Math.max(22, r * 2.1);
      const bh = 5;
      const bx = cx - bw / 2;
      const by = cy - r - 11;
      roundRect(ctx, bx, by, bw, bh, 3);
      ctx.fillStyle = 'rgba(10,14,12,0.75)';
      ctx.fill();
      roundRect(ctx, bx + 1, by + 1, Math.max(0, (bw - 2) * pct), bh - 2, 2);
      ctx.fillStyle = pct > 0.4 ? '#7ecf6a' : '#e25555';
      ctx.fill();
    }

    updateFx(dt) {
      this.shake = Math.max(0, this.shake - dt * 18);
      this.particles = this.particles.filter((p) => {
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 1.8 * dt;
        return p.life > 0;
      });
      this.floaters = this.floaters.filter((f) => {
        f.life -= dt;
        f.y -= dt * 0.85;
        return f.life > 0;
      });
      this.chains = this.chains.filter((c) => {
        c.life -= dt;
        return c.life > 0;
      });
    }

    draw(state, hoverTile) {
      this.animT = (this.animT + 1) % 360;
      const pulse = (Math.sin(this.animT / 12) + 1) / 2;
      const ctx = this.ctx;
      const canvas = this.canvas;
      if (!state) return;

      const tw = state.grid.tile;
      const gw = state.grid.width;
      const gh = state.grid.height;
      if (canvas.width !== gw * tw || canvas.height !== gh * tw) {
        canvas.width = gw * tw;
        canvas.height = gh * tw;
        this.invalidateGround();
      }

      this._ensureGround(state);
      this.updateFx(1 / 60);

      const sx = this.shake ? (Math.random() - 0.5) * this.shake : 0;
      const sy = this.shake ? (Math.random() - 0.5) * this.shake : 0;
      ctx.save();
      ctx.translate(sx, sy);

      if (this.groundCache) ctx.drawImage(this.groundCache, 0, 0);

      const pathSet = new Set(state.path.map((p) => `${p.x},${p.y}`));
      const towerSet = new Set(state.towers.map((t) => `${t.x},${t.y}`));

      for (const s of state.buildSlots) {
        const key = `${s.x},${s.y}`;
        if (pathSet.has(key) || towerSet.has(key)) continue;
        const isHover = hoverTile && hoverTile.x === s.x && hoverTile.y === s.y;
        if (!isHover) continue;
        const hx = s.x * tw + tw / 2;
        const hy = s.y * tw + tw / 2;
        ctx.beginPath();
        ctx.arc(hx, hy, 10 + pulse * 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(232,196,106,${0.28 + pulse * 0.15})`;
        ctx.fill();
        ctx.strokeStyle = 'rgba(232,196,106,0.55)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      for (const t of state.towers) {
        const cx = t.x * tw + tw / 2;
        const cy = t.y * tw + tw / 2;
        const selected =
          state.cursor && state.cursor.x === t.x && state.cursor.y === t.y;
        if (selected) this.drawRange(cx, cy, t.range, tw, t.color, pulse);
        if (t.auraRate > 0) {
          ctx.beginPath();
          ctx.arc(cx, cy, t.range * tw, 0, Math.PI * 2);
          ctx.strokeStyle = hexAlpha(t.color, 0.12 + pulse * 0.1);
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        this.drawTowerBody(cx, cy, t.color, t.level, 1, t.typeId);
      }

      if (state.cursor && state.ghost) {
        const c = state.cursor;
        const cx = c.x * tw + tw / 2;
        const cy = c.y * tw + tw / 2;
        const g = state.ghost;
        const ok = state.canPlace;
        const color = ok ? g.color : '#e25555';
        this.drawRange(cx, cy, g.range, tw, color, pulse);
        ctx.save();
        ctx.globalAlpha = 0.18 + pulse * 0.08;
        roundRect(ctx, c.x * tw + 7, c.y * tw + 7, tw - 14, tw - 14, 10);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.restore();
        this.drawTowerBody(cx, cy, color, 1, ok ? 0.45 + pulse * 0.12 : 0.3, g.typeId);
        ctx.save();
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = ok ? '#efe6d4' : '#ffb4a8';
        ctx.font = 'bold 10px IBM Plex Mono, monospace';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 6;
        ctx.fillText(ok ? `BYG ${g.name}` : `${g.cost}g`, cx, cy - tw * 0.42);
        ctx.restore();
      }

      if (state.cursor) {
        const c = state.cursor;
        const pad = 3 + pulse * 1.5;
        const col = state.canPlace
          ? `rgba(126, 207, 106, ${0.75 + pulse * 0.2})`
          : state.canUpgrade
            ? `rgba(232, 196, 106, ${0.8 + pulse * 0.15})`
            : `rgba(232, 196, 106, ${0.5 + pulse * 0.2})`;
        ctx.strokeStyle = col;
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        roundRect(ctx, c.x * tw + pad, c.y * tw + pad, tw - pad * 2, tw - pad * 2, 10);
        ctx.stroke();
        ctx.shadowColor = col;
        ctx.shadowBlur = 8;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      for (const e of state.enemies) {
        this.drawEnemy(e, tw, pulse);
      }

      for (const p of state.projectiles) {
        const px = p.x * tw;
        const py = p.y * tw;
        ctx.beginPath();
        ctx.moveTo(px - 5, py);
        ctx.lineTo(px + 5, py);
        ctx.strokeStyle = hexAlpha(p.color || '#fff', 0.3);
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(px, py, p.crit ? 5.5 : 3.8, 0, Math.PI * 2);
        ctx.fillStyle = p.color || '#fff';
        ctx.shadowColor = p.color || '#fff';
        ctx.shadowBlur = p.crit ? 10 : 5;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      for (const c of this.chains) {
        const a = Math.max(0, c.life * 3.2);
        ctx.beginPath();
        ctx.moveTo(c.x * tw + tw / 2, c.y * tw + tw / 2);
        ctx.lineTo(c.x2 * tw + tw / 2, c.y2 * tw + tw / 2);
        ctx.strokeStyle = `rgba(180,160,255,${a})`;
        ctx.lineWidth = 2.75;
        ctx.lineCap = 'round';
        ctx.shadowColor = 'rgba(160,140,255,0.8)';
        ctx.shadowBlur = 8;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      for (const p of this.particles) {
        ctx.globalAlpha = Math.max(0, p.life * 2.2);
        ctx.beginPath();
        ctx.arc(p.x * tw, p.y * tw, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      for (const f of this.floaters) {
        ctx.globalAlpha = Math.max(0, f.life);
        ctx.fillStyle = f.color;
        ctx.font = 'bold 13px IBM Plex Mono, monospace';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0,0,0,0.55)';
        ctx.shadowBlur = 4;
        ctx.fillText(f.text, f.x * tw, f.y * tw);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }

      if (state.briefing && state.briefing.active) {
        const by = canvas.height * 0.36;
        ctx.fillStyle = 'rgba(8,12,10,0.55)';
        roundRect(ctx, canvas.width * 0.12, by, canvas.width * 0.76, 56, 16);
        ctx.fill();
        ctx.strokeStyle = 'rgba(232,196,106,0.35)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = '#efe6d4';
        ctx.font = '17px Bungee, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(state.briefing.label, canvas.width / 2, by + 28);
      }

      if (state.gameState === 'paused') {
        ctx.fillStyle = 'rgba(8,12,10,0.4)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#efe6d4';
        ctx.font = '24px Bungee, sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 12;
        ctx.fillText('PAUSE', canvas.width / 2, canvas.height / 2);
        ctx.shadowBlur = 0;
      }

      ctx.restore();
    }
  }

  global.TowerRenderer = TowerRenderer;
  global.towerHexAlpha = hexAlpha;
})(window);
