# Concern boundaries

## Summary

The backend has begun separating orchestration, core game rules, Redis access, and controllers, but several responsibilities still cross layers. The main revamp target should be a small, explicit application layer for commands such as create game, join, start, roll dice, apply action, leave, and cleanup.

## Boundary observations

| Boundary | Current state | Evidence | Risk |
| --- | --- | --- | --- |
| Controllers vs application services | `GameStateController#startGame` checks minimum players before calling service; `addPlayer` checks duplicate membership and max players before service. | `GameStateController` methods around `/start` and `/add/{gameId}/{playerId}` | Business policy split across controller/service makes tests and alternate transports harder. |
| Controllers vs persistence | `GameStateController#getPlayersDetailed` loops player IDs, calls `playerRepo.findById`, and reads player Redis state. | `GameStateController#getPlayersDetailed` | REST shaping, DB lookups, and Redis reads are mixed. |
| Player-state mutation vs game rules | `PlayerStateController#savePlayer` accepts arbitrary map and writes it to Redis. | `PlayerStateController#savePlayer`; `PlayerStateService#savePlayerState` | Security and consistency risk; clients can submit authoritative state. |
| Turn orchestration vs Redis access | `TurnService` calls `gameStateSvc`, `playerStateSvc`, and also broadcasts directly. | `TurnService#throwDice`, `applyAction`, `finishTurn` | Orchestration, persistence, and event publication are coupled. |
| Domain logic vs data access | `SquareActionService` performs square DB lookup, scans player Redis properties, computes rents, and mutates player Redis hashes. | `SquareActionService#peekSquare`, `completeOptionalBuy`, `applyAutomatic` | Hard to test rules independently; DB/Redis required for most rule tests. |
| Timer/scheduler vs game flow | `GameLoopScheduler` periodically calls `checkEndCondition`; `TurnService#finishTurn` also checks end condition. | `GameLoopScheduler`; `TurnService#finishTurn` | Duplicate end handling and broadcasts can occur. |
| WebSocket vs REST | Backend broadcasts only after selected events; frontend active game UI polls REST instead. | `TurnService#applyAction`; `Board.jsx` commented STOMP effect and 2s polling | Real-time path is partial and can diverge from REST snapshot path. |
| CORS configuration | Both `WebSecurityConfig` and `CorsConfig` define CORS rules with different origins/scope. | `WebSecurityConfig#corsConfigurationSource`; `CorsConfig#corsConfigurer` | Confusing effective behavior; production hardening unclear. |
| Random dice source | `DiceSourceConfig` chooses secure RNG by default, while `RandomOrgGenerator` has `matchIfMissing=true` on its component. | `DiceSourceConfig`; `RandomOrgGenerator` | Bean/profile behavior requires tests; external random.org scheduler blocks if enabled. |

## Acceptable simplicity

The following are acceptable at this project stage if documented and tested:

- `MovementService#move` as a pure method with 40-square modulo logic.
- Redis string/hash storage via `RedisTemplate<String,String>` for a small game prototype.
- MariaDB entities for static board/card metadata and stats.

## Documentation gaps to add in future code changes

- Redis key lifecycle and ownership.
- Turn state machine and optional-action semantics.
- Why game ID equals owner ID.
- Why player order is sorted ID order in `TurnService#rotateTurn`.
- Security model: current trust assumptions vs intended auth.
- Concurrency assumptions for duplicate roll/action requests.
- WebSocket event contract for `/topic/game/{gameId}`.

