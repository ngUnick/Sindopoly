# Risk register

| ID | Title | Priority | Likelihood | Impact | Confidence | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| R-001 | Public unauthenticated state-changing API | P1 | High | Critical | High | `WebSecurityConfig`; `PlayerStateController`; `GameStateController`. |
| R-002 | Arbitrary player-state mutation and public money grant | P1 | High | Critical | High | `POST /api/player-state/{playerId}`; `/grant-money/{playerId}/{amount}`. |
| R-003 | Non-idempotent, non-atomic dice/action flow | P1 | High | Critical | High | `TurnService#throwDice`, `applyAction`; no locks/idempotency. |
| R-004 | WebSocket topic auth absent and frontend realtime path inactive | P1 | Medium | High | High | `WebSocketConfig`; commented `Board.jsx` STOMP block. |
| R-005 | Public game removal/deletion/check-end endpoints | P1 | High | High | High | `GameStateController#removePlayer`, `deleteGame`, `checkGameEnd`. |
| R-006 | Rent logic likely credits payer instead of debiting | P1 | Medium | High | Medium | `SquareActionService#applyAutomatic` case `rentDue`. |
| R-007 | Path/body mismatch in turn action | P1 | Medium | High | High | `TurnController#doAction`; `TurnService#applyAction`. |
| R-008 | Redis key scans with `KEYS` | P3 | Medium | Medium | High | `GameStateService`; `GameLoopScheduler`. |
| R-009 | Duplicate/inconsistent CORS configuration | P2 | Medium | Medium | High | `WebSecurityConfig`, `CorsConfig`, WebSocket `*`. |
| R-010 | Database seed and JPA uniqueness mismatch for stats | P2 | Medium | Medium | Medium | `MariaDB/init.sql` trigger + inserts; `Stats.java unique=true`. |
| R-011 | Frontend lint fails with undefined `cardMessage` | P2 | High | Medium | High | `npm.cmd run lint`; `Board.jsx`. |
| R-012 | No automated tests for critical flows | P0/P1 | High | High | High | `mvn clean verify` no tests; `npm.cmd test` missing. |
| R-013 | Hard-coded localhost API URLs | P3 | High | Medium | High | `apiConfig.jsx`, direct fetches in pages. |
| R-014 | Stale/mismatched README and mojibake documentation | P4 | High | Low | High | README/comments/SQL seed text. |
| R-015 | Docker/default credentials committed | P1/P4 | Medium | High | High | `docker-compose.yml`; `application.properties`. |

