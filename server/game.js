/**
 * Tower Defense Tap — singleplayer game engine
 * 5-button friendly: move slot cursor, cycle tower type, place/upgrade
 */

const TICK_MS = 1000 / 30;
const GRID_W = 14;
const GRID_H = 10;
const TILE = 48;
const START_GOLD = 120;
const START_LIVES = 20;
const MAX_WAVES = 12;

const TOWER_TYPES = [
  {
    id: 'arrow',
    name: 'ARROW',
    cost: 40,
    upgradeCost: 30,
    range: 2.4,
    damage: 12,
    fireRate: 0.55,
    color: '#f4d35e',
  },
  {
    id: 'cannon',
    name: 'CANNON',
    cost: 70,
    upgradeCost: 45,
    range: 2.0,
    damage: 28,
    fireRate: 1.1,
    splash: 0.85,
    color: '#e76f51',
  },
  {
    id: 'frost',
    name: 'FROST',
    cost: 55,
    upgradeCost: 35,
    range: 2.2,
    damage: 8,
    fireRate: 0.7,
    slow: 0.55,
    slowMs: 1200,
    color: '#4cc9f0',
  },
];

/** Snake path through the fortress courtyard (tile coords). */
const PATH = [
  [0, 4],
  [1, 4],
  [2, 4],
  [3, 4],
  [3, 5],
  [3, 6],
  [3, 7],
  [4, 7],
  [5, 7],
  [6, 7],
  [7, 7],
  [7, 6],
  [7, 5],
  [7, 4],
  [7, 3],
  [7, 2],
  [8, 2],
  [9, 2],
  [10, 2],
  [11, 2],
  [11, 3],
  [11, 4],
  [11, 5],
  [12, 5],
  [13, 5],
];

function pathSet() {
  return new Set(PATH.map(([x, y]) => `${x},${y}`));
}

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

class TowerDefenseGame {
  constructor() {
    this.path = PATH.map(([x, y]) => ({ x, y }));
    this.pathKeys = pathSet();
    this.buildSlots = this._computeBuildSlots();
    this.reset();
  }

