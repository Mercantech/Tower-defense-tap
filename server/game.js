/**
 * Tower Defense Tap — simulation engine (data-driven content)
 */

const { GRID_W, GRID_H, listMaps, getMap } = require('./content/maps');
const { getEnemy, listEnemies } = require('./content/enemies');
const { TOWER_ORDER, getTower, listTowers, upgradeCost } = require('./content/towers');
const { DIFFICULTIES, getWaves, wavePreview } = require('./content/waves');

const TICK_MS = 1000 / 30;
const TILE = 48;
const START_GOLD = 120;
const START_LIVES = 20;
const SELL_REFUND = 0.6;
const CALL_WAVE_BONUS = 8;
const INTEREST_RATE = 0.01;
const INTEREST_CAP = 5;
const WAVE_BRIEF_MS = 1500;
const SLOW_DURATION_MS = 1400;

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

class TowerDefenseGame {
  constructor() {
    this.mapId = 'courtyard';
    this.difficulty = 'normal';
    this._loadMap(this.mapId);
    this.reset();
  }

  _loadMap(mapId) {
    const map = getMap(mapId);
    this.mapId = map.id;
    this.mapName = map.name;
    this.path = map.path.map(([x, y]) => ({ x, y }));
    this.pathKeys = new Set(map.path.map(([x, y]) => `${x},${y}`));
    this.buildSlots = this._computeBuildSlots();
    this.waves = getWaves(this.mapId, this.difficulty);
    this.maxWaves = this.waves.length;
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
    for (const p of this.path) {
      for (const [dx, dy] of dirs) {
        const x = p.x + dx;
        const y = p.y + dy;
        const key = `${x},${y}`;
        if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) continue;
        if (this.pathKeys.has(key) || seen.has(key)) continue;
        seen.add(key);
        slots.push({ x, y });
      }
    }
    slots.sort((a, b) => a.y - b.y || a.x - b.x);
    return slots;
  }

  configure({ mapId, difficulty } = {}) {
    if (this.gameState === 'playing' || this.gameState === 'paused') return false;
    if (mapId && getMap(mapId)) this.mapId = mapId;
    if (difficulty && DIFFICULTIES[difficulty]) this.difficulty = difficulty;
    this._loadMap(this.mapId);
    this.reset(false);
    return true;
  }

  reset(keepConfig = true) {
    if (!keepConfig) {
      /* map already loaded */
    } else {
      this._loadMap(this.mapId);
    }
    const diff = DIFFICULTIES[this.difficulty] || DIFFICULTIES.normal;
    this.gold = Math.max(40, START_GOLD + (diff.startGoldDelta || 0));
    this.lives = START_LIVES;
    this.wave = 0;
    this.score = 0;
    this.gameState = 'ready';
    this.selectedSlot = 0;
    this.selectedTowerType = 0;
    this.towers = new Map();
    this.enemies = [];
    this.projectiles = [];
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.wavePause = 0;
    this.autoWave = true;
    this.timeScale = 1;
    this.paused = false;
    this.events = [];
    this.waveBriefUntil = 0;
    this.waveBriefLabel = '';
    this.leaks = 0;
    this.kills = 0;
    this.goldEarned = 0;
    this.interestEarned = 0;
    this.callWaveBonusTotal = 0;
    this._entityId = 0;
    this._lastTs = Date.now();
    this._stats = { placed: 0, sold: 0 };
  }

  nextEntityId() {
    return `e_${++this._entityId}`;
  }

  pushEvent(ev) {
    this.events.push(ev);
    if (this.events.length > 40) this.events.shift();
  }

  start() {
    if (this.gameState === 'playing' || this.gameState === 'paused') return false;
    const mapId = this.mapId;
    const difficulty = this.difficulty;
    this.reset(true);
    this.mapId = mapId;
    this.difficulty = difficulty;
    this._loadMap(this.mapId);
    const diff = DIFFICULTIES[this.difficulty] || DIFFICULTIES.normal;
    this.gold = Math.max(40, START_GOLD + (diff.startGoldDelta || 0));
    this.gameState = 'playing';
    this.paused = false;
    this._startWave(1);
    this._lastTs = Date.now();
    return true;
  }

  _startWave(n) {
    const wave = this.waves[n - 1];
    if (!wave) return;
    this.wave = n;
    this.spawnQueue = [];
    this.wavePause = 0;

    for (const g of wave.groups) {
      const def = getEnemy(g.kind);
      const delay = g.delay || 0;
      for (let i = 0; i < g.count; i++) {
        const hp = Math.round(def.hp * (g.hpMult || 1));
        const bounty = Math.max(1, Math.round(def.bounty * (g.bountyMult || 1)));
        this.spawnQueue.push({
          kind: def.kind,
          hp,
          maxHp: hp,
          speed: def.speed,
          bounty,
          livesCost: def.livesCost,
          color: def.color,
          radius: def.radius,
          flying: def.flying,
          armor: def.armor,
          interval: g.interval,
          at: delay + i * g.interval,
        });
      }
    }
    this.spawnQueue.sort((a, b) => a.at - b.at);
    this.spawnTimer = 0;
    this._spawnElapsed = 0;

    const preview = wavePreview(wave);
    this.waveBriefLabel = preview
      ? `WAVE ${preview.index} — ${preview.label}`
      : `WAVE ${n}`;
    this.waveBriefUntil = Date.now() + WAVE_BRIEF_MS;
    this.pushEvent({ type: 'wave', wave: n, label: this.waveBriefLabel });
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

  nudgeSlot(dx, dy) {
    if (!this.buildSlots.length) return;
    const cur = this.buildSlots[this.selectedSlot];
    if (!cur) return;
    let best = -1;
    let bestScore = Infinity;
    for (let i = 0; i < this.buildSlots.length; i++) {
      if (i === this.selectedSlot) continue;
      const s = this.buildSlots[i];
      const sx = s.x - cur.x;
      const sy = s.y - cur.y;
      const proj = sx * dx + sy * dy;
      if (proj <= 0) continue;
      const perp = Math.abs(sx * -dy + sy * dx);
      const score = proj * 1.15 + perp * 2.4 + Math.hypot(sx, sy) * 0.35;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best >= 0) this.selectedSlot = best;
  }

  jumpEmptySlot() {
    if (!this.buildSlots.length) return;
    const n = this.buildSlots.length;
    for (let step = 1; step <= n; step++) {
      const i = (this.selectedSlot + step) % n;
      const s = this.buildSlots[i];
      if (!this.towers.has(`${s.x},${s.y}`)) {
        this.selectedSlot = i;
        return;
      }
    }
  }

  selectNearestSlot(tx, ty) {
    if (!this.buildSlots.length) return;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < this.buildSlots.length; i++) {
      const s = this.buildSlots[i];
      const d = Math.hypot(s.x + 0.5 - tx, s.y + 0.5 - ty);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    this.selectedSlot = best;
  }

  cycleTowerType(delta) {
    const n = TOWER_ORDER.length;
    this.selectedTowerType = ((this.selectedTowerType + delta) % n + n) % n;
  }

  togglePause() {
    if (this.gameState === 'playing') {
      this.gameState = 'paused';
      this.paused = true;
      this.pushEvent({ type: 'pause', paused: true });
      return true;
    }
    if (this.gameState === 'paused') {
      this.gameState = 'playing';
      this.paused = false;
      this._lastTs = Date.now();
      this.pushEvent({ type: 'pause', paused: false });
      return true;
    }
    return false;
  }

  cycleSpeed() {
    if (this.gameState !== 'playing' && this.gameState !== 'paused') return false;
    this.timeScale = this.timeScale >= 2 ? 1 : 2;
    this.pushEvent({ type: 'speed', timeScale: this.timeScale });
    return true;
  }

  applyAction(action, params = {}) {
    const a = String(action || '').toLowerCase();
    if (a === 'start') return this.start();
    if (a === 'reset') {
      this.reset(true);
      return true;
    }
    if (a === 'configure') {
      return this.configure(params);
    }

    const buildNav =
      a === 'slot_left' ||
      a === 'left' ||
      a === 'slot_right' ||
      a === 'right' ||
      a === 'slot_up' ||
      a === 'slot_down' ||
      a === 'slot_cycle_prev' ||
      a === 'slot_cycle_next' ||
      a === 'jump_empty' ||
      a === 'type_prev' ||
      a === 'up' ||
      a === 'type_next' ||
      a === 'down' ||
      a === 'select_slot' ||
      a === 'select_nearest' ||
      a === 'select_type';

    const alwaysOk =
      buildNav ||
      a === 'start' ||
      a === 'reset' ||
      a === 'configure' ||
      a === 'pause' ||
      a === 'speed';

    if (
      this.gameState !== 'playing' &&
      this.gameState !== 'paused' &&
      !alwaysOk
    ) {
      return false;
    }

    // During pause: allow nav, pause toggle, speed, sell/place? — place only when playing
    if (this.gameState === 'paused') {
      if (a === 'pause') return this.togglePause();
      if (a === 'speed') return this.cycleSpeed();
      if (buildNav) {
        /* fall through */
      } else if (a !== 'sell') {
        return false;
      }
    }

    if (a === 'pause') return this.togglePause();
    if (a === 'speed') return this.cycleSpeed();

    if (a === 'slot_left' || a === 'left') {
      this.nudgeSlot(-1, 0);
      return true;
    }
    if (a === 'slot_right' || a === 'right') {
      this.nudgeSlot(1, 0);
      return true;
    }
    if (a === 'slot_up') {
      this.nudgeSlot(0, -1);
      return true;
    }
    if (a === 'slot_down') {
      this.nudgeSlot(0, 1);
      return true;
    }
    if (a === 'slot_cycle_prev') {
      this.setSlotCursor(-1);
      return true;
    }
    if (a === 'slot_cycle_next') {
      this.setSlotCursor(1);
      return true;
    }
    if (a === 'jump_empty') {
      this.jumpEmptySlot();
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
    if (a === 'select_nearest' && params.x != null && params.y != null) {
      this.selectNearestSlot(Number(params.x), Number(params.y));
      return true;
    }
    if (a === 'select_type' && params.index != null) {
      this.selectedTowerType = clamp(Number(params.index), 0, TOWER_ORDER.length - 1);
      return true;
    }
    return false;
  }

  _statsForLevel(def, level) {
    const L = def.levels[clamp(level, 1, 3) - 1];
    return { ...L };
  }

  placeOrUpgrade() {
    if (this.gameState !== 'playing') return false;
    const slot = this.buildSlots[this.selectedSlot];
    if (!slot) return false;
    const key = `${slot.x},${slot.y}`;
    const existing = this.towers.get(key);
    if (existing) {
      const def = getTower(existing.typeId);
      if (!def || existing.level >= 3) return false;
      const cost = upgradeCost(existing.typeId, existing.level);
      if (this.gold < cost) return false;
      this.gold -= cost;
      existing.level += 1;
      const stats = this._statsForLevel(def, existing.level);
      Object.assign(existing, {
        damage: stats.damage,
        range: stats.range,
        fireRate: stats.fireRate,
        splash: stats.splash,
        slow: stats.slow,
        pierce: stats.pierce,
        crit: stats.crit,
        chain: stats.chain,
        auraRate: stats.auraRate,
        perk: stats.perk,
      });
      this.pushEvent({ type: 'upgrade', x: slot.x, y: slot.y, level: existing.level });
      return true;
    }
    const typeId = TOWER_ORDER[this.selectedTowerType];
    const def = getTower(typeId);
    if (!def || this.gold < def.cost) return false;
    this.gold -= def.cost;
    const stats = this._statsForLevel(def, 1);
    this.towers.set(key, {
      id: this.nextEntityId(),
      typeId: def.id,
      x: slot.x,
      y: slot.y,
      level: 1,
      damage: stats.damage,
      range: stats.range,
      fireRate: stats.fireRate,
      cooldown: 0,
      splash: stats.splash,
      slow: stats.slow,
      pierce: stats.pierce,
      crit: stats.crit,
      chain: stats.chain,
      auraRate: stats.auraRate,
      perk: stats.perk,
      color: def.color,
      antiAir: def.antiAir,
      damageType: def.damageType,
      invested: def.cost,
    });
    this._stats.placed += 1;
    this.pushEvent({ type: 'place', x: slot.x, y: slot.y, typeId: def.id });
    return true;
  }

  sellAtCursor() {
    if (this.gameState !== 'playing' && this.gameState !== 'paused') return false;
    const slot = this.buildSlots[this.selectedSlot];
    if (!slot) return false;
    const key = `${slot.x},${slot.y}`;
    const t = this.towers.get(key);
    if (!t) return false;
    const def = getTower(t.typeId);
    let invested = def.cost;
    for (let lv = 1; lv < t.level; lv++) invested += upgradeCost(t.typeId, lv);
    const refund = Math.floor(invested * SELL_REFUND);
    this.gold += refund;
    this.towers.delete(key);
    this._stats.sold += 1;
    this.pushEvent({ type: 'sell', x: slot.x, y: slot.y, gold: refund });
    return true;
  }

  forceNextWave() {
    if (this.gameState !== 'playing') return false;
    if (this.spawnQueue.length > 0 || this.enemies.length > 0) return false;
    if (this.wave >= this.maxWaves) return false;
    this.gold += CALL_WAVE_BONUS;
    this.callWaveBonusTotal += CALL_WAVE_BONUS;
    this.goldEarned += CALL_WAVE_BONUS;
    this.pushEvent({ type: 'gold', x: 0, y: 0, amount: CALL_WAVE_BONUS, reason: 'call' });
    this._startWave(this.wave + 1);
    return true;
  }

  tick() {
    if (this.gameState === 'paused') {
      this.events = [];
      return;
    }
    if (this.gameState !== 'playing') return;

    const now = Date.now();
    let dt = Math.min(0.08, (now - this._lastTs) / 1000);
    this._lastTs = now;
    dt *= this.timeScale || 1;

    this.events = [];

    this._spawn(dt);
    this._moveEnemies(dt);
    this._towersFire(dt);
    this._moveProjectiles(dt);
    this._checkWaveClear(dt);
  }

  _spawn(dt) {
    if (this.spawnQueue.length === 0) return;
    this._spawnElapsed = (this._spawnElapsed || 0) + dt;
    while (this.spawnQueue.length > 0 && this.spawnQueue[0].at <= this._spawnElapsed) {
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
        livesCost: spec.livesCost,
        color: spec.color,
        radius: spec.radius,
        flying: spec.flying,
        armor: spec.armor,
        slowUntil: 0,
        slowFactor: 1,
      });
    }
  }

  _moveEnemies(dt) {
    const now = Date.now();
    const survivors = [];
    for (const e of this.enemies) {
      let spd = e.speed;
      if (now < e.slowUntil && e.slowFactor < 1) {
        spd *= e.slowFactor;
      }
      e.progress += spd * dt;
      while (e.progress >= 1 && e.pathIndex < this.path.length - 1) {
        e.progress -= 1;
        e.pathIndex += 1;
      }
      if (e.pathIndex >= this.path.length - 1 && e.progress >= 1) {
        const cost = e.livesCost || 1;
        this.lives -= cost;
        this.leaks += 1;
        this.pushEvent({
          type: 'leak',
          x: e.x,
          y: e.y,
          lives: cost,
          kind: e.kind,
        });
        if (this.lives <= 0) {
          this.lives = 0;
          this.gameState = 'lost';
          this._finalizeScore();
          this.pushEvent({ type: 'lost', score: this.score });
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

  _auraBonus(tower) {
    let bonus = 0;
    for (const other of this.towers.values()) {
      if (other.id === tower.id) continue;
      if (!other.auraRate) continue;
      const d = dist(tower.x + 0.5, tower.y + 0.5, other.x + 0.5, other.y + 0.5);
      if (d <= other.range) bonus += other.auraRate;
    }
    return bonus;
  }

  _canTarget(tower, enemy) {
    if (enemy.flying && !tower.antiAir) return false;
    return true;
  }

  _pickTarget(tower) {
    let target = null;
    for (const e of this.enemies) {
      if (!this._canTarget(tower, e)) continue;
      const d = dist(tower.x + 0.5, tower.y + 0.5, e.x + 0.5, e.y + 0.5);
      if (d > tower.range) continue;
      if (
        !target ||
        e.pathIndex > target.pathIndex ||
        (e.pathIndex === target.pathIndex && e.progress > target.progress)
      ) {
        target = e;
      }
    }
    return target;
  }

  _towersFire(dt) {
    for (const t of this.towers.values()) {
      if (t.damageType === 'support' || t.fireRate <= 0) continue;
      const aura = this._auraBonus(t);
      const rateMult = 1 + aura;
      t.cooldown -= dt * rateMult;
      if (t.cooldown > 0) continue;
      const target = this._pickTarget(t);
      if (!target) continue;
      t.cooldown = t.fireRate > 0 ? 1 / t.fireRate : 1;

      let damage = t.damage;
      let crit = false;
      if (t.crit > 0 && Math.random() < t.crit) {
        damage = Math.round(damage * 2);
        crit = true;
      }

      this.projectiles.push({
        id: this.nextEntityId(),
        x: t.x + 0.5,
        y: t.y + 0.5,
        tx: target.x + 0.5,
        ty: target.y + 0.5,
        targetId: target.id,
        damage,
        splash: t.splash || 0,
        slow: t.slow || 0,
        pierce: t.pierce || 0,
        chain: t.chain || 0,
        damageType: t.damageType,
        speed: t.typeId === 'sniper' ? 14 : t.typeId === 'arc' ? 12 : 9,
        color: t.color,
        crit,
        fromTower: t.typeId,
      });
      this.pushEvent({
        type: 'shoot',
        x: t.x,
        y: t.y,
        typeId: t.typeId,
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

  _applyDamage(e, rawDamage, damageType) {
    if (!e) return 0;
    let dmg = rawDamage;
    if (damageType === 'physical' && e.armor > 0) {
      dmg = Math.round(dmg * (1 - e.armor));
    }
    e.hp -= dmg;
    return dmg;
  }

  _applySlow(e, slowFactor) {
    if (!e || !slowFactor || slowFactor <= 0) return;
    // slowFactor is reduction amount (0.45 = 45% slower → multiply by 0.55)
    const factor = clamp(1 - slowFactor, 0.2, 0.95);
    e.slowFactor = Math.min(e.slowFactor || 1, factor);
    e.slowUntil = Date.now() + SLOW_DURATION_MS;
  }

  _killEnemy(e) {
    if (!e || e.hp > 0) return;
    this.gold += e.bounty;
    this.goldEarned += e.bounty;
    this.score += e.bounty * 10;
    this.kills += 1;
    this.pushEvent({
      type: 'kill',
      x: e.x,
      y: e.y,
      gold: e.bounty,
      kind: e.kind,
    });
    this.enemies = this.enemies.filter((x) => x.id !== e.id);
  }

  _hit(p, primary) {
    const apply = (e, dmgMult = 1) => {
      if (!e) return;
      this._applyDamage(e, Math.round(p.damage * dmgMult), p.damageType);
      if (p.slow > 0) this._applySlow(e, p.slow);
      this.pushEvent({
        type: 'hit',
        x: e.x,
        y: e.y,
        crit: !!p.crit,
      });
      this._killEnemy(e);
    };

    apply(primary);

    // Pierce: hit next enemy further along path within 0.6 tiles of trajectory
    if (p.pierce > 0 && primary) {
      let pierced = 0;
      const candidates = this.enemies
        .filter((e) => e.id !== primary.id)
        .sort(
          (a, b) =>
            b.pathIndex - a.pathIndex || b.progress - a.progress
        );
      for (const e of candidates) {
        if (pierced >= p.pierce) break;
        if (e.pathIndex < primary.pathIndex) continue;
        if (dist(p.tx, p.ty, e.x + 0.5, e.y + 0.5) > 0.85) continue;
        apply(e, 0.7);
        pierced += 1;
      }
    }

    // Splash
    if (p.splash > 0) {
      for (const e of [...this.enemies]) {
        if (primary && e.id === primary.id) continue;
        if (dist(p.tx, p.ty, e.x + 0.5, e.y + 0.5) <= p.splash) {
          this._applyDamage(e, Math.round(p.damage * 0.55), p.damageType);
          if (p.slow > 0) this._applySlow(e, p.slow * 0.85);
          this._killEnemy(e);
        }
      }
    }

    // Chain lightning
    if (p.chain > 0 && primary) {
      let from = primary;
      const hitIds = new Set([primary.id]);
      for (let hop = 0; hop < p.chain; hop++) {
        let next = null;
        let bestD = 2.2;
        for (const e of this.enemies) {
          if (hitIds.has(e.id)) continue;
          const d = dist(from.x + 0.5, from.y + 0.5, e.x + 0.5, e.y + 0.5);
          if (d < bestD) {
            bestD = d;
            next = e;
          }
        }
        if (!next) break;
        hitIds.add(next.id);
        this.pushEvent({
          type: 'chain',
          x: from.x,
          y: from.y,
          x2: next.x,
          y2: next.y,
        });
        this._applyDamage(next, Math.round(p.damage * (0.7 - hop * 0.1)), p.damageType);
        this._killEnemy(next);
        from = next;
      }
    }
  }

  _applyInterest() {
    const gain = Math.min(INTEREST_CAP, Math.floor(this.gold * INTEREST_RATE));
    if (gain > 0) {
      this.gold += gain;
      this.interestEarned += gain;
      this.goldEarned += gain;
      this.pushEvent({ type: 'gold', amount: gain, reason: 'interest' });
    }
  }

  _finalizeScore() {
    this.score += this.lives * 100 + this.gold;
  }

  _checkWaveClear(dt) {
    if (this.gameState !== 'playing') return;
    if (this.spawnQueue.length > 0 || this.enemies.length > 0) return;
    if (this.wave >= this.maxWaves) {
      this.gameState = 'won';
      this._finalizeScore();
      this.pushEvent({ type: 'won', score: this.score });
      return;
    }
    this.wavePause += dt;
    if (this.wavePause > 0.05 && this.wavePause - dt <= 0.05) {
      this._applyInterest();
    }
    if (this.autoWave && this.wavePause > 2.2) {
      this._startWave(this.wave + 1);
    }
  }

  getState() {
    const slot = this.buildSlots[this.selectedSlot] || null;
    const typeId = TOWER_ORDER[this.selectedTowerType];
    const type = getTower(typeId);
    const typeStats = this._statsForLevel(type, 1);
    const occupied = slot ? this.towers.get(`${slot.x},${slot.y}`) : null;
    const upgradeDef = occupied ? getTower(occupied.typeId) : null;
    const nextUpgradeCost = occupied
      ? upgradeCost(occupied.typeId, occupied.level)
      : 0;
    const canUpgrade = !!(
      this.gameState === 'playing' &&
      occupied &&
      occupied.level < 3 &&
      this.gold >= nextUpgradeCost
    );
    const canPlace = !!(
      this.gameState === 'playing' &&
      slot &&
      !occupied &&
      this.gold >= type.cost
    );

    const nextWave =
      this.wave < this.maxWaves ? this.waves[this.wave] : null;
    const currentWave = this.wave > 0 ? this.waves[this.wave - 1] : null;

    const now = Date.now();
    const briefing =
      now < this.waveBriefUntil
        ? { active: true, label: this.waveBriefLabel, until: this.waveBriefUntil }
        : null;

    const towerList = listTowers();

    return {
      grid: { width: GRID_W, height: GRID_H, tile: TILE },
      path: this.path,
      buildSlots: this.buildSlots,
      towers: [...this.towers.values()].map((t) => ({
        id: t.id,
        typeId: t.typeId,
        x: t.x,
        y: t.y,
        level: t.level,
        damage: t.damage,
        range: t.range,
        fireRate: t.fireRate,
        splash: t.splash,
        slow: t.slow,
        pierce: t.pierce,
        crit: t.crit,
        chain: t.chain,
        auraRate: t.auraRate,
        perk: t.perk,
        color: t.color,
        antiAir: t.antiAir,
        damageType: t.damageType,
      })),
      enemies: this.enemies.map((e) => ({
        id: e.id,
        x: e.x,
        y: e.y,
        hp: e.hp,
        maxHp: e.maxHp,
        kind: e.kind,
        color: e.color,
        radius: e.radius,
        flying: e.flying,
        armor: e.armor,
        slowed: Date.now() < e.slowUntil,
      })),
      projectiles: this.projectiles.map((p) => ({
        id: p.id,
        x: p.x,
        y: p.y,
        color: p.color,
        crit: !!p.crit,
        fromTower: p.fromTower || null,
      })),
      events: this.events.slice(),
      gold: this.gold,
      lives: this.lives,
      wave: this.wave,
      maxWaves: this.maxWaves,
      waveTotal: this.maxWaves,
      score: this.score,
      gameState: this.gameState,
      timeScale: this.timeScale,
      paused: this.paused,
      mapId: this.mapId,
      mapName: this.mapName,
      difficulty: this.difficulty,
      maps: listMaps(),
      difficulties: Object.values(DIFFICULTIES).map((d) => ({
        id: d.id,
        name: d.name,
      })),
      enemyLegend: listEnemies(),
      selectedSlot: this.selectedSlot,
      selectedTowerType: this.selectedTowerType,
      towerTypes: towerList,
      cursor: slot,
      cursorOccupied: occupied
        ? {
            typeId: occupied.typeId,
            level: occupied.level,
            range: occupied.range,
            color: occupied.color,
            perk: occupied.perk,
            upgradeCost: nextUpgradeCost,
            maxed: occupied.level >= 3,
          }
        : null,
      ghost: !occupied
        ? {
            typeId: type.id,
            name: type.name,
            color: type.color,
            range: typeStats.range,
            cost: type.cost,
            perk: typeStats.perk,
            canAfford: this.gold >= type.cost,
            antiAir: type.antiAir,
          }
        : null,
      canPlace,
      canUpgrade,
      spawnRemaining: this.spawnQueue.length,
      enemyCount: this.enemies.length,
      nextWavePreview: wavePreview(nextWave || currentWave),
      waveList: this.waves.map((w) => ({
        index: w.index,
        label: w.label,
        kinds: [...new Set(w.groups.map((g) => g.kind))],
      })),
      briefing,
      breakdown: {
        kills: this.kills,
        leaks: this.leaks,
        goldEarned: this.goldEarned,
        interestEarned: this.interestEarned,
        callWaveBonus: this.callWaveBonusTotal,
        livesLeft: this.lives,
      },
    };
  }
}

module.exports = {
  TowerDefenseGame,
  TICK_MS,
  GRID_W,
  GRID_H,
  TILE,
  TOWER_ORDER,
};
