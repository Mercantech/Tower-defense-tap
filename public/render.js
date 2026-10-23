/**
 * Tower Defense Tap — canvas layers, VFX, interpolation helpers
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
      this.prevEnemies = new Map();
    }

    invalidateGround() {
      this.groundCache = null;
      this.groundKey = '';
    }

    consumeEvents(events) {
      if (!events || !events.length) return;
      for (const ev of events) {
        if (ev.type === 'kill') {
          this._burst(ev.x, ev.y, ev.kind === 'boss' ? 18 : 8, '#f4d35e');
          if (ev.gold) this._float(ev.x, ev.y, `+${ev.gold}`, '#f4d35e');
        } else if (ev.type === 'hit' && ev.crit) {
          this._float(ev.x, ev.y, 'CRIT', '#ff6b6b');
        } else if (ev.type === 'leak') {
          this.shake = Math.min(12, this.shake + 6);
          this._burst(ev.x, ev.y, 10, '#ff595e');
        } else if (ev.type === 'gold' && ev.amount) {
          this._float(0.5, 0.5, `+${ev.amount}g`, '#8ac926');
        } else if (ev.type === 'chain') {
          this.chains.push({
            x: ev.x,
            y: ev.y,
            x2: ev.x2,
            y2: ev.y2,
            life: 0.25,
          });
        } else if (ev.type === 'place' || ev.type === 'upgrade') {
          this._burst(ev.x, ev.y, 6, '#f3e9d2');
        }
      }
    }

    _burst(tx, ty, n, color) {
      for (let i = 0; i < n; i++) {
        const ang = Math.random() * Math.PI * 2;
        const sp = 0.8 + Math.random() * 2.2;
        this.particles.push({
          x: tx + 0.5,
          y: ty + 0.5,
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp,
          life: 0.35 + Math.random() * 0.35,
          color,
          r: 1.5 + Math.random() * 2.5,
        });
      }
    }

    _float(tx, ty, text, color) {
      this.floaters.push({
        x: tx + 0.5,
        y: ty + 0.2,
        text,
        color,
        life: 0.9,
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

      for (let y = 0; y < gh; y++) {
        for (let x = 0; x < gw; x++) {
          g.fillStyle = (x + y) % 2 === 0 ? '#2a4a32' : '#214028';
          g.fillRect(x * tw, y * tw, tw, tw);
        }
      }

      g.fillStyle = '#3a3026';
      for (let x = 0; x < gw; x++) {
        g.fillRect(x * tw, 0, tw, 5);
        g.fillRect(x * tw, gh * tw - 5, tw, 5);
      }
      for (let y = 0; y < gh; y++) {
        g.fillRect(0, y * tw, 5, tw);
        g.fillRect(gw * tw - 5, y * tw, 5, tw);
      }

      for (const p of state.path) {
        g.fillStyle = '#c4a06a';
        g.fillRect(p.x * tw + 2, p.y * tw + 2, tw - 4, tw - 4);
        g.fillStyle = '#a8844f';
        g.fillRect(p.x * tw + 12, p.y * tw + 12, tw - 24, tw - 24);
      }

      const pathSet = new Set(state.path.map((p) => `${p.x},${p.y}`));
      for (const s of state.buildSlots) {
        if (pathSet.has(`${s.x},${s.y}`)) continue;
        const hx = s.x * tw + tw / 2;
        const hy = s.y * tw + tw / 2;
        g.beginPath();
        g.arc(hx, hy, 5, 0, Math.PI * 2);
        g.fillStyle = 'rgba(240,199,94,0.14)';
        g.fill();
        g.strokeStyle = 'rgba(240,199,94,0.28)';
        g.lineWidth = 1;
        g.stroke();
      }

      const start = state.path[0];
      const end = state.path[state.path.length - 1];
      if (start) {
        g.fillStyle = 'rgba(232, 93, 4, 0.88)';
        g.fillRect(start.x * tw + 6, start.y * tw + 6, tw - 12, tw - 12);
        g.fillStyle = '#fff';
        g.font = '10px Bungee, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('IN', start.x * tw + tw / 2, start.y * tw + tw / 2);
      }
      if (end) {
        g.fillStyle = 'rgba(193, 18, 31, 0.92)';
        g.fillRect(end.x * tw + 6, end.y * tw + 6, tw - 12, tw - 12);
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
      // Base
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      if (typeId === 'cannon') {
        ctx.fillStyle = hexAlpha(color, 0.9);
        ctx.fillRect(cx - 4, cy - r - 4, 8, 10);
      } else if (typeId === 'frost') {
        ctx.strokeStyle = 'rgba(200,240,255,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy - r * 0.7);
        ctx.lineTo(cx, cy + r * 0.5);
        ctx.moveTo(cx - r * 0.5, cy);
        ctx.lineTo(cx + r * 0.5, cy);
        ctx.stroke();
      } else if (typeId === 'sniper') {
        ctx.fillStyle = '#222';
        ctx.fillRect(cx - 2, cy - r - 8, 4, 12);
      } else if (typeId === 'barracks') {
        ctx.fillStyle = hexAlpha(color, 0.95);
        ctx.fillRect(cx - r * 0.55, cy - r * 0.4, r * 1.1, r * 0.85);
      } else if (typeId === 'arc') {
        ctx.strokeStyle = 'rgba(220,210,255,0.95)';
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 1.5);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.55, cy - r * 0.15);
        ctx.lineTo(cx, cy - r * 0.95);
        ctx.lineTo(cx + r * 0.55, cy - r * 0.15);
        ctx.closePath();
        ctx.fillStyle = hexAlpha(color, 0.95);
        ctx.fill();
        ctx.stroke();
      }

      ctx.fillStyle = '#111';
      ctx.font = 'bold 11px IBM Plex Mono, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(level), cx, cy + 2);
      ctx.restore();
    }

    drawRange(cx, cy, rangeTiles, tw, color, pulse) {
      const ctx = this.ctx;
      const r = rangeTiles * tw;
      const a = 0.1 + pulse * 0.07;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = hexAlpha(color, a);
      ctx.fill();
      ctx.strokeStyle = hexAlpha(color, 0.4 + pulse * 0.25);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    drawEnemy(e, tw, pulse) {
      const ctx = this.ctx;
      const cx = e.x * tw + tw / 2;
      const cy = e.y * tw + tw / 2;
      const r = Math.max(7, (e.radius || 0.28) * tw);
      const color = e.color || '#c1121f';

      if (e.kind === 'boss') {
        ctx.beginPath();
        ctx.arc(cx, cy, r + 6 + pulse * 4, 0, Math.PI * 2);
        ctx.strokeStyle = hexAlpha(color, 0.35 + pulse * 0.25);
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.beginPath();
      if (e.flying) {
        ctx.ellipse(cx, cy - 2, r * 0.9, r * 0.65, 0, 0, Math.PI * 2);
      } else if (e.kind === 'tank' || e.kind === 'armored') {
        ctx.rect(cx - r, cy - r * 0.85, r * 2, r * 1.7);
      } else {
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
      }
      ctx.fillStyle = e.slowed ? hexAlpha('#4cc9f0', 0.85) : color;
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.stroke();

      if (e.flying) {
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath();
        ctx.ellipse(cx, cy + r + 2, r * 0.7, 3, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      const pct = Math.max(0, e.hp / e.maxHp);
      const bw = Math.max(20, r * 2);
      ctx.fillStyle = '#222';
      ctx.fillRect(cx - bw / 2, cy - r - 9, bw, 4);
      ctx.fillStyle = pct > 0.4 ? '#8ac926' : '#ff595e';
      ctx.fillRect(cx - bw / 2, cy - r - 9, bw * pct, 4);
    }

    updateFx(dt) {
      this.shake = Math.max(0, this.shake - dt * 18);
      this.particles = this.particles.filter((p) => {
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 2 * dt;
        return p.life > 0;
      });
      this.floaters = this.floaters.filter((f) => {
        f.life -= dt;
        f.y -= dt * 0.9;
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
        ctx.arc(hx, hy, 8, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(240,199,94,0.4)';
        ctx.fill();
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
          ctx.strokeStyle = hexAlpha(t.color, 0.15 + pulse * 0.1);
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
        const color = ok ? g.color : '#ff595e';
        this.drawRange(cx, cy, g.range, tw, color, pulse);
        ctx.save();
        ctx.globalAlpha = 0.22 + pulse * 0.08;
        ctx.fillStyle = color;
        ctx.fillRect(c.x * tw + 6, c.y * tw + 6, tw - 12, tw - 12);
        ctx.restore();
        this.drawTowerBody(cx, cy, color, 1, ok ? 0.42 + pulse * 0.12 : 0.28, g.typeId);
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = ok ? '#f3e9d2' : '#ffb4a8';
        ctx.font = 'bold 10px IBM Plex Mono, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(ok ? `BYG ${g.name}` : `${g.cost}g`, cx, cy - tw * 0.42);
        ctx.restore();
      }

      if (state.cursor) {
        const c = state.cursor;
        const pad = 2 + pulse * 2;
        ctx.strokeStyle = state.canPlace
          ? `rgba(140, 220, 120, ${0.75 + pulse * 0.25})`
          : state.canUpgrade
            ? `rgba(240, 199, 94, ${0.8 + pulse * 0.2})`
            : `rgba(240, 199, 94, ${0.55 + pulse * 0.25})`;
        ctx.lineWidth = 3;
        ctx.strokeRect(c.x * tw + pad, c.y * tw + pad, tw - pad * 2, tw - pad * 2);
      }

      for (const e of state.enemies) {
        this.drawEnemy(e, tw, pulse);
      }

      for (const p of state.projectiles) {
        const px = p.x * tw;
        const py = p.y * tw;
        ctx.beginPath();
        ctx.moveTo(px - 4, py);
        ctx.lineTo(px + 4, py);
        ctx.strokeStyle = hexAlpha(p.color || '#fff', 0.35);
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(px, py, p.crit ? 5 : 3.5, 0, Math.PI * 2);
        ctx.fillStyle = p.color || '#fff';
        ctx.fill();
      }

      for (const c of this.chains) {
        ctx.beginPath();
        ctx.moveTo(c.x * tw + tw / 2, c.y * tw + tw / 2);
        ctx.lineTo(c.x2 * tw + tw / 2, c.y2 * tw + tw / 2);
        ctx.strokeStyle = `rgba(180,160,255,${Math.max(0, c.life * 3)})`;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      for (const p of this.particles) {
        ctx.globalAlpha = Math.max(0, p.life * 2);
        ctx.beginPath();
        ctx.arc(p.x * tw, p.y * tw, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      for (const f of this.floaters) {
        ctx.globalAlpha = Math.max(0, f.life);
        ctx.fillStyle = f.color;
        ctx.font = 'bold 12px IBM Plex Mono, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(f.text, f.x * tw, f.y * tw);
        ctx.globalAlpha = 1;
      }

      if (state.briefing && state.briefing.active) {
        ctx.fillStyle = 'rgba(10,14,12,0.55)';
        ctx.fillRect(0, canvas.height * 0.38, canvas.width, 52);
        ctx.fillStyle = '#f3e9d2';
        ctx.font = '18px Bungee, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(state.briefing.label, canvas.width / 2, canvas.height * 0.38 + 26);
      }

      if (state.gameState === 'paused') {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#f3e9d2';
        ctx.font = '22px Bungee, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('PAUSE', canvas.width / 2, canvas.height / 2);
      }

      ctx.restore();
    }
  }

  global.TowerRenderer = TowerRenderer;
  global.towerHexAlpha = hexAlpha;
})(window);
