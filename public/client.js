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
  const statusLine = document.getElementById('status-line');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayText = document.getElementById('overlay-text');
  const btnStart = document.getElementById('btn-start');
  const btnReset = document.getElementById('btn-reset');

  let ws = null;
  let state = null;
  const keysDown = new Set();

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
        draw();
      }
    };
    ws.onclose = () => {
      statusLine.textContent = 'Forbindelse lukket — genindlæs';
      setTimeout(connect, 1200);
    };
  }

  function updateUi() {
    if (!state) return;
    goldEl.textContent = state.gold;
    livesEl.textContent = state.lives;
    waveEl.textContent = `${state.wave}/${state.maxWaves}`;
    scoreEl.textContent = state.score;

    towerList.innerHTML = state.towerTypes
      .map((t, i) => {
        const on = i === state.selectedTowerType ? 'on' : '';
        return `<button type="button" class="tower-card ${on}" data-type="${i}">
          <span class="tower-swatch" style="background:${t.color}"></span>
          <div><strong>${t.name}</strong><span>DMG ${t.damage} · RNG ${t.range}</span></div>
          <span class="cost">${t.cost}g</span>
        </button>`;
      })
      .join('');

    towerList.querySelectorAll('[data-type]').forEach((btn) => {
      btn.addEventListener('click', () => {
        sendAction('select_type', { index: Number(btn.dataset.type) });
      });
    });

    if (state.canUpgrade) {
      placeHint.textContent = 'Space / TOUCH4 = OPGRADER tårn på cursor';
    } else if (state.canPlace) {
      placeHint.textContent = 'Space / TOUCH4 = BYG valgt tårn';
    } else {
      placeHint.textContent = 'Flyt cursor · vælg tårn · byg når du har gold';
    }

    const gs = state.gameState;
    if (gs === 'ready') {
      overlay.classList.remove('hidden');
      overlayTitle.textContent = 'FÆSTNINGEN VENTER';
      overlayText.textContent =
        '5 knapper. Byg langs stien. Overlev 12 waves. Gør fæstningen stolt.';
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

  function draw() {
    if (!state) return;
    const tw = state.grid.tile;
    const gw = state.grid.width;
    const gh = state.grid.height;
    if (canvas.width !== gw * tw || canvas.height !== gh * tw) {
      canvas.width = gw * tw;
      canvas.height = gh * tw;
    }

    // Ground
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const shade = (x + y) % 2 === 0 ? '#2a4a32' : '#24432c';
        ctx.fillStyle = shade;
        ctx.fillRect(x * tw, y * tw, tw, tw);
      }
    }

    // Stone walls border feel
    ctx.fillStyle = '#3a3026';
    for (let x = 0; x < gw; x++) {
      ctx.fillRect(x * tw, 0, tw, 4);
      ctx.fillRect(x * tw, gh * tw - 4, tw, 4);
    }

    const pathSet = new Set(state.path.map((p) => `${p.x},${p.y}`));

    // Path
    for (const p of state.path) {
      ctx.fillStyle = '#b8955f';
      ctx.fillRect(p.x * tw + 2, p.y * tw + 2, tw - 4, tw - 4);
      ctx.fillStyle = '#a07d4a';
      ctx.fillRect(p.x * tw + 10, p.y * tw + 10, tw - 20, tw - 20);
    }

    // Build slots
    for (const s of state.buildSlots) {
      const key = `${s.x},${s.y}`;
      if (pathSet.has(key)) continue;
      ctx.strokeStyle = 'rgba(240, 199, 94, 0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(s.x * tw + 8, s.y * tw + 8, tw - 16, tw - 16);
    }

    // Cursor
    if (state.cursor) {
      const c = state.cursor;
      ctx.strokeStyle = '#f0c75e';
      ctx.lineWidth = 3;
      ctx.strokeRect(c.x * tw + 3, c.y * tw + 3, tw - 6, tw - 6);
      ctx.fillStyle = 'rgba(240, 199, 94, 0.12)';
      ctx.fillRect(c.x * tw + 3, c.y * tw + 3, tw - 6, tw - 6);
    }

    // Towers
    for (const t of state.towers) {
      const cx = t.x * tw + tw / 2;
      const cy = t.y * tw + tw / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, tw * 0.28 + t.level * 2, 0, Math.PI * 2);
      ctx.fillStyle = t.color;
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.stroke();
      // Range when selected
      if (state.cursor && state.cursor.x === t.x && state.cursor.y === t.y) {
        ctx.beginPath();
        ctx.arc(cx, cy, t.range * tw, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.fillStyle = '#111';
      ctx.font = 'bold 11px IBM Plex Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(String(t.level), cx, cy + 4);
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
      // HP bar
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
    }

    // Entry / exit markers
    const start = state.path[0];
    const end = state.path[state.path.length - 1];
    if (start) {
      ctx.fillStyle = 'rgba(232, 93, 4, 0.85)';
      ctx.fillRect(start.x * tw + 6, start.y * tw + 6, tw - 12, tw - 12);
      ctx.fillStyle = '#fff';
      ctx.font = '10px Bungee, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('IN', start.x * tw + tw / 2, start.y * tw + tw / 2 + 3);
    }
    if (end) {
      ctx.fillStyle = 'rgba(193, 18, 31, 0.9)';
      ctx.fillRect(end.x * tw + 6, end.y * tw + 6, tw - 12, tw - 12);
      ctx.fillStyle = '#fff';
      ctx.font = '10px Bungee, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('OUT', end.x * tw + tw / 2, end.y * tw + tw / 2 + 3);
    }
  }

  function onKeyDown(e) {
    if (keysDown.has(e.key)) {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) {
        e.preventDefault();
      }
      return;
    }
    keysDown.add(e.key);

    if (e.key === 'Enter' || (e.key === ' ' && (!state || state.gameState !== 'playing'))) {
      if (!state || state.gameState !== 'playing') {
        send('start');
        e.preventDefault();
        return;
      }
    }

    if (!state || state.gameState !== 'playing') return;

    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      sendAction('slot_left');
      e.preventDefault();
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      sendAction('slot_right');
      e.preventDefault();
    } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
      sendAction('type_prev');
      e.preventDefault();
    } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
      sendAction('type_next');
      e.preventDefault();
    } else if (e.key === ' ' || e.key === 'Enter') {
      sendAction('place');
      e.preventDefault();
    } else if (e.key === 'x' || e.key === 'X') {
      sendAction('sell');
      e.preventDefault();
    } else if (e.key === 'n' || e.key === 'N') {
      sendAction('next_wave');
    }
  }

  function onKeyUp(e) {
    keysDown.delete(e.key);
  }

  btnStart.addEventListener('click', () => {
    if (state && (state.gameState === 'won' || state.gameState === 'lost')) {
      send('reset');
      setTimeout(() => send('start'), 50);
    } else {
      send('start');
    }
  });
  btnReset.addEventListener('click', () => send('reset'));
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);

  connect();
})();
