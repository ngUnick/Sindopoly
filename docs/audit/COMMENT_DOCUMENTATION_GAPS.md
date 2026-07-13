# Comment and documentation gaps

This document identifies representative areas where future work should improve comments or technical documentation. It does not recommend bulk comment insertion. Address these gaps when making related functional changes, or in a focused documentation task where noted.

Documentation types:

- `JAVADOC`
- `INLINE_INTENT_COMMENT`
- `SECURITY_COMMENT`
- `CONCURRENCY_COMMENT`
- `REDIS_SCHEMA_DOCUMENTATION`
- `WEBSOCKET_DOCUMENTATION`
- `ADR`
- `TEST_NAME_OR_TEST_DOCUMENTATION`
- `NO_COMMENT_NEEDED`

Priority:

- `P1`: security, corruption, concurrency, or core game-flow documentation risk.
- `P2`: broken/incomplete behavior documentation risk.
- `P3`: maintainability, testability, or performance documentation risk.
- `P4`: consistency/cleanup documentation improvement.

## Representative gaps

| File path | Class / method | Status | Missing context | Recommended documentation type | Why it matters | Risk if left undocumented | Priority | When to address |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `Sindopoly-Java/src/main/java/com/example/Sindopoly_Java/service/orchestrator/TurnService.java` | `TurnService#throwDice` | Confirmed documentation gap | Allowed turn phases, duplicate roll behavior, mutation ordering, optional-action semantics, and failure behavior. | `JAVADOC`, `CONCURRENCY_COMMENT`, `REDIS_SCHEMA_DOCUMENTATION` | This is the core authoritative dice/turn command. | Future changes may accept duplicate rolls, rotate the wrong player, or publish state inconsistently. | P1 | During next turn-flow functional change; add tests first. |
| `Sindopoly-Java/src/main/java/com/example/Sindopoly_Java/service/orchestrator/TurnService.java` | `TurnService#applyAction` | Confirmed documentation gap | Why body IDs are trusted, when optional action belongs to a player, event ordering, and action idempotency. | `JAVADOC`, `SECURITY_COMMENT`, `CONCURRENCY_COMMENT` | Optional action application is security- and state-sensitive. | Request tampering and duplicate action behavior remain unclear. | P1 | During action/authorization fix; tests first. |
| `Sindopoly-Java/src/main/java/com/example/Sindopoly_Java/service/orchestrator/TurnService.java` | `TurnService#finishTurn` | Confirmed documentation gap | Whether this is player pass, timeout, or generic cleanup; relationship to `gameOver` event and scheduler. | `JAVADOC`, `WEBSOCKET_DOCUMENTATION`, `CONCURRENCY_COMMENT` | Finish/timeout paths can race with user actions and end-game checks. | Duplicate turn rotation or inconsistent event names. | P1 | During timer/pass revamp; tests first. |
| `Sindopoly-Java/src/main/java/com/example/Sindopoly_Java/service/GameStateService.java` | `GameStateService#createGame` | Confirmed documentation gap and over-commenting | Existing comments restate steps but do not explain why `gameId == ownerId`, invite-code uniqueness assumptions, or TTL rationale. | `JAVADOC`, `REDIS_SCHEMA_DOCUMENTATION` | Game identity and lifecycle begin here. | Future changes may break invite/lobby lifecycle or cleanup assumptions. | P2 | During game creation/lobby changes. |
| `Sindopoly-Java/src/main/java/com/example/Sindopoly_Java/service/GameStateService.java` | `GameStateService#isPlayerInAnyGame` | Confirmed documentation gap | Runtime impact and consistency assumptions of scanning `game:*:players`. | `INLINE_INTENT_COMMENT`, `PERFORMANCE`-oriented documentation | This method is used to prevent multi-game membership. | Developers may keep expanding Redis `KEYS` usage without understanding trade-off. | P3 | During Redis index/performance work. |
| `Sindopoly-Java/src/main/java/com/example/Sindopoly_Java/service/GameStateService.java` | `GameStateService#startGame` | Confirmed documentation gap | Host authorization rule (`gameId == actorId`), player state initialization, Redis fields, and timer semantics. | `JAVADOC`, `SECURITY_COMMENT`, `REDIS_SCHEMA_DOCUMENTATION` | Start game establishes authoritative game fields. | Host rules and player initialization order can be changed accidentally. | P1 | During authorization/start-game work; tests first. |
| `Sindopoly-Java/src/main/java/com/example/Sindopoly_Java/service/GameStateService.java` | `GameStateService#endGame` and `deleteGameAndPlayers` | Confirmed documentation gap | End-game TTL rationale, stats finalization timing, cleanup race assumptions. | `JAVADOC`, `CONCURRENCY_COMMENT`, `REDIS_SCHEMA_DOCUMENTATION` | End cleanup affects Redis data and persistent stats. | Clients may miss final state; scheduler may delete state before consumers recover. | P1 | During end-game cleanup work; tests first. |
| `Sindopoly-Java/src/main/java/com/example/Sindopoly_Java/service/GameLoopScheduler.java` | `pollEndConditions`, `cleanupEndedGames` | Confirmed documentation gap | Timer race behavior, idempotency, duplicate event behavior, and multi-instance assumptions. | `JAVADOC`, `CONCURRENCY_COMMENT`, `WEBSOCKET_DOCUMENTATION` | Scheduled jobs can race with player commands and each other. | Duplicate game-end events or cleanup during live transition. | P1 | During timer revamp; tests first. |
| `Sindopoly-Java/src/main/java/com/example/Sindopoly_Java/service/core/SquareActionService.java` | `peekSquare`, `applyAutomatic` | Confirmed documentation gap | Rule source for taxes, rent, utility/train rent, jail offer, card effects, and owner lookup. | `JAVADOC`, `INLINE_INTENT_COMMENT`, `REDIS_SCHEMA_DOCUMENTATION` | Tile behavior is core domain logic. | Future edits may alter rules without realizing game implications. | P1 | During square-rule bug fixes; tests first. |
| `Sindopoly-Java/src/main/java/com/example/Sindopoly_Java/service/core/SquareActionService.java` | `findOwner`, `fetchProperties` | Confirmed documentation gap | Ownership is inferred by scanning player property JSON, not a direct square owner key. | `REDIS_SCHEMA_DOCUMENTATION`, `INLINE_INTENT_COMMENT` | Ownership schema is non-obvious and fragile. | Developers may add incompatible ownership keys or duplicate state. | P2 | During property/Redis schema work. |
| `Sindopoly-Java/src/main/java/com/example/Sindopoly_Java/service/core/DiceService.java` | `roll` | Likely gap | Whether the game intentionally stores only dice total and whether doubles are unsupported. | `JAVADOC`, `INLINE_INTENT_COMMENT` | Monopoly-like rules often depend on individual dice and doubles. | Future doubles/jail features may be blocked or bolted on incorrectly. | P2 | During dice/doubles work; clarify behavior first. |
| `Sindopoly-Java/src/main/java/com/example/Sindopoly_Java/service/core/MovementService.java` | `move` | Already mostly self-documenting | Current comments explain 40 positions and passing start; adequate for simple rule. | `NO_COMMENT_NEEDED` unless rules change | Method is small and deterministic. | Low. | P4 | Add tests rather than more comments if changed. |
| `Sindopoly-Java/src/main/java/com/example/Sindopoly_Java/controller/PlayerStateController.java` | `savePlayer`, `grantPlayerMoney` | Confirmed documentation gap | Security intent is absent: whether endpoints are dev-only, admin-only, or public game API. | `SECURITY_COMMENT`, `JAVADOC` | These endpoints mutate authoritative player state. | Future developers may treat unsafe endpoints as normal production API. | P1 | During security hardening; behavior change likely needed. |
| `Sindopoly-Java/src/main/java/com/example/Sindopoly_Java/controller/GameStateController.java` | `removePlayer`, `deleteGame`, `checkGameEnd` | Confirmed documentation gap | Caller authority, host/player rights, and side effects are not documented. | `SECURITY_COMMENT`, `JAVADOC` | These endpoints mutate game membership/lifecycle. | Unauthorized disruption risks remain easy to miss. | P1 | During authorization work; tests first. |
| `Sindopoly-Java/src/main/java/com/example/Sindopoly_Java/config/WebSocketConfig.java` | `registerStompEndpoints`, `configureMessageBroker` | Confirmed documentation gap | `setAllowedOriginPatterns("*")`, in-memory broker limitations, subscription auth assumptions. | `WEBSOCKET_DOCUMENTATION`, `SECURITY_COMMENT`, `ADR` | WebSocket security and multi-instance behavior are architectural. | Private game events may be exposed; multi-instance behavior misunderstood. | P1 | During WebSocket/security design; ADR recommended. |
| `Sindopoly-Java/src/main/java/com/example/Sindopoly_Java/config/WebSecurityConfig.java` | `apiSecurity`, `corsConfigurationSource` | Confirmed documentation gap | Whether `permitAll`, disabled CSRF, and CORS origins are prototype-only or intentional. | `SECURITY_COMMENT`, `ADR` | Security posture is cross-cutting. | Unsafe defaults may reach deployment. | P1 | During auth/security work; ADR recommended. |
| `Sindopoly-Java/src/main/java/com/example/Sindopoly_Java/config/CorsConfig.java` | `corsConfigurer` | Confirmed documentation gap | Relationship to `WebSecurityConfig` CORS source. | `INLINE_INTENT_COMMENT`, `ADR` | Two CORS configurations can confuse effective policy. | Future changes may harden one config while the other remains open. | P3 | During config cleanup. |
| `Sindopoly-Java/src/main/java/com/example/Sindopoly_Java/service/random/DiceEntropyRefillJob.java` | `refill` | Confirmed documentation gap | Blocking external random.org call, fallback behavior, scheduler impact, Redis list lifecycle. | `JAVADOC`, `PERFORMANCE` comment, `REDIS_SCHEMA_DOCUMENTATION` | Dice entropy affects gameplay and scheduler behavior. | External dependency failures may be misunderstood. | P3 | During dice-source work. |
| `Sindopoly-Java/src/main/java/com/example/Sindopoly_Java/service/core/StatsService.java` | `getLeaderboard`, `refreshLeaderboard` | Confirmed documentation gap | Cache key lifecycle, no TTL, scheduled refresh semantics. | `REDIS_SCHEMA_DOCUMENTATION`, `JAVADOC` | Leaderboard cache can become stale. | Developers may assume DB and cache are always consistent. | P3 | During stats/cache work. |
| `Sindopoly-Java/src/main/java/com/example/Sindopoly_Java/exception/GlobalExceptionHandler.java` | `handleBadRequest`, `handleServerError` | Likely gap | Which exceptions are safe to expose and which are intentionally generic. | `JAVADOC`, `SECURITY_COMMENT` | Error handling shapes client-visible security information. | Future exceptions may leak internals or collapse auth/conflict errors into 400. | P3 | During typed error handling. |
| `sindopoly-front/src/pages/Game/Board.jsx` | Commented STOMP `useEffect` | Confirmed gap and temporary-code issue | Why WebSocket handling is commented out, removal condition, and intended recovery model. | `COMPATIBILITY`/temporary-code comment, `WEBSOCKET_DOCUMENTATION` | Realtime strategy is unclear. | Future work may duplicate polling and WebSocket logic inconsistently. | P2 | During realtime/WebSocket work; not as bulk comment insertion. |
| `sindopoly-front/src/pages/Game/Board.jsx` | `handleTick`, `throwDiceAction`, `handleModalChoice` | Confirmed documentation gap | Server-authoritative state sync, modal/action contract, resync after failure. | `INLINE_INTENT_COMMENT`, `WEBSOCKET_DOCUMENTATION` | Frontend gameplay depends on backend DTO semantics. | UI may diverge from authoritative state. | P2 | During frontend game-flow changes. |
| `sindopoly-front/src/pages/Game/Board.jsx` | Three.js scene setup comments | Code should be refactored rather than commented | Many comments restate object creation such as scene/camera/renderer/lights. | `NO_COMMENT_NEEDED` | Clear code or component extraction would help more than comments. | Visual noise hides important gameplay comments. | P4 | During frontend refactor, not dedicated comment pass. |
| `sindopoly-front/src/apis/GamePlayAPI.jsx` | Commented legacy turn wrappers | Confirmed temporary-code gap | Comments say "legacy, you can delete these once React is updated" but no condition/reference. | `COMPATIBILITY` comment | Temporary compatibility is unclear. | Dead code may survive or be removed unsafely. | P4 | During API contract cleanup. |
| `sindopoly-front/src/apis/GameAPI.jsx` | Mixed direct hard-coded URLs and API config | Likely documentation/config gap | Why some calls bypass `API_BASE_URL`. | `INLINE_INTENT_COMMENT` only if intentional; otherwise refactor | Configuration ownership is unclear. | Deployment mistakes. | P3 | During frontend API cleanup; clearer code preferable. |
| `MariaDB/init.sql` | Tables, trigger, seed data | Likely gap | Relationship between trigger-created stats and seeded stats, schema ownership, seed intent. | `REDIS_SCHEMA_DOCUMENTATION` not applicable; use schema documentation/ADR | Database lifecycle and seed behavior matter for tests/startup. | Duplicate/inconsistent stats assumptions. | P3 | During database migration/schema work. |
| `Sindopoly-Java/src/test/resources/application-test.properties` | Test resources | Confirmed gap | No test classes/names document critical behavior. | `TEST_NAME_OR_TEST_DOCUMENTATION` | Tests are the best documentation for turn/security/concurrency behavior. | Future behavior changes lack executable documentation. | P1 | Before or during functional revamps. |