  _computeBuildSlots() {
    const slots = [];
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    const seen = new Set();
    for (const [px, py] of PATH) {
      for (const [dx, dy] of dirs) {
        const x = px + dx;
        const y = py + dy;
        const key = `${x},${y}`;
        if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) continue;
        if (this.pathKeys.has(key) || seen.has(key)) continue;
        seen.add(key);
        slots.push({ x, y });
      }
    }
    // Stable left-to-right then top-to-bottom for pad navigation
    slots.sort((a, b) => a.y - b.y || a.x - b.x);
    return slots;
  }

  reset() {
    this.gold = START_GOLD;
    this.lives = START_LIVES;
    this.wave = 0;
    this.score = 0;
    this.gameState = 'ready'; // ready | playing | won | lost
    this.selectedSlot = 0;
    this.selectedTowerType = 0;
    this.towers = new Map(); // "x,y" -> tower
    this.enemies = [];
    this.projectiles = [];
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.wavePause = 0;
    this.autoWave = true;
    this._entityId = 0;
    this._lastTs = Date.now();
  }

  nextEntityId() {
    return `e_${++this._entityId}`;
  }

  start() {
    if (this.gameState === 'playing') return false;
    this.reset();
    this.gameState = 'playing';
    this._startWave(1);
    this._lastTs = Date.now();
    return true;
  }

  _startWave(n) {
    this.wave = n;
    this.spawnQueue = [];
    const count = 6 + n * 2;
    const hp = 28 + n * 14;
    const speed = 1.35 + n * 0.08;
    for (let i = 0; i < count; i++) {
      this.spawnQueue.push({
        hp,
        maxHp: hp,
        speed,
        bounty: 6 + Math.floor(n * 1.5),
        kind: n % 4 === 0 && i % 5 === 0 ? 'tank' : 'grunt',
      });
    }
    // Tanks
    if (n >= 3) {
      this.spawnQueue.push({
        hp: hp * 2.5,
        maxHp: hp * 2.5,
        speed: speed * 0.65,
        bounty: 18 + n * 2,
        kind: 'tank',
      });
    }
    this.spawnTimer = 0.6;
    this.wavePause = 0;
  }

  setSlotCursor(delta) {
    if (!this.buildSlots.length) return;
    const n = this.buildSlots.length;
    this.selectedSlot = ((this.selectedSlot + delta) % n + n) % n;
  }

  setSlotIndex(index) {
    if (!this.buildSlots.length) return;
    this.selectedSlot = clamp(index, 0, this.buildSlots.length - 1);
  }

  cycleTowerType(delta) {
    const n = TOWER_TYPES.length;
    this.selectedTowerType = ((this.selectedTowerType + delta) % n + n) % n;
  }

  /** Pad / keyboard action envelope */
  applyAction(action, params = {}) {
    const a = String(action || '').toLowerCase();
    if (a === 'start') return this.start();
    if (a === 'reset') {
      this.reset();
      return true;
    }
    if (this.gameState !== 'playing' && a !== 'start') return false;

    if (a === 'slot_left' || a === 'left') {
      this.setSlotCursor(-1);
      return true;
    }
    if (a === 'slot_right' || a === 'right') {
      this.setSlotCursor(1);
      return true;
    }
    if (a === 'type_prev' || a === 'up') {
      this.cycleTowerType(-1);
      return true;
    }
    if (a === 'type_next' || a === 'down') {
      this.cycleTowerType(1);
      return true;
    }
    if (a === 'place' || a === 'confirm' || a === 'bomb') {
      return this.placeOrUpgrade();
    }
    if (a === 'sell') {
      return this.sellAtCursor();
    }
    if (a === 'next_wave') {
      return this.forceNextWave();
    }
    if (a === 'select_slot' && params.index != null) {
      this.setSlotIndex(Number(params.index));
      return true;
    }
    if (a === 'select_type' && params.index != null) {
      this.selectedTowerType = clamp(Number(params.index), 0, TOWER_TYPES.length - 1);
      return true;
    }
    return false;
  }

  placeOrUpgrade() {
    if (this.gameState !== 'playing') return false;
    const slot = this.buildSlots[this.selectedSlot];
    if (!slot) return false;
    const key = `${slot.x},${slot.y}`;
    const existing = this.towers.get(key);
    if (existing) {
      const def = TOWER_TYPES.find((t) => t.id === existing.typeId);
      if (!def || existing.level >= 3) return false;
      if (this.gold < def.upgradeCost) return false;
      this.gold -= def.upgradeCost;
      existing.level += 1;
      existing.damage = Math.round(def.damage * (1 + 0.45 * (existing.level - 1)));
      existing.range = def.range * (1 + 0.12 * (existing.level - 1));
      return true;
    }
    const def = TOWER_TYPES[this.selectedTowerType];
    if (!def || this.gold < def.cost) return false;
    this.gold -= def.cost;
    this.towers.set(key, {
      id: this.nextEntityId(),
      typeId: def.id,
      x: slot.x,
      y: slot.y,
      level: 1,
      damage: def.damage,
      range: def.range,
      fireRate: def.fireRate,
      cooldown: 0,
      splash: def.splash || 0,
      slow: def.slow || 0,
      slowMs: def.slowMs || 0,
      color: def.color,
    });
    return true;
  }

  sellAtCursor() {
    const slot = this.buildSlots[this.selectedSlot];
    if (!slot) return false;
    const key = `${slot.x},${slot.y}`;
    const t = this.towers.get(key);
    if (!t) return false;
    const def = TOWER_TYPES.find((d) => d.id === t.typeId);
    const refund = Math.floor(((def?.cost || 40) + (t.level - 1) * (def?.upgradeCost || 30)) * 0.6);
    this.gold += refund;
    this.towers.delete(key);
    return true;
  }

  forceNextWave() {
    if (this.gameState !== 'playing') return false;
    if (this.spawnQueue.length > 0 || this.enemies.length > 0) return false;
    if (this.wave >= MAX_WAVES) return false;
    this._startWave(this.wave + 1);
    return true;
  }

  tick() {
    if (this.gameState !== 'playing') return;
    const now = Date.now();
    const dt = Math.min(0.08, (now - this._lastTs) / 1000);
    this._lastTs = now;

    this._spawn(dt);
    this._moveEnemies(dt);
    this._towersFire(dt);
    this._moveProjectiles(dt);
    this._checkWaveClear();
  }

  _spawn(dt) {
    if (this.spawnQueue.length === 0) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    const spec = this.spawnQueue.shift();
    const start = this.path[0];
    this.enemies.push({
      id: this.nextEntityId(),
      x: start.x,
      y: start.y,
      pathIndex: 0,
      progress: 0,
      hp: spec.hp,
      maxHp: spec.maxHp,
      speed: spec.speed,
      bounty: spec.bounty,
      kind: spec.kind,
      slowUntil: 0,
    });
    this.spawnTimer = 0.55;
  }

  _moveEnemies(dt) {
    const now = Date.now();
    const survivors = [];
    for (const e of this.enemies) {
      let spd = e.speed;
      if (now < e.slowUntil) spd *= 0.55;
      e.progress += spd * dt;
      while (e.progress >= 1 && e.pathIndex < this.path.length - 1) {
        e.progress -= 1;
        e.pathIndex += 1;
      }
      if (e.pathIndex >= this.path.length - 1 && e.progress >= 1) {
        this.lives -= e.kind === 'tank' ? 2 : 1;
        if (this.lives <= 0) {
          this.lives = 0;
          this.gameState = 'lost';
        }
        continue;
      }
      const a = this.path[e.pathIndex];
      const b = this.path[Math.min(e.pathIndex + 1, this.path.length - 1)];
      e.x = a.x + (b.x - a.x) * Math.min(1, e.progress);
      e.y = a.y + (b.y - a.y) * Math.min(1, e.progress);
      survivors.push(e);
    }
    this.enemies = survivors;
  }

  _towersFire(dt) {
    for (const t of this.towers.values()) {
      t.cooldown -= dt;
      if (t.cooldown > 0) continue;
      let target = null;
      for (const e of this.enemies) {
        const d = dist(t.x + 0.5, t.y + 0.5, e.x + 0.5, e.y + 0.5);
        if (d > t.range) continue;
        if (
          !target ||
          e.pathIndex > target.pathIndex ||
          (e.pathIndex === target.pathIndex && e.progress > target.progress)
        ) {
          target = e;
        }
      }
      if (!target) continue;
      t.cooldown = t.fireRate;
      this.projectiles.push({
        id: this.nextEntityId(),
        x: t.x + 0.5,
        y: t.y + 0.5,
        tx: target.x + 0.5,
        ty: target.y + 0.5,
        targetId: target.id,
        damage: t.damage,
        splash: t.splash,
        slow: t.slow,
        slowMs: t.slowMs,
        speed: 9,
        color: t.color,
      });
    }
  }

  _moveProjectiles(dt) {
    const left = [];
    for (const p of this.projectiles) {
      const target = this.enemies.find((e) => e.id === p.targetId);
      if (target) {
        p.tx = target.x + 0.5;
        p.ty = target.y + 0.5;
      }
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const step = p.speed * dt;
      if (step >= d) {
        this._hit(p, target);
      } else {
        p.x += (dx / d) * step;
        p.y += (dy / d) * step;
        left.push(p);
      }
    }
    this.projectiles = left;
  }

  _hit(p, primary) {
    const now = Date.now();
    const apply = (e) => {
      if (!e) return;
      e.hp -= p.damage;
      if (p.slow > 0) e.slowUntil = now + p.slowMs;
      if (e.hp <= 0) {
        this.gold += e.bounty;
        this.score += e.bounty * 10;
        this.enemies = this.enemies.filter((x) => x.id !== e.id);
      }
    };
    apply(primary);
    if (p.splash > 0) {
      for (const e of [...this.enemies]) {
        if (primary && e.id === primary.id) continue;
        if (dist(p.tx, p.ty, e.x + 0.5, e.y + 0.5) <= p.splash) {
          e.hp -= Math.round(p.damage * 0.55);
          if (e.hp <= 0) {
            this.gold += e.bounty;
            this.score += e.bounty * 10;
            this.enemies = this.enemies.filter((x) => x.id !== e.id);
          }
        }
      }
    }
  }

  _checkWaveClear() {
    if (this.gameState !== 'playing') return;
    if (this.spawnQueue.length > 0 || this.enemies.length > 0) return;
    if (this.wave >= MAX_WAVES) {
      this.gameState = 'won';
      this.score += this.lives * 100 + this.gold;
      return;
    }
    this.wavePause += TICK_MS / 1000;
    if (this.autoWave && this.wavePause > 2.2) {
      this._startWave(this.wave + 1);
    }
  }

  getState() {
    const slot = this.buildSlots[this.selectedSlot] || null;
    const type = TOWER_TYPES[this.selectedTowerType];
    const occupied = slot ? this.towers.get(`${slot.x},${slot.y}`) : null;
    return {
      grid: { width: GRID_W, height: GRID_H, tile: TILE },
      path: this.path,
      buildSlots: this.buildSlots,
      towers: [...this.towers.values()],
      enemies: this.enemies.map((e) => ({
        id: e.id,
        x: e.x,
        y: e.y,
        hp: e.hp,
        maxHp: e.maxHp,
        kind: e.kind,
      })),
      projectiles: this.projectiles.map((p) => ({
        id: p.id,
        x: p.x,
        y: p.y,
        color: p.color,
      })),
      gold: this.gold,
      lives: this.lives,
      wave: this.wave,
      maxWaves: MAX_WAVES,
      score: this.score,
      gameState: this.gameState,
      selectedSlot: this.selectedSlot,
      selectedTowerType: this.selectedTowerType,
      towerTypes: TOWER_TYPES,
      cursor: slot,
      canPlace: !!(
        this.gameState === 'playing' &&
        slot &&
        !occupied &&
        this.gold >= type.cost
      ),
      canUpgrade: !!(
        this.gameState === 'playing' &&
        occupied &&
        occupied.level < 3 &&
        this.gold >= (TOWER_TYPES.find((t) => t.id === occupied.typeId)?.upgradeCost || 999)
      ),
      spawnRemaining: this.spawnQueue.length,
      enemyCount: this.enemies.length,
    };
  }
}

module.exports = { TowerDefenseGame, TICK_MS, TOWER_TYPES, GRID_W, GRID_H };
