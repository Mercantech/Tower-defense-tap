/**
 * Enemy archetypes for Tower Defense Tap.
 */

const ENEMIES = {
  grunt: {
    kind: 'grunt',
    label: 'Grunt',
    hp: 40,
    speed: 1.35,
    bounty: 4,
    livesCost: 1,
    color: '#e8a838',
    radius: 0.28,
    flying: false,
    armor: 0,
  },
  tank: {
    kind: 'tank',
    label: 'Tank',
    hp: 140,
    speed: 0.72,
    bounty: 12,
    livesCost: 2,
    color: '#c45c26',
    radius: 0.38,
    flying: false,
    armor: 0.15,
  },
  runner: {
    kind: 'runner',
    label: 'Runner',
    hp: 28,
    speed: 2.4,
    bounty: 5,
    livesCost: 1,
    color: '#7ec8e3',
    radius: 0.24,
    flying: false,
    armor: 0,
  },
  swarm: {
    kind: 'swarm',
    label: 'Swarm',
    hp: 14,
    speed: 1.7,
    bounty: 2,
    livesCost: 1,
    color: '#a8d44a',
    radius: 0.2,
    flying: false,
    armor: 0,
  },
  armored: {
    kind: 'armored',
    label: 'Armored',
    hp: 90,
    speed: 1.0,
    bounty: 9,
    livesCost: 1,
    color: '#8a9aa8',
    radius: 0.32,
    flying: false,
    armor: 0.45,
  },
  flying: {
    kind: 'flying',
    label: 'Flying',
    hp: 35,
    speed: 1.55,
    bounty: 7,
    livesCost: 1,
    color: '#c9a0ff',
    radius: 0.26,
    flying: true,
    armor: 0,
  },
  boss: {
    kind: 'boss',
    label: 'Boss',
    hp: 520,
    speed: 0.55,
    bounty: 60,
    livesCost: 5,
    color: '#e04040',
    radius: 0.48,
    flying: false,
    armor: 0.25,
  },
};

function getEnemy(kind) {
  return ENEMIES[kind] || ENEMIES.grunt;
}

function listEnemies() {
  return Object.values(ENEMIES).map((e) => ({
    kind: e.kind,
    label: e.label,
    hp: e.hp,
    speed: e.speed,
    bounty: e.bounty,
    livesCost: e.livesCost,
    flying: e.flying,
    armor: e.armor,
    color: e.color,
  }));
}

module.exports = { ENEMIES, getEnemy, listEnemies };
