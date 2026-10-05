# Tower Defense Tap

Singleplayer **tower defense** styret med **5 knapper** (keyboard eller Arduino Oplà) — Mercantec Games-mønster.

**Idé:** Flyt cursor langs build-slots, vælg tårntype, byg/opgrader. Overlev **12 waves**.

## Kør lokalt

```bash
cd server
npm install
npm start
```

Åbn [http://localhost:8080](http://localhost:8080).

### Docker

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
```

Port **8090** → container 8080.

## Styring (5-pad)

| Input | Handling |
|-------|----------|
| ← / TOUCH1 | Forrige build-slot |
| → / TOUCH3 | Næste build-slot |
| ↑ / TOUCH2 | Forrige tårntype |
| ↓ / TOUCH0 | Næste tårntype |
| Space / TOUCH4 | Byg eller opgrader |
| X | Sælg tårn (refund ~60%) |

## Tårne

| Type | Rolle |
|------|--------|
| **ARROW** | Billig, hurtig single-target |
| **CANNON** | Dyrere, splash |
| **FROST** | Slow + skade |

## Controller API (Oplà)

Samme kontrakt som Bomberman/Tetris:

| Endpoint | Body |
|----------|------|
| `POST /api/controller/join` | `{ name?, deviceId? }` → `{ ok, playerId }` |
| `POST /api/controller/heartbeat` | `{ playerId }` |
| `POST /api/controller/action` | `{ playerId, action, params? }` |

Actions: `slot_left`, `slot_right`, `type_prev`, `type_next`, `place`, `sell`, `start`, `reset`  
Alternativt: `move` + `LEFT`/`RIGHT`/`UP`/`DOWN`, eller `bomb` = place.

## WebSocket

- `start` / `reset`
- `action` — `{ action, params? }`
- Server broadcaster `state`

## Health

`GET /api/health` → `{ ok, service: "tower-defense-tap" }`

## Produktion (Dokploy)

Traefik PathPrefix fx `/TowerDefense` + StripPrefix. Sæt `GAME_BASE_PATH=/TowerDefense` i Arduino når I tilføjer `GAME_MODE`.

## Filstruktur

```
Tower-defense-tap/
  Dockerfile
  docker-compose.yml
  docker-compose.local.yml
  public/          # UI + canvas
  server/
    game.js        # engine
    server.js      # HTTP + WS + controller
    package.json
```
