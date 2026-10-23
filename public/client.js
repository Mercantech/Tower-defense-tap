(function () {
  const pathMatch =
    location.pathname.match(/^(\/TowerDefense)(?=\/|$)/i) ||
    location.pathname.match(/^(\/Tower-defense-tap)(?=\/|$)/i);
  const BASE = pathMatch ? pathMatch[1] : '';

  function wsUrl() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}${BASE}`;
  }

  const canvas = document.getElementById('board');
  const goldEl = document.getElementById('gold');
  const livesEl = document.getElementById('lives');
  const waveEl = document.getElementById('wave');
  const scoreEl = document.getElementById('score');
  const speedLabel = document.getElementById('speed-label');
  const towerList = document.getElementById('tower-list');
  const placeHint = document.getElementById('place-hint');
  const placeBanner = document.getElementById('place-banner');
  const statusLine = document.getElementById('status-line');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayText = document.getElementById('overlay-text');
  const overlayBreakdown = document.getElementById('overlay-breakdown');
  const btnStart = document.getElementById('btn-start');
  const btnReset = document.getElementById('btn-reset');
  const btnSpeed = document.getElementById('btn-speed');
  const btnPause = document.getElementById('btn-pause');
  const btnMute = document.getElementById('btn-mute');
  const slotMeta = document.getElementById('slot-meta');
  const hub = document.getElementById('hub');
  const stage = document.getElementById('stage');
  const mapCards = document.getElementById('map-cards');
  const diffCards = document.getElementById('diff-cards');
  const enemyLegend = document.getElementById('enemy-legend');
  const waveListEl = document.getElementById('wave-list');
  const nextWaveChip = document.getElementById('next-wave-chip');
  const highscoreEl = document.getElementById('highscore');

  let ws = null;
  let state = null;
  const keysDown = new Set();
  let hoverTile = null;
  let lastUiSig = '';
  let lastHubSig = '';
  let pickMap = 'courtyard';
  let pickDiff = 'normal';
  let seenEvents = 0;
  let lastGameState = '';

  const atlas = window.TowerSprites ? new window.TowerSprites.SpriteAtlas() : null;
  const renderer = new window.TowerRenderer(canvas, atlas);
  const Sfx = window.TowerSfx;
  if (atlas) {
    atlas.load().then(() => {
      renderer.setAtlas(atlas);
      renderer.invalidateGround();
    });
  }

  function getHighscore() {
    try {
      return Number(localStorage.getItem('td_highscore') || 0);
    } catch {
      return 0;
    }
  }

  function setHighscore(score) {
    const prev = getHighscore();
    if (score > prev) {
      try {
        localStorage.setItem('td_highscore', String(score));
      } catch {
        /* ignore */
      }
    }
    if (highscoreEl) highscoreEl.textContent = String(Math.max(prev, score));
  }

  if (highscoreEl) highscoreEl.textContent = String(getHighscore());
  if (btnMute) btnMute.textContent = Sfx.isMuted() ? '✕♪' : '♪';

  function send(type, extra = {}) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type, ...extra }));
  }

  function sendAction(action, params) {
    send('action', { action, params });
  }

  function connect() {
    ws = new WebSocket(wsUrl());
    ws.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.type === 'state') {
        state = msg.data;
        if (state.mapId) pickMap = state.mapId;
        if (state.difficulty) pickDiff = state.difficulty;
        handleEvents(state.events || []);
        updateUi();
      }
    };
    ws.onclose = () => {
      statusLine.textContent = 'Forbindelse lukket — genindlæser…';
      setTimeout(connect, 1200);
    };
  }

  function handleEvents(events) {
    if (!events.length) return;
    renderer.consumeEvents(events);
    for (const ev of events) {
      if (ev.type === 'place') Sfx.place();
      else if (ev.type === 'upgrade') Sfx.upgrade();
      else if (ev.type === 'sell') Sfx.sell();
      else if (ev.type === 'shoot') Sfx.shoot();
      else if (ev.type === 'hit') Sfx.hit();
      else if (ev.type === 'kill') Sfx.kill();
      else if (ev.type === 'leak') Sfx.leak();
      else if (ev.type === 'wave') Sfx.wave();
      else if (ev.type === 'won') Sfx.win();
      else if (ev.type === 'lost') Sfx.lose();
    }
  }

  function showHub(show) {
    if (hub) hub.hidden = !show;
    if (stage) stage.hidden = show;
  }

  function renderHub() {
    if (!state || !mapCards) return;
    const sig = `${state.mapId}|${state.difficulty}|${(state.maps || []).length}`;
    if (sig === lastHubSig) {
      mapCards.querySelectorAll('[data-map]').forEach((el) => {
        el.classList.toggle('on', el.dataset.map === pickMap);
      });
      diffCards.querySelectorAll('[data-diff]').forEach((el) => {
        el.classList.toggle('on', el.dataset.diff === pickDiff);
      });
      return;
    }
    lastHubSig = sig;

    mapCards.innerHTML = (state.maps || [])
      .map(
        (m) => `<button type="button" class="map-card ${m.id === pickMap ? 'on' : ''}" data-map="${m.id}">
        <strong>${m.name}</strong>
        <span>${m.blurb}</span>
      </button>`
      )
      .join('');
    /* data-map drives soft gradient accents in CSS */

    mapCards.querySelectorAll('[data-map]').forEach((btn) => {
      btn.addEventListener('click', () => {
        Sfx.click();
        pickMap = btn.dataset.map;
        send('configure', { mapId: pickMap, difficulty: pickDiff });
      });
    });

    diffCards.innerHTML = (state.difficulties || [])
      .map(
        (d) => `<button type="button" class="diff-card ${d.id === pickDiff ? 'on' : ''}" data-diff="${d.id}">
        <strong>${d.name}</strong>
        <span>${d.id === 'hard' ? 'HP ×1.35 · −20 startguld' : 'Standard balance'}</span>
      </button>`
      )
      .join('');

    diffCards.querySelectorAll('[data-diff]').forEach((btn) => {
      btn.addEventListener('click', () => {
        Sfx.click();
        pickDiff = btn.dataset.diff;
        send('configure', { mapId: pickMap, difficulty: pickDiff });
      });
    });
  }

  function updateUi() {
    if (!state) return;

    const gs = state.gameState;
    const inRun = gs === 'playing' || gs === 'paused';
    const showReadyHub = gs === 'ready';
    showHub(showReadyHub);
    if (showReadyHub) renderHub();

    goldEl.textContent = state.gold;
    livesEl.textContent = state.lives;
    waveEl.textContent = `${state.wave}/${state.waveTotal || state.maxWaves}`;
    scoreEl.textContent = state.score;
    if (speedLabel) speedLabel.textContent = `${state.timeScale || 1}×`;
    if (btnSpeed) btnSpeed.textContent = `${state.timeScale || 1}×`;

    if (nextWaveChip) {
      const prev = state.nextWavePreview;
      if (inRun && prev) {
        nextWaveChip.hidden = false;
        nextWaveChip.textContent = `NÆSTE: ${prev.label || 'Wave ' + prev.index}`;
      } else {
        nextWaveChip.hidden = true;
      }
    }

    const sig = [
      state.selectedTowerType,
      state.canPlace,
      state.canUpgrade,
      state.gameState,
      state.gold,
      state.cursorOccupied?.level || 0,
      state.ghost?.typeId || '',
      state.wave,
      (state.towerTypes || []).length,
    ].join('|');

    if (sig !== lastUiSig) {
      lastUiSig = sig;
      towerList.innerHTML = (state.towerTypes || [])
        .map((t, i) => {
          const on = i === state.selectedTowerType ? 'on' : '';
          const afford = state.gold >= t.cost ? '' : 'broke';
          const lvl = t.levels?.[0];
          const perk = lvl?.perk || '';
          const dps = lvl?.fireRate ? Math.round(lvl.damage * lvl.fireRate) : 0;
          const tSpr = window.TowerSprites && window.TowerSprites.MAP.towers[t.id];
          const thumb = tSpr
            ? `<img class="tower-icon" src="assets/sprites/kenney-td/t${String(tSpr.top).padStart(3, '0')}.png" alt="" width="28" height="28">`
            : `<span class="tower-swatch" style="--c:${t.color}"></span>`;
          return `<button type="button" class="tower-card ${on} ${afford}" data-type="${i}">
            ${thumb}
            <div>
              <strong>${t.name}${t.antiAir ? ' ✈' : ''}</strong>
              <span>${perk}</span>
              <span class="meta">DPS ~${dps} · RNG ${lvl?.range ?? '—'}</span>
            </div>
            <span class="cost">${t.cost}g</span>
          </button>`;
        })
        .join('');

      towerList.querySelectorAll('[data-type]').forEach((btn) => {
        btn.addEventListener('click', () => {
          Sfx.click();
          sendAction('select_type', { index: Number(btn.dataset.type) });
        });
      });

      if (enemyLegend) {
        const spr = window.TowerSprites && window.TowerSprites.MAP.enemies;
        enemyLegend.innerHTML = (state.enemyLegend || [])
          .map((e) => {
            const tid = spr && spr[e.kind];
            const icon = tid
              ? `<img class="enemy-icon" src="assets/sprites/kenney-td/t${String(tid).padStart(3, '0')}.png" alt="" width="22" height="22">`
              : `<span class="enemy-dot" style="background:${e.color}"></span>`;
            return `<div class="enemy-row">
            ${icon}
            <strong>${e.label}</strong>
            <span>HP ${e.hp}${e.flying ? ' · luft' : ''}${e.armor ? ' · armor' : ''}</span>
          </div>`;
          })
          .join('');
      }

      if (waveListEl) {
        waveListEl.innerHTML = (state.waveList || [])
          .map((w) => {
            const cur = w.index === state.wave ? 'cur' : '';
            const done = w.index < state.wave ? 'done' : '';
            const boss = w.kinds.includes('boss') ? 'boss' : '';
            return `<div class="wave-row ${cur} ${done} ${boss}">
              <span>#${w.index}</span>
              <span>${w.label}</span>
            </div>`;
          })
          .join('');
      }
    }

    if (slotMeta) {
      const n = state.buildSlots.length;
      const i = (state.selectedSlot || 0) + 1;
      slotMeta.textContent = `Slot ${i}/${n} · ${state.mapName || ''} · ${String(state.difficulty || '').toUpperCase()}`;
    }

    if (state.cursorOccupied) {
      const u = state.cursorOccupied;
      if (state.canUpgrade) {
        placeHint.textContent = `Opgrader til lvl ${u.level + 1} · ${u.upgradeCost}g — ${u.perk || ''}`;
      } else if (u.maxed || u.level >= 3) {
        placeHint.textContent = `Max · ${u.perk || ''} — X sælger`;
      } else {
        placeHint.textContent = `Lvl ${u.level} · mangler ${u.upgradeCost}g`;
      }
      if (placeBanner) {
        placeBanner.hidden = false;
        placeBanner.className = 'place-banner upgrade';
        placeBanner.innerHTML = `<strong>TÅRN LVL ${u.level}</strong><span>${u.perk || 'Space opgraderer'}</span>`;
      }
    } else if (state.ghost) {
      const g = state.ghost;
      if (state.canPlace) {
        placeHint.textContent = `Placér ${g.name} · ${g.cost}g — ${g.perk || ''}`;
      } else {
        placeHint.textContent = `Mangler gold til ${g.name} (${g.cost}g)`;
      }
      if (placeBanner) {
        placeBanner.hidden = false;
        placeBanner.className = `place-banner ${state.canPlace ? 'ok' : 'no'}`;
        placeBanner.innerHTML = `<strong class="ghost-label" style="--c:${g.color}">${g.name}</strong><span>${
          state.canPlace ? g.perk || 'Space bygger' : `Kræver ${g.cost}g`
        }</span>`;
      }
    } else {
      placeHint.textContent = 'Flyt cursor · vælg tårn · byg';
      if (placeBanner) placeBanner.hidden = true;
    }

    if (gs === 'ready') {
      overlay.classList.add('hidden');
      statusLine.textContent = `${state.mapName} · ${String(state.difficulty).toUpperCase()} · vælg og start`;
      btnStart.textContent = 'START';
    } else if (gs === 'playing') {
      overlay.classList.add('hidden');
      statusLine.textContent = `Wave ${state.wave} · ${state.enemyCount} fjender · ${state.spawnRemaining} i kø`;
      btnStart.textContent = 'I GANG';
    } else if (gs === 'paused') {
      overlay.classList.add('hidden');
      statusLine.textContent = 'Pause — P for at fortsætte';
      btnStart.textContent = 'PAUSE';
    } else if (gs === 'won' || gs === 'lost') {
      overlay.classList.remove('hidden');
      setHighscore(state.score);
      if (gs === 'won') {
        overlayTitle.textContent = 'SEJR!';
        overlayText.textContent = `Fæstningen står. Score ${state.score}.`;
        statusLine.textContent = 'Du vandt';
      } else {
        overlayTitle.textContent = 'BRUDT MUR';
        overlayText.textContent = `Lives opbrugt på wave ${state.wave}. Score ${state.score}.`;
        statusLine.textContent = 'Game over';
      }
      btnStart.textContent = 'IGEN';
      const b = state.breakdown || {};
      if (overlayBreakdown) {
        overlayBreakdown.hidden = false;
        overlayBreakdown.innerHTML = `
          <div><span>Dræb</span><strong>${b.kills || 0}</strong></div>
          <div><span>Læk</span><strong>${b.leaks || 0}</strong></div>
          <div><span>Guld tjent</span><strong>${b.goldEarned || 0}</strong></div>
          <div><span>Rente</span><strong>${b.interestEarned || 0}</strong></div>
          <div><span>Call-bonus</span><strong>${b.callWaveBonus || 0}</strong></div>
          <div><span>Lives tilbage</span><strong>${b.livesLeft || 0}</strong></div>`;
      }
    }
    lastGameState = gs;
  }

  function draw() {
    if (state && stage && !stage.hidden) {
      renderer.draw(state, hoverTile);
    }
    requestAnimationFrame(draw);
  }

  function canvasToTile(ev) {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    const x = ((ev.clientX - rect.left) * sx) / state.grid.tile;
    const y = ((ev.clientY - rect.top) * sy) / state.grid.tile;
    return { x, y };
  }

  canvas.addEventListener('pointermove', (ev) => {
    if (!state) return;
    const t = canvasToTile(ev);
    hoverTile = { x: Math.floor(t.x), y: Math.floor(t.y) };
  });
  canvas.addEventListener('pointerleave', () => {
    hoverTile = null;
  });
  canvas.addEventListener('pointerdown', (ev) => {
    if (!state) return;
    Sfx.unlock();
    const t = canvasToTile(ev);
    sendAction('select_nearest', { x: t.x, y: t.y });
    if (
      (state.gameState === 'playing' || state.gameState === 'paused') &&
      state.cursor &&
      Math.floor(t.x) === state.cursor.x &&
      Math.floor(t.y) === state.cursor.y
    ) {
      setTimeout(() => sendAction('place'), 30);
    }
  });

  const holdTimers = new Map();
  function startHold(key, fn) {
    if (holdTimers.has(key)) return;
    fn();
    const id = setInterval(fn, 140);
    holdTimers.set(key, id);
  }
  function stopHold(key) {
    const id = holdTimers.get(key);
    if (id) clearInterval(id);
    holdTimers.delete(key);
  }
  function stopAllHolds() {
    for (const id of holdTimers.values()) clearInterval(id);
    holdTimers.clear();
  }

  function startFortress() {
    Sfx.unlock();
    Sfx.click();
    send('configure', { mapId: pickMap, difficulty: pickDiff });
    setTimeout(() => send('start'), 40);
  }

  function onKeyDown(e) {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) {
      e.preventDefault();
    }

    if (e.key === 'm' || e.key === 'M') {
      if (!keysDown.has(e.key)) {
        btnMute.textContent = Sfx.toggleMute() ? '✕♪' : '♪';
      }
      keysDown.add(e.key);
      return;
    }

    if (state && state.gameState === 'ready') {
      if (e.key === 'Enter' || e.key === ' ') {
        if (!keysDown.has(e.key)) startFortress();
        keysDown.add(e.key);
        return;
      }
    }

    if (e.key === 'Enter' && state && (state.gameState === 'won' || state.gameState === 'lost')) {
      if (!keysDown.has(e.key)) {
        send('reset');
      }
      keysDown.add(e.key);
      return;
    }

    if (!state || (state.gameState !== 'playing' && state.gameState !== 'paused')) {
      keysDown.add(e.key);
      return;
    }

    if (e.key === 'p' || e.key === 'P') {
      if (!keysDown.has(e.key)) sendAction('pause');
    } else if (e.key === '2') {
      if (!keysDown.has(e.key)) sendAction('speed');
    } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      startHold('left', () => sendAction('slot_left'));
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      startHold('right', () => sendAction('slot_right'));
    } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
      if (e.shiftKey) {
        if (!keysDown.has(e.key)) sendAction('type_prev');
      } else {
        startHold('up', () => sendAction('slot_up'));
      }
    } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
      if (e.shiftKey) {
        if (!keysDown.has(e.key)) sendAction('type_next');
      } else {
        startHold('down', () => sendAction('slot_down'));
      }
    } else if (e.key === 'q' || e.key === 'Q' || e.key === '[') {
      if (!keysDown.has(e.key)) sendAction('type_prev');
    } else if (e.key === 'e' || e.key === 'E' || e.key === ']') {
      if (!keysDown.has(e.key)) sendAction('type_next');
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (!keysDown.has(e.key)) sendAction('jump_empty');
    } else if (e.key === ' ' || e.key === 'Enter') {
      if (!keysDown.has(e.key)) sendAction('place');
    } else if (e.key === 'x' || e.key === 'X') {
      if (!keysDown.has(e.key)) sendAction('sell');
    } else if (e.key === 'n' || e.key === 'N') {
      if (!keysDown.has(e.key)) sendAction('next_wave');
    } else if (e.key >= '1' && e.key <= '6') {
      if (!keysDown.has(e.key)) sendAction('select_type', { index: Number(e.key) - 1 });
    }

    keysDown.add(e.key);
  }

  function onKeyUp(e) {
    keysDown.delete(e.key);
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') stopHold('left');
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') stopHold('right');
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') stopHold('up');
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') stopHold('down');
  }

  window.addEventListener('blur', stopAllHolds);

  document.getElementById('btn-hub-start')?.addEventListener('click', startFortress);

  btnStart.addEventListener('click', () => {
    Sfx.unlock();
    if (state && state.gameState === 'ready') {
      startFortress();
    } else if (state && (state.gameState === 'won' || state.gameState === 'lost')) {
      send('reset');
    } else if (state && state.gameState === 'paused') {
      sendAction('pause');
    }
  });
  btnReset.addEventListener('click', () => {
    Sfx.click();
    send('reset');
  });
  btnSpeed?.addEventListener('click', () => sendAction('speed'));
  btnPause?.addEventListener('click', () => sendAction('pause'));
  btnMute?.addEventListener('click', () => {
    btnMute.textContent = Sfx.toggleMute() ? '✕♪' : '♪';
  });

  document.querySelectorAll('[data-nav]').forEach((btn) => {
    const action = btn.getAttribute('data-nav');
    const fire = () => sendAction(action);
    btn.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      startHold(`btn-${action}`, fire);
    });
    btn.addEventListener('pointerup', () => stopHold(`btn-${action}`));
    btn.addEventListener('pointerleave', () => stopHold(`btn-${action}`));
    btn.addEventListener('pointercancel', () => stopHold(`btn-${action}`));
  });

  document.getElementById('btn-place')?.addEventListener('click', () => sendAction('place'));
  document.getElementById('btn-jump')?.addEventListener('click', () => sendAction('jump_empty'));
  document.getElementById('btn-sell')?.addEventListener('click', () => sendAction('sell'));
  document.getElementById('btn-next-wave')?.addEventListener('click', () => sendAction('next_wave'));

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);

  connect();
  requestAnimationFrame(draw);
})();
