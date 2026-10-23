/**
 * Kenney Tower Defense (Top-Down) — CC0 sprite atlas
 * https://kenney.nl · https://opengameart.org/content/tower-defense-top-down
 */
(function (global) {
  const BASE = 'assets/sprites/kenney-td/';

  function tile(n) {
    return BASE + 't' + String(n).padStart(3, '0') + '.png';
  }

  /** Gameplay → Kenney tile ids */
  const MAP = {
    grass: 24,
    path: 48,
    pad: 181,
    bush: 130,
    rock: 135,
    coin: 272,
    bullet: 273,
    missile: 251,
    fire: [295, 296, 297, 298],
    towers: {
      arrow: { base: 228, top: 249 },
      cannon: { base: 228, top: 250 },
      frost: { base: 226, top: 246 },
      sniper: { base: 229, top: 206 },
      barracks: { base: 227, top: 204 },
      arc: { base: 226, top: 205 },
    },
    enemies: {
      grunt: 245,
      runner: 247,
      swarm: 247,
      tank: 248,
      armored: 248,
      flying: 271,
      boss: 249,
    },
    enemyShadow: {
      flying: 294,
    },
  };

  class SpriteAtlas {
    constructor() {
      this.images = new Map();
      this.ready = false;
      this._loadPromise = null;
    }

    load() {
      if (this._loadPromise) return this._loadPromise;
      const urls = new Set();
      urls.add(tile(MAP.grass));
      urls.add(tile(MAP.path));
      urls.add(tile(MAP.pad));
      urls.add(tile(MAP.bush));
      urls.add(tile(MAP.rock));
      urls.add(tile(MAP.coin));
      urls.add(tile(MAP.bullet));
      urls.add(tile(MAP.missile));
      MAP.fire.forEach((n) => urls.add(tile(n)));
      Object.values(MAP.towers).forEach((t) => {
        urls.add(tile(t.base));
        urls.add(tile(t.top));
      });
      Object.values(MAP.enemies).forEach((n) => urls.add(tile(n)));
      Object.values(MAP.enemyShadow).forEach((n) => urls.add(tile(n)));

      const loads = [...urls].map(
        (src) =>
          new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
              this.images.set(src, img);
              resolve();
            };
            img.onerror = () => resolve();
            img.src = src;
          })
      );

      this._loadPromise = Promise.all(loads).then(() => {
        this.ready = this.images.size > 0;
        return this.ready;
      });
      return this._loadPromise;
    }

    get(n) {
      return this.images.get(tile(n)) || null;
    }

    draw(ctx, n, x, y, w, h, rot) {
      const img = this.get(n);
      if (!img) return false;
      ctx.save();
      ctx.translate(x, y);
      if (rot) ctx.rotate(rot);
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      ctx.restore();
      return true;
    }

    drawTower(ctx, typeId, cx, cy, size, level) {
      const def = MAP.towers[typeId] || MAP.towers.arrow;
      const s = size * (0.92 + (level - 1) * 0.06);
      this.draw(ctx, def.base, cx, cy, s * 0.95, s * 0.95, 0);
      this.draw(ctx, def.top, cx, cy - 1, s, s, 0);
      return true;
    }

    drawEnemy(ctx, kind, cx, cy, size, facing) {
      const id = MAP.enemies[kind] || MAP.enemies.grunt;
      const shadow = MAP.enemyShadow[kind];
      if (shadow) {
        this.draw(ctx, shadow, cx + 2, cy + size * 0.28, size * 0.85, size * 0.45, facing || 0);
      }
      const scale = kind === 'boss' ? 1.35 : kind === 'swarm' ? 0.72 : kind === 'tank' || kind === 'armored' ? 1.15 : 1;
      return this.draw(ctx, id, cx, cy, size * scale, size * scale, facing || 0);
    }

    drawProjectile(ctx, cx, cy, size, isMissile) {
      return this.draw(ctx, isMissile ? MAP.missile : MAP.bullet, cx, cy, size, size, 0);
    }

    grass() {
      return MAP.grass;
    }
    path() {
      return MAP.path;
    }
    pad() {
      return MAP.pad;
    }
    bush() {
      return MAP.bush;
    }
    rock() {
      return MAP.rock;
    }
    coin() {
      return MAP.coin;
    }
    fireFrame(t) {
      return MAP.fire[Math.floor(t) % MAP.fire.length];
    }
  }

  global.TowerSprites = { SpriteAtlas, MAP, tile };
})(window);
