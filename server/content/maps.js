/**
 * Maps for Tower Defense Tap (14×10 grid).
 */

const GRID_W = 14;
const GRID_H = 10;

const MAPS = {
  courtyard: {
    id: 'courtyard',
    name: 'COURTYARD',
    blurb: 'Klassisk snake — balanceret',
    path: [
      [0, 4], [1, 4], [2, 4], [3, 4], [3, 5], [3, 6], [3, 7], [4, 7],
      [5, 7], [6, 7], [7, 7], [7, 6], [7, 5], [7, 4], [7, 3], [7, 2],
      [8, 2], [9, 2], [10, 2], [11, 2], [11, 3], [11, 4], [11, 5], [12, 5], [13, 5],
    ],
  },
  serpent: {
    id: 'serpent',
    name: 'SERPENT',
    blurb: 'Lang S-sti — flere slots',
    path: [
      [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [5, 2], [5, 3], [5, 4],
      [4, 4], [3, 4], [2, 4], [2, 5], [2, 6], [2, 7], [3, 7], [4, 7], [5, 7],
      [6, 7], [7, 7], [8, 7], [8, 6], [8, 5], [8, 4], [8, 3], [9, 3], [10, 3],
      [11, 3], [11, 4], [11, 5], [11, 6], [11, 7], [11, 8], [12, 8], [13, 8],
    ],
  },
  gauntlet: {
    id: 'gauntlet',
    name: 'GAUNTLET',
    blurb: 'Kort sti — højt tryk',
    path: [
      [0, 5], [1, 5], [2, 5], [3, 5], [4, 5], [5, 5], [5, 4], [5, 3],
      [6, 3], [7, 3], [8, 3], [8, 4], [8, 5], [8, 6], [9, 6], [10, 6],
      [11, 6], [12, 6], [13, 6],
    ],
  },
};

function listMaps() {
  return Object.values(MAPS).map((m) => ({
    id: m.id,
    name: m.name,
    blurb: m.blurb,
  }));
}

function getMap(id) {
  return MAPS[id] || MAPS.courtyard;
}

module.exports = { MAPS, GRID_W, GRID_H, listMaps, getMap };