## Current commenting strengths

- Many public endpoints in controllers have simple endpoint summaries that help locate API behavior.
- `PlayerStateService#initializePlayer` documents initial Redis player fields.
- `GameStateService#startGame` explains owner start and player-state initialization at a high level.
- `DiceService#roll` clearly indicates two six-sided dice are summed.
- `MovementService#move` is small and its existing comments are enough for the current simple movement rule.
- `WebSocketConfig` identifies `/topic`, `/app`, and `/ws` roles, though it needs security and multi-instance context later.
- Frontend comments in `Board.jsx` preserve a visible clue that STOMP subscription was considered.

## Patterns to improve

- Replace step-by-step comments that restate code with intent comments explaining rule or risk.
- Avoid emojis and casual markers in technical comments.
- Avoid section dividers that make files longer without explaining behavior.
- Convert vague temporary comments into `TODO`, `FIXME`, `SECURITY`, `PERFORMANCE`, or `COMPATIBILITY` comments with removal conditions.
- Prefer tests and clearer method names over large blocks of explanatory comments.
- Document Redis lifecycle once in a schema owner/doc, then reference it sparingly from code.

## Areas needing behavioral clarification before documentation

- Whether doubles are part of Sindopoly's intended dice rules.
- Whether direct player-state mutation endpoints are dev/admin-only or intended public API.
- Whether WebSocket should replace polling or remain a notification layer.
- Whether `gameId == ownerId` is a permanent identity rule or a current shortcut.
- Whether random.org entropy is intended for production gameplay.
- Whether current rent/jail/tax behavior matches intended Sindopoly rules.

