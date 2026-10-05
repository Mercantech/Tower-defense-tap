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
  const ctx = canvas.getContext('2d');
  const goldEl = document.getElementById('gold');
  const livesEl = document.getElementById('lives');
  const waveEl = document.getElementById('wave');
  const scoreEl = document.getElementById('score');
  const towerList = document.getElementById('tower-list');
  const placeHint = document.getElementById('place-hint');
  const placeBanner = document.getElementById('place-banner');
  const statusLine = document.getElementById('status-line');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayText = document.getElementById('overlay-text');
  const btnStart = document.getElementById('btn-start');
  const btnReset = document.getElementById('btn-reset');
  const slotMeta = document.getElementById('slot-meta');

  let ws = null;
  let state = null;
  const keysDown = new Set();
  let animT = 0;
  let hoverTile = null;
  let lastUiSig = '';

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
        updateUi();
      }
    };
    ws.onclose = () => {
      statusLine.textContent = 'Forbindelse lukket — genindlæser…';
      setTimeout(connect, 1200);
    };
  }

  function updateUi() {
    if (!state) return;
    goldEl.textContent = state.gold;
    livesEl.textContent = state.lives;
    waveEl.textContent = `${state.wave}/${state.maxWaves}`;
    scoreEl.textContent = state.score;

    const sig = [
      state.selectedTowerType,
      state.canPlace,
      state.canUpgrade,
      state.gameState,
      state.gold,
      state.cursorOccupied?.level || 0,
      state.ghost?.typeId || '',
    ].join('|');

    if (sig !== lastUiSig) {
      lastUiSig = sig;
      towerList.innerHTML = state.towerTypes
        .map((t, i) => {
          const on = i === state.selectedTowerType ? 'on' : '';
          const afford = state.gold >= t.cost ? '' : 'broke';
          return `<button type="button" class="tower-card ${on} ${afford}" data-type="${i}">
            <span class="tower-swatch" style="--c:${t.color}"></span>
            <div>
              <strong>${t.name}</strong>
              <span>DMG ${t.damage} · RNG ${t.range}</span>
            </div>
            <span class="cost">${t.cost}g</span>
          </button>`;
        })
        .join('');

      towerList.querySelectorAll('[data-type]').forEach((btn) => {
        btn.addEventListener('click', () => {
          sendAction('select_type', { index: Number(btn.dataset.type) });
        });
      });
    }

    if (slotMeta) {
      const n = state.buildSlots.length;
      const i = (state.selectedSlot || 0) + 1;
      slotMeta.textContent = `Slot ${i}/${n}`;
    }

    if (state.cursorOccupied) {
      const u = state.cursorOccupied;
      if (state.canUpgrade) {
        placeHint.textContent = `Opgrader til lvl ${u.level + 1} · ${u.upgradeCost}g`;
      } else if (u.level >= 3) {
        placeHint.textContent = 'Max level — X sælger tårnet';
      } else {
        placeHint.textContent = `Lvl ${u.level} · mangler ${u.upgradeCost}g til upgrade`;
      }
      if (placeBanner) {
        placeBanner.hidden = false;
        placeBanner.className = 'place-banner upgrade';
        placeBanner.innerHTML = `<strong>TÅRN LVL ${u.level}</strong><span>Space / TOUCH4 opgraderer</span>`;
      }
    } else if (state.ghost) {
      const g = state.ghost;
      if (state.canPlace) {
        placeHint.textContent = `Placér ${g.name} · ${g.cost}g`;
      } else {
        placeHint.textContent = `Mangler gold til ${g.name} (${g.cost}g)`;
      }
      if (placeBanner) {
        placeBanner.hidden = false;
        placeBanner.className = `place-banner ${state.canPlace ? 'ok' : 'no'}`;
        placeBanner.innerHTML = `<strong class="ghost-label" style="--c:${g.color}">${g.name}</strong><span>${
          state.canPlace ? 'Gennemsigtig preview — Space bygger' : `Kræver ${g.cost}g`
        }</span>`;
      }
    } else {
      placeHint.textContent = 'Flyt cursor · vælg tårn · byg';
      if (placeBanner) placeBanner.hidden = true;
    }

    const gs = state.gameState;
    if (gs === 'ready') {
      overlay.classList.remove('hidden');
      overlayTitle.textContent = 'FÆSTNINGEN VENTER';
      overlayText.textContent =
        'Peg på et slot, se det gennemsigtige tårn, og byg. Overlev 12 waves.';
      statusLine.textContent = 'Klar — tryk START';
      btnStart.textContent = 'START';
    } else if (gs === 'playing') {
      overlay.classList.add('hidden');
      statusLine.textContent = `Wave ${state.wave} · ${state.enemyCount} fjender · ${state.spawnRemaining} i kø`;
      btnStart.textContent = 'I GANG';
    } else if (gs === 'won') {
      overlay.classList.remove('hidden');
      overlayTitle.textContent = 'SEJR!';
      overlayText.textContent = `Fæstningen står. Score ${state.score}.`;
      statusLine.textContent = 'Du vandt';
      btnStart.textContent = 'IGEN';
    } else if (gs === 'lost') {
      overlay.classList.remove('hidden');
      overlayTitle.textContent = 'BRUDT MUR';
      overlayText.textContent = `Lives opbrugt på wave ${state.wave}. Score ${state.score}.`;
      statusLine.textContent = 'Game over';
      btnStart.textContent = 'IGEN';
    }
  }

  function hexAlpha(hex, a) {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const n = parseInt(full, 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return `rgba(${r},${g},${b},${a})`;
  }

  function drawTowerBody(cx, cy, color, level, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const r = 12 + level * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // Roof notch
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.55, cy - r * 0.15);
    ctx.lineTo(cx, cy - r * 0.95);
    ctx.lineTo(cx + r * 0.55, cy - r * 0.15);
    ctx.closePath();
    ctx.fillStyle = hexAlpha(color, 0.95);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#111';
    ctx.font = 'bold 11px IBM Plex Mono, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(level), cx, cy + 2);
    ctx.restore();
  }

  function drawRange(cx, cy, rangeTiles, tw, color, pulse) {
    const r = rangeTiles * tw;
    const a = 0.12 + pulse * 0.08;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = hexAlpha(color, a);
    ctx.fill();
    ctx.strokeStyle = hexAlpha(color, 0.45 + pulse * 0.25);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function draw() {
    animT = (animT + 1) % 360;
    const pulse = (Math.sin(animT / 12) + 1) / 2;

    if (!state) {
      requestAnimationFrame(draw);
      return;
    }

    const tw = state.grid.tile;
    const gw = state.grid.width;
    const gh = state.grid.height;
    if (canvas.width !== gw * tw || canvas.height !== gh * tw) {
      canvas.width = gw * tw;
      canvas.height = gh * tw;
    }

    // Ground checker
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#2a4a32' : '#214028';
        ctx.fillRect(x * tw, y * tw, tw, tw);
      }
    }

    // Soft vignette feel via edge stones
    ctx.fillStyle = '#3a3026';
    for (let x = 0; x < gw; x++) {
      ctx.fillRect(x * tw, 0, tw, 5);
      ctx.fillRect(x * tw, gh * tw - 5, tw, 5);
    }
    for (let y = 0; y < gh; y++) {
      ctx.fillRect(0, y * tw, 5, tw);
      ctx.fillRect(gw * tw - 5, y * tw, 5, tw);
    }

    const pathSet = new Set(state.path.map((p) => `${p.x},${p.y}`));
    const towerSet = new Set(state.towers.map((t) => `${t.x},${t.y}`));

    // Path
    for (const p of state.path) {
      ctx.fillStyle = '#c4a06a';
      ctx.fillRect(p.x * tw + 2, p.y * tw + 2, tw - 4, tw - 4);
      ctx.fillStyle = '#a8844f';
      ctx.fillRect(p.x * tw + 12, p.y * tw + 12, tw - 24, tw - 24);
    }

    // Build slots
    for (const s of state.buildSlots) {
      const key = `${s.x},${s.y}`;
      if (pathSet.has(key) || towerSet.has(key)) continue;
      const hx = s.x * tw + tw / 2;
      const hy = s.y * tw + tw / 2;
      const isHover = hoverTile && hoverTile.x === s.x && hoverTile.y === s.y;
      ctx.beginPath();
      ctx.arc(hx, hy, 7, 0, Math.PI * 2);
      ctx.fillStyle = isHover ? 'rgba(240,199,94,0.45)' : 'rgba(240,199,94,0.18)';
      ctx.fill();
      ctx.strokeStyle = isHover ? 'rgba(240,199,94,0.9)' : 'rgba(240,199,94,0.4)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Towers
    for (const t of state.towers) {
      const cx = t.x * tw + tw / 2;
      const cy = t.y * tw + tw / 2;
      const selected =
        state.cursor && state.cursor.x === t.x && state.cursor.y === t.y;
      if (selected) {
        drawRange(cx, cy, t.range, tw, t.color, pulse);
      }
      drawTowerBody(cx, cy, t.color, t.level, 1);
    }

    // Ghost preview on empty cursor slot
    if (state.cursor && state.ghost) {
      const c = state.cursor;
      const cx = c.x * tw + tw / 2;
      const cy = c.y * tw + tw / 2;
      const g = state.ghost;
      const ok = state.canPlace;
      const color = ok ? g.color : '#ff595e';
      drawRange(cx, cy, g.range, tw, color, pulse);
      // Soft footprint
      ctx.save();
      ctx.globalAlpha = 0.22 + pulse * 0.08;
      ctx.fillStyle = color;
      ctx.fillRect(c.x * tw + 6, c.y * tw + 6, tw - 12, tw - 12);
      ctx.restore();
      drawTowerBody(cx, cy, color, 1, ok ? 0.42 + pulse * 0.12 : 0.28);
      // Floating label
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = ok ? '#f3e9d2' : '#ffb4a8';
      ctx.font = 'bold 10px IBM Plex Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(ok ? `BYG ${g.name}` : `${g.cost}g`, cx, cy - tw * 0.42);
      ctx.restore();
    }

    // Cursor frame
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
      // Corner ticks for easier reading
      const tick = 8;
      const x0 = c.x * tw + pad;
      const y0 = c.y * tw + pad;
      const x1 = x0 + tw - pad * 2;
      const y1 = y0 + tw - pad * 2;
      ctx.beginPath();
      ctx.moveTo(x0, y0 + tick);
      ctx.lineTo(x0, y0);
      ctx.lineTo(x0 + tick, y0);
      ctx.moveTo(x1 - tick, y0);
      ctx.lineTo(x1, y0);
      ctx.lineTo(x1, y0 + tick);
      ctx.moveTo(x1, y1 - tick);
      ctx.lineTo(x1, y1);
      ctx.lineTo(x1 - tick, y1);
      ctx.moveTo(x0 + tick, y1);
      ctx.lineTo(x0, y1);
      ctx.lineTo(x0, y1 - tick);
      ctx.stroke();
    }

    // Enemies
    for (const e of state.enemies) {
      const cx = e.x * tw + tw / 2;
      const cy = e.y * tw + tw / 2;
      const r = e.kind === 'tank' ? 14 : 10;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = e.kind === 'tank' ? '#7b2cbf' : '#c1121f';
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.stroke();
      const pct = Math.max(0, e.hp / e.maxHp);
      ctx.fillStyle = '#222';
      ctx.fillRect(cx - 12, cy - r - 8, 24, 4);
      ctx.fillStyle = pct > 0.4 ? '#8ac926' : '#ff595e';
      ctx.fillRect(cx - 12, cy - r - 8, 24 * pct, 4);
    }

    // Projectiles
    for (const p of state.projectiles) {
      ctx.beginPath();
      ctx.arc(p.x * tw, p.y * tw, 4, 0, Math.PI * 2);
      ctx.fillStyle = p.color || '#fff';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Entry / exit
    const start = state.path[0];
    const end = state.path[state.path.length - 1];
    if (start) {
      ctx.fillStyle = 'rgba(232, 93, 4, 0.88)';
      ctx.fillRect(start.x * tw + 6, start.y * tw + 6, tw - 12, tw - 12);
      ctx.fillStyle = '#fff';
      ctx.font = '10px Bungee, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('IN', start.x * tw + tw / 2, start.y * tw + tw / 2);
    }
    if (end) {
      ctx.fillStyle = 'rgba(193, 18, 31, 0.92)';
      ctx.fillRect(end.x * tw + 6, end.y * tw + 6, tw - 12, tw - 12);
      ctx.fillStyle = '#fff';
      ctx.font = '10px Bungee, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('OUT', end.x * tw + tw / 2, end.y * tw + tw / 2);
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
    const t = canvasToTile(ev);
    sendAction('select_nearest', { x: t.x, y: t.y });
    // Second click on same slot places when playing
    if (
      state.gameState === 'playing' &&
      state.cursor &&
      Math.floor(t.x) === state.cursor.x &&
      Math.floor(t.y) === state.cursor.y
    ) {
      // slight delay so select_nearest applies first if needed
      setTimeout(() => sendAction('place'), 30);
    }
  });

  // Hold-to-repeat navigation
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

  function onKeyDown(e) {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) {
      e.preventDefault();
    }

    if (e.key === 'Enter' || (e.key === ' ' && (!state || state.gameState !== 'playing'))) {
      if (!state || state.gameState !== 'playing') {
        if (!keysDown.has(e.key)) send('start');
        keysDown.add(e.key);
        return;
      }
    }

    if (!state || state.gameState !== 'playing') {
      keysDown.add(e.key);
      return;
    }

    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      startHold('left', () => sendAction('slot_left'));
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      startHold('right', () => sendAction('slot_right'));
    } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
      // Shift = cycle tower type; plain = map north
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
    } else if (e.key === '1' || e.key === '2' || e.key === '3') {
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

  btnStart.addEventListener('click', () => {
    if (state && (state.gameState === 'won' || state.gameState === 'lost')) {
      send('reset');
      setTimeout(() => send('start'), 50);
    } else {
      send('start');
    }
  });
  btnReset.addEventListener('click', () => send('reset'));

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

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);

  connect();
  requestAnimationFrame(draw);
})();
