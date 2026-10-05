/**
 * Tower Defense Tap — HTTP + WebSocket + Arduino controller API
 */

const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { URL } = require('url');
const { TowerDefenseGame, TICK_MS } = require('./game');

const PORT = process.env.PORT || 8080;
const game = new TowerDefenseGame();
const clients = new Set();
const controllers = new Map(); // playerId -> { name, deviceId }
let playerIdCounter = 0;
let tickInterval = null;

function sendTo(ws, type, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, data }));
  }
}

function broadcast(message) {
  const msg = typeof message === 'string' ? message : JSON.stringify(message);
  clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  });
}

function broadcastState() {
  broadcast({ type: 'state', data: game.getState() });
}

function ensureTick() {
  if (tickInterval) return;
  tickInterval = setInterval(() => {
    if (game.gameState !== 'playing') {
      clearInterval(tickInterval);
      tickInterval = null;
      broadcastState();
      return;
    }
    game.tick();
    broadcastState();
  }, TICK_MS);
}

function applyAction(action, params) {
  const ok = game.applyAction(action, params || {});
  if (action === 'start' && game.gameState === 'playing') ensureTick();
  broadcastState();
  return ok;
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => {
      body += c;
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (e) {
        reject(e);
      }
    });
  });
}

async function handleControllerApi(req, res, pathname) {
  res.setHeader('Content-Type', 'application/json');

  if (pathname === '/api/controller/join' && req.method === 'POST') {
    try {
      const { name, deviceId } = await readJson(req);
      const playerId = `pad_${++playerIdCounter}`;
      const displayName = name ? String(name).trim().slice(0, 20) : `Pad ${playerIdCounter}`;
      controllers.set(playerId, {
        name: displayName,
        deviceId: deviceId ? String(deviceId).slice(0, 40) : null,
      });
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, playerId, name: displayName }));
    } catch {
      res.writeHead(400);
      res.end(JSON.stringify({ ok: false, error: 'Ugyldig forespørgsel' }));
    }
    return;
  }

  if (pathname === '/api/controller/heartbeat' && req.method === 'POST') {
    try {
      const { playerId } = await readJson(req);
      if (playerId && !controllers.has(playerId)) {
        res.writeHead(403);
        res.end(JSON.stringify({ ok: false, error: 'Ugyldig controller' }));
        return;
      }
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, state: game.getState() }));
    } catch {
      res.writeHead(400);
      res.end(JSON.stringify({ ok: false, error: 'Ugyldig forespørgsel' }));
    }
    return;
  }

  if (
    (pathname === '/api/controller/action' || pathname === '/api/controller/input') &&
    req.method === 'POST'
  ) {
    try {
      const body = await readJson(req);
      const { playerId, action, direction, params } = body;
      if (playerId && !controllers.has(playerId)) {
        res.writeHead(403);
        res.end(JSON.stringify({ ok: false, error: 'Ugyldig controller' }));
        return;
      }

      let resolved = action || params?.action;
      // Map move directions to slot/type like the pad layout
      if (resolved === 'move') {
        const dir = String(direction || params?.direction || '').toUpperCase();
        if (dir === 'LEFT') resolved = 'slot_left';
        else if (dir === 'RIGHT') resolved = 'slot_right';
        else if (dir === 'UP') resolved = 'type_prev';
        else if (dir === 'DOWN') resolved = 'type_next';
      }
      if (resolved === 'bomb') resolved = 'place';

      const ok = applyAction(resolved, params || {});
      res.writeHead(ok ? 200 : 400);
      res.end(JSON.stringify({ ok, state: game.getState() }));
    } catch {
      res.writeHead(400);
      res.end(JSON.stringify({ ok: false, error: 'Ugyldig forespørgsel' }));
    }
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ ok: false, error: 'Not found' }));
}

const server = http.createServer(async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsed = new URL(req.url || '/', `http://localhost:${PORT}`);
  const pathname = parsed.pathname;

  if (pathname.startsWith('/api/controller/')) {
    await handleControllerApi(req, res, pathname);
    return;
  }

  if (pathname === '/api/health' && req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, service: 'tower-defense-tap' }));
    return;
  }

  if (pathname === '/api/state' && req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify(game.getState()));
    return;
  }

  let filePath = pathname === '/' || pathname === '' ? '/index.html' : pathname;
  filePath = path.join(__dirname, '..', 'public', filePath);
  const ext = path.extname(filePath);
  const types = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.ico': 'image/x-icon',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
  };

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(err.code === 'ENOENT' ? 404 : 500);
      res.end(err.code === 'ENOENT' ? 'Not found' : 'Server error');
      return;
    }
    const headers = { 'Content-Type': types[ext] || 'text/plain' };
    if (ext === '.html') headers['Cache-Control'] = 'no-cache';
    else if (ext === '.css' || ext === '.js') headers['Cache-Control'] = 'public, max-age=60';
    res.writeHead(200, headers);
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  clients.add(ws);
  sendTo(ws, 'state', game.getState());

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      const type = msg.type;
      if (type === 'start') applyAction('start');
      else if (type === 'reset') applyAction('reset');
      else if (type === 'action') applyAction(msg.action, msg.params);
      else if (type === 'input' && msg.data) {
        applyAction(msg.data.action, msg.data);
      }
    } catch {
      // ignore
    }
  });

  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
});

server.listen(PORT, () => {
  console.log(`Tower Defense Tap: http://localhost:${PORT}`);
});
