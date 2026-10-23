# Tower Defense Tap

**Tower defense** styret med **5 knapper** (keyboard eller Arduino Oplà) — Mercantec Games-mønster.

**Sessionsmodel:** Én fælles fæstning (ingen PIN-lobby). Alle browsere og pads deler samme run.

Vælg **kort** + **sværhedsgrad**, overlev **18 waves** (boss på 6 / 12 / 18).

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

## Kort & sværhed

| Kort | Karakter |
|------|----------|
| **COURTYARD** | Klassisk snake (default) |
| **SERPENT** | Længere S-sti, flere build-slots |
| **GAUNTLET** | Kortere sti, højere tryk |

| Sværhed | Effekt |
|---------|--------|
| **NORMAL** | Standard HP/guld |
| **HARD** | HP ×1.35, bounty ×0.9, −20 startguld |

## Styring

| Input | Handling |
|-------|----------|
| ←→↑↓ / WASD | Flyt cursor på kortet (spatial) |
| Q / E | Skift tårntype |
| 1–6 | Vælg tårn direkte |
| Tab | Hop til næste tomme slot |
| Space / TOUCH4 | Byg eller opgrader |
| X | Sælg tårn (refund 60%) |
| N | Call next wave (+8g hvis board clear) |
| 2 | Hastighed 1× / 2× |
| P | Pause |
| TOUCH1/3 | Venstre/højre slot |
| TOUCH0/2 | Tårntype |

## Tårne (6)

| Type | Rolle | Lvl 3 perk |
|------|--------|------------|
| **ARROW** | Billig DPS | Piercing |
| **CANNON** | Splash | Stor splash |
| **FROST** | Slow | Splash-slow |
| **SNIPER** | Lang range, anti-air | Crit 30% |
| **BARRACKS** | Aura | +22% fire rate til allies |
| **ARC** | Chain lightning, anti-air | 3 hops |

## Fjender

Grunt, Tank, Runner, Swarm, Armored (fysisk resist), Flying (kun anti-air), Boss.

## Controller API (Oplà)

Samme kontrakt som Bomberman/Tetris (uden PIN):

| Endpoint | Body |
|----------|------|
| `POST /api/controller/join` | `{ name?, deviceId? }` → `{ ok, playerId }` |
| `POST /api/controller/heartbeat` | `{ playerId }` |
| `POST /api/controller/action` | `{ playerId, action, params? }` |

Actions: `slot_left`, `slot_right`, `slot_up`, `slot_down`, `type_prev`, `type_next`, `place`, `sell`, `start`, `reset`, `next_wave`, `speed`, `pause`  
Alternativt: `move` + `LEFT`/`RIGHT`/`UP`/`DOWN`, eller `bomb` = place.

> **Firmware-note:** `GAME_MODE_TOWER` i Games-repoet er follow-up — action-kontrakten ovenfor matcher UI’et.

## WebSocket

- `configure` — `{ mapId, difficulty }` (før start; første vinder i delt arena)
- `start` / `reset`
- `action` — `{ action, params? }`
- Server broadcaster `state` (~30 Hz) inkl. `events[]` til VFX/SFX

## Health

`GET /api/health` → `{ ok, service: "tower-defense-tap" }`

## Produktion (Dokploy)

Traefik PathPrefix `/TowerDefense` + StripPrefix. Live: https://games.mercantec.tech/TowerDefense/

## Filstruktur

```
Tower-defense-tap/
  public/           # hub UI, render.js, sfx.js, client.js
  server/
    content/        # maps, towers, enemies, waves
    game.js         # simulation
    server.js       # HTTP + WS + controller
```
