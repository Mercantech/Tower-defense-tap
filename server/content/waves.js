/**
 * Wave tables per map / difficulty (18 waves). Bosses on 6 / 12 / 18.
 */

const DIFFICULTIES = {
  normal: { id: 'normal', name: 'NORMAL', hpMult: 1, bountyMult: 1, startGoldDelta: 0 },
  hard: { id: 'hard', name: 'HARD', hpMult: 1.35, bountyMult: 0.9, startGoldDelta: -20 },
};

/** Shared wave recipe: { kind, count, interval, delay? }[] plus optional label */
function baseWaves() {
  return [
    { label: 'Scouts', groups: [{ kind: 'grunt', count: 6, interval: 0.85 }] },
    { label: 'More grunts', groups: [{ kind: 'grunt', count: 10, interval: 0.7 }] },
    { label: 'Runners', groups: [{ kind: 'runner', count: 8, interval: 0.55 }] },
    { label: 'Mixed line', groups: [
      { kind: 'grunt', count: 8, interval: 0.65 },
      { kind: 'runner', count: 4, interval: 0.5, delay: 1.2 },
    ]},
    { label: 'Swarm cloud', groups: [{ kind: 'swarm', count: 16, interval: 0.28 }] },
    { label: 'BOSS — Gatekeeper', groups: [
      { kind: 'grunt', count: 6, interval: 0.6 },
      { kind: 'boss', count: 1, interval: 1, delay: 2.5 },
    ]},
    { label: 'Armored push', groups: [{ kind: 'armored', count: 6, interval: 0.9 }] },
    { label: 'Flyers', groups: [{ kind: 'flying', count: 8, interval: 0.55 }] },
    { label: 'Tank line', groups: [
      { kind: 'tank', count: 4, interval: 1.1 },
      { kind: 'grunt', count: 6, interval: 0.5, delay: 0.8 },
    ]},
    { label: 'Swarm + runners', groups: [
      { kind: 'swarm', count: 14, interval: 0.25 },
      { kind: 'runner', count: 6, interval: 0.4, delay: 1 },
    ]},
    { label: 'Air raid', groups: [
      { kind: 'flying', count: 10, interval: 0.45 },
      { kind: 'armored', count: 4, interval: 0.85, delay: 1.5 },
    ]},
    { label: 'BOSS — Siege Lord', groups: [
      { kind: 'tank', count: 3, interval: 1 },
      { kind: 'boss', count: 1, interval: 1, delay: 2 },
      { kind: 'flying', count: 4, interval: 0.5, delay: 3 },
    ]},
    { label: 'Pressure cooker', groups: [
      { kind: 'grunt', count: 12, interval: 0.4 },
      { kind: 'runner', count: 8, interval: 0.35, delay: 0.5 },
      { kind: 'swarm', count: 10, interval: 0.22, delay: 1 },
    ]},
    { label: 'Iron wall', groups: [
      { kind: 'armored', count: 8, interval: 0.7 },
      { kind: 'tank', count: 3, interval: 1.2, delay: 1 },
    ]},
    { label: 'Sky + ground', groups: [
      { kind: 'flying', count: 12, interval: 0.4 },
      { kind: 'runner', count: 8, interval: 0.35, delay: 0.8 },
    ]},
    { label: 'Everything', groups: [
      { kind: 'grunt', count: 8, interval: 0.45 },
      { kind: 'swarm', count: 12, interval: 0.22, delay: 0.4 },
      { kind: 'armored', count: 5, interval: 0.75, delay: 1 },
      { kind: 'flying', count: 6, interval: 0.45, delay: 1.5 },
    ]},
    { label: 'Final push', groups: [
      { kind: 'tank', count: 5, interval: 0.9 },
      { kind: 'runner', count: 10, interval: 0.3, delay: 0.5 },
      { kind: 'flying', count: 8, interval: 0.4, delay: 1 },
    ]},
    { label: 'BOSS — Overlord', groups: [
      { kind: 'armored', count: 6, interval: 0.65 },
      { kind: 'boss', count: 1, interval: 1, delay: 1.5 },
      { kind: 'flying', count: 8, interval: 0.4, delay: 2.5 },
      { kind: 'swarm', count: 16, interval: 0.2, delay: 3 },
    ]},
  ];
}

/** Map-specific density tweaks */
function mapWaveMods(mapId) {
  if (mapId === 'gauntlet') {
    return { countMult: 1.15, intervalMult: 0.92 };
  }
  if (mapId === 'serpent') {
    return { countMult: 1.05, intervalMult: 1.0 };
  }
  return { countMult: 1, intervalMult: 1 };
}

function getWaves(mapId, difficultyId) {
  const mods = mapWaveMods(mapId);
  const diff = DIFFICULTIES[difficultyId] || DIFFICULTIES.normal;
  return baseWaves().map((wave, i) => ({
    index: i + 1,
    label: wave.label,
    groups: wave.groups.map((g) => ({
      kind: g.kind,
      count: Math.max(1, Math.round(g.count * mods.countMult)),
      interval: Math.max(0.15, g.interval * mods.intervalMult),
      delay: g.delay || 0,
      hpMult: diff.hpMult * (g.kind === 'boss' ? 1 + i * 0.04 : 1 + i * 0.03),
      bountyMult: diff.bountyMult,
    })),
  }));
}

function wavePreview(wave) {
  if (!wave) return null;
  const kinds = [];
  const seen = new Set();
  for (const g of wave.groups) {
    if (!seen.has(g.kind)) {
      seen.add(g.kind);
      kinds.push(g.kind);
    }
  }
  return { index: wave.index, label: wave.label, kinds };
}

module.exports = { DIFFICULTIES, getWaves, wavePreview };
