/**
 * Tower definitions + upgrade tiers for Tower Defense Tap.
 */

const TOWER_ORDER = ['arrow', 'cannon', 'frost', 'sniper', 'barracks', 'arc'];

const TOWERS = {
  arrow: {
    id: 'arrow',
    name: 'ARROW',
    cost: 40,
    color: '#6b8f71',
    antiAir: false,
    damageType: 'physical',
    levels: [
      { damage: 12, range: 2.2, fireRate: 1.4, splash: 0, slow: 0, pierce: 0, crit: 0, chain: 0, auraRate: 0, perk: 'Hurtig single-target' },
      { damage: 18, range: 2.5, fireRate: 1.65, splash: 0, slow: 0, pierce: 0, crit: 0, chain: 0, auraRate: 0, perk: '+DPS' },
      { damage: 24, range: 2.7, fireRate: 1.85, splash: 0, slow: 0, pierce: 1, crit: 0, chain: 0, auraRate: 0, perk: 'Piercing (næste i sti)' },
    ],
  },
  cannon: {
    id: 'cannon',
    name: 'CANNON',
    cost: 65,
    color: '#c45c26',
    antiAir: false,
    damageType: 'physical',
    levels: [
      { damage: 22, range: 2.0, fireRate: 0.7, splash: 0.9, slow: 0, pierce: 0, crit: 0, chain: 0, auraRate: 0, perk: 'Splash' },
      { damage: 32, range: 2.2, fireRate: 0.8, splash: 1.1, slow: 0, pierce: 0, crit: 0, chain: 0, auraRate: 0, perk: 'Mere splash' },
      { damage: 44, range: 2.4, fireRate: 0.9, splash: 1.55, slow: 0, pierce: 0, crit: 0, chain: 0, auraRate: 0, perk: 'Stor splash' },
    ],
  },
  frost: {
    id: 'frost',
    name: 'FROST',
    cost: 55,
    color: '#4a90a4',
    antiAir: false,
    damageType: 'magic',
    levels: [
      { damage: 6, range: 2.1, fireRate: 1.0, splash: 0, slow: 0.45, pierce: 0, crit: 0, chain: 0, auraRate: 0, perk: 'Slow 45%' },
      { damage: 9, range: 2.3, fireRate: 1.15, splash: 0.7, slow: 0.55, pierce: 0, crit: 0, chain: 0, auraRate: 0, perk: 'Splash-slow' },
      { damage: 12, range: 2.5, fireRate: 1.25, splash: 1.0, slow: 0.68, pierce: 0, crit: 0, chain: 0, auraRate: 0, perk: 'Stærk splash-slow' },
    ],
  },
  sniper: {
    id: 'sniper',
    name: 'SNIPER',
    cost: 85,
    color: '#8b5a2b',
    antiAir: true,
    damageType: 'physical',
    levels: [
      { damage: 45, range: 4.0, fireRate: 0.45, splash: 0, slow: 0, pierce: 0, crit: 0, chain: 0, auraRate: 0, perk: 'Lang range · anti-air' },
      { damage: 65, range: 4.4, fireRate: 0.5, splash: 0, slow: 0, pierce: 0, crit: 0.15, chain: 0, auraRate: 0, perk: 'Crit 15%' },
      { damage: 90, range: 4.8, fireRate: 0.55, splash: 0, slow: 0, pierce: 0, crit: 0.3, chain: 0, auraRate: 0, perk: 'Crit 30%' },
    ],
  },
  barracks: {
    id: 'barracks',
    name: 'BARRACKS',
    cost: 70,
    color: '#b8860b',
    antiAir: false,
    damageType: 'support',
    levels: [
      { damage: 0, range: 2.0, fireRate: 0, splash: 0, slow: 0, pierce: 0, crit: 0, chain: 0, auraRate: 0.1, perk: 'Aura +10% fire rate' },
      { damage: 0, range: 2.3, fireRate: 0, splash: 0, slow: 0, pierce: 0, crit: 0, chain: 0, auraRate: 0.15, perk: 'Aura +15%' },
      { damage: 0, range: 2.6, fireRate: 0, splash: 0, slow: 0, pierce: 0, crit: 0, chain: 0, auraRate: 0.22, perk: 'Aura +22%' },
    ],
  },
  arc: {
    id: 'arc',
    name: 'ARC',
    cost: 95,
    color: '#7b68ee',
    antiAir: true,
    damageType: 'magic',
    levels: [
      { damage: 18, range: 2.6, fireRate: 0.85, splash: 0, slow: 0, pierce: 0, crit: 0, chain: 1, auraRate: 0, perk: 'Chain 1 hop · anti-air' },
      { damage: 26, range: 2.9, fireRate: 0.95, splash: 0, slow: 0, pierce: 0, crit: 0, chain: 2, auraRate: 0, perk: 'Chain 2 hops' },
      { damage: 36, range: 3.2, fireRate: 1.05, splash: 0, slow: 0, pierce: 0, crit: 0, chain: 3, auraRate: 0, perk: 'Chain 3 hops' },
    ],
  },
};

function getTower(id) {
  return TOWERS[id] || TOWERS.arrow;
}

function listTowers() {
  return TOWER_ORDER.map((id) => {
    const t = TOWERS[id];
    return {
      id: t.id,
      name: t.name,
      cost: t.cost,
      color: t.color,
      antiAir: t.antiAir,
      damageType: t.damageType,
      levels: t.levels.map((l, i) => ({
        level: i + 1,
        damage: l.damage,
        range: l.range,
        fireRate: l.fireRate,
        splash: l.splash,
        slow: l.slow,
        pierce: l.pierce,
        crit: l.crit,
        chain: l.chain,
        auraRate: l.auraRate,
        perk: l.perk,
        upgradeCost: Math.round(t.cost * (0.7 + i * 0.35)),
      })),
    };
  });
}

function upgradeCost(typeId, fromLevel) {
  const t = getTower(typeId);
  return Math.round(t.cost * (0.7 + (fromLevel - 1) * 0.35));
}

module.exports = { TOWERS, TOWER_ORDER, getTower, listTowers, upgradeCost };
