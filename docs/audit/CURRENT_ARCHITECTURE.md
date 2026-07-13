# Current architecture

## High-level runtime model

Sindopoly is currently a full-stack Monopoly-inspired game:

1. The React frontend stores player identity in browser storage and calls REST endpoints.
2. Spring Boot exposes REST APIs for player creation, lobby/game state, turn actions, and statistics.
3. MariaDB stores persistent metadata: players, squares, cards, stats.
4. Redis stores active game state, active player state, decks, leaderboard cache, and optional dice entropy.
5. Spring's in-memory STOMP simple broker can broadcast game events on `/topic/game/{gameId}`.
6. The frontend currently polls REST endpoints; the STOMP subscription in `Board.jsx` is commented out.

Evidence:

- Frontend API base and wrappers: `sindopoly-front/src/apis/apiConfig.jsx`, `GameAPI.jsx`, `GamePlayAPI.jsx`, `TurnAPI.jsx`.
- Backend controllers: `Sindopoly-Java/src/main/java/com/example/Sindopoly_Java/controller/*`.
- Redis access: `GameStateService`, `PlayerStateService`, `CardService`, `StatsService`, `DiceEntropyRefillJob`.
- WebSocket config: `WebSocketConfig`.
- Frontend commented STOMP subscription: `sindopoly-front/src/pages/Game/Board.jsx`.

## Confirmed architectural improvements since the first exploration

The code is not purely controller-centric. Current backend has explicit service/core separation:

- `TurnService` orchestrates turn flow.
- `DiceService` owns dice roll generation.
- `MovementService` owns board movement math.
- `SquareActionService` owns square event/optional action logic.
- `CardService` owns deck drawing.
- `StatsService` owns stats DTO and leaderboard cache reads/writes.

This is a meaningful separation improvement, but boundaries remain porous; see `CONCERN_BOUNDARIES.md`.

## Backend runtime components

| Component | Current role | Main state touched |
| --- | --- | --- |
| `GameStateController` | Lobby, game state, join/start/remove/delete/check-end REST endpoints | Redis game hashes/sets; MariaDB player lookups |
| `PlayerStateController` | Player creation and direct player-state mutation endpoints | MariaDB `player`; Redis `player:{playerId}` |
| `TurnController` | REST façade for `throw`, `action`, `pass` | Delegates mostly to `TurnService`/`GameStateService` |
| `TurnService` | Server-authoritative dice and turn orchestration | Redis game/player hashes; WebSocket broker |
| `GameStateService` | Active game state, lobby membership, end condition/stat finalization | Redis game hashes/sets; MariaDB stats/player/square |
| `PlayerStateService` | Player Redis hash lifecycle and money/jail helpers | Redis `player:{playerId}` |
| `SquareActionService` | Square peeking/apply logic, ownership scanning | Redis player hashes; MariaDB square/card data |
| `GameLoopScheduler` | Periodic end-condition scan and cleanup | Redis `KEYS game:*`; WebSocket broker |

## Important current limitations

- WebSocket support is configured server-side, but there are no active inbound `@MessageMapping` handlers and frontend subscription code is commented out.
- Redis mutations are multi-step and not protected by locks, transactions, Lua scripts, or idempotency keys.
- Authentication is not enforced server-side. `WebSecurityConfig` permits all requests.
- REST includes endpoints that allow clients to write arbitrary player-state fields.
- Frontend has hard-coded backend URLs and direct localhost calls outside `apiConfig.jsx`.
- Active game state is Redis-authoritative, while persistent entities are MariaDB-backed; ownership is stored only in each player's Redis `properties` JSON list, not in MariaDB.

