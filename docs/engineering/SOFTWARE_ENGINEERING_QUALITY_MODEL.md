# Sindopoly software-engineering quality model

Implementation examples that cite `TurnService`, raw `GameStateService`
mutators, or direct legacy WebSocket publication describe the 2026-07-13 audit
baseline. The authoritative command/store/event boundaries replaced those
paths in REVAMP-018 through REVAMP-023, and REVAMP-025 removes the unwired
legacy implementation after replacement coverage. The normative standards in
this document remain current. Origin, credential, logging, and deployment
observations in the audit examples are likewise historical after REVAMP-026;
`docs/security/DEPLOYMENT_SECURITY.md` is the canonical current contract.

This document defines the engineering model for future Sindopoly work. It is intentionally repository-specific: it uses the current Spring Boot backend, Redis active state, MariaDB persistence, REST APIs, WebSocket broker configuration, scheduled jobs, and React frontend as its reference point.

This model is not a call for a broad rewrite. It is a standard for making each future change safer, easier to test, and easier to review.

## Current evidence baseline

The current code organizes concerns roughly as follows:

- REST transport: `Sindopoly-Java/src/main/java/com/example/Sindopoly_Java/controller/*`.
- WebSocket transport/broker setup: `config/WebSocketConfig.java`, endpoint `/ws`, broker `/topic`, application prefix `/app`.
- Request validation: `utils/ValidationUtils.java`, plus ad hoc validation in controllers and services.
- Audit-baseline application orchestration: formerly
  `service/orchestrator/TurnService.java` and mutation methods in
  `service/GameStateService.java`; current commands use the transition services
  and `RedisGameTransitionStore`.
- Domain/game-rule logic: `service/core/DiceService.java`,
  `MovementService.java`, retained test-oriented `SquareActionService.java` and
  `CardService.java`, plus the authoritative transition rule path.
- Redis state access: `GameStateService`, `PlayerStateService`, `SquareActionService`, `CardService`, `StatsService`, `DiceEntropyRefillJob`, `RandomOrgGenerator`.
- Redis Pub/Sub: no confirmed Redis Pub/Sub implementation; current game event delivery uses Spring `SimpMessagingTemplate`.
- MariaDB persistence: `model/*`, `repository/*`, and versioned Flyway migrations under `src/main/resources/db/migration`.
- Event publication/WebSocket broadcasting: application transitions publish
  through `GameEventPublisher` and `StompGameEventPublisher`.
- Authentication/authorization: no effective backend auth; `WebSecurityConfig` permits all requests.
- Timers/scheduled processing: `GameLoopScheduler`, `StatsService#refreshLeaderboard`, `DiceEntropyRefillJob`.
- Frontend API communication: `sindopoly-front/src/apis/*`, plus direct `fetch("http://localhost:8080/...")` calls in pages.
- Frontend real-time handling: `Board.jsx` has commented STOMP/SockJS subscription code and active polling.

## 1. Separation of concerns

Sindopoly should use pragmatic boundaries. A small project does not need a framework-heavy architecture, but it does need clear ownership of game authority, Redis mutation, and client-visible contracts.

### Transport layer

Includes REST controllers and future WebSocket command handlers.

Responsible for:

- Mapping HTTP paths, request bodies, query parameters, and WebSocket messages into application commands.
- Performing transport-level input parsing and basic shape validation.
- Translating application/domain failures into HTTP/WebSocket responses.
- Enforcing authenticated caller context once security exists.

Should not:

- Implement Monopoly/Sindopoly rules.
- Mutate Redis directly.
- Decide turn progression, dice outcomes, rents, jail behavior, or winner selection.
- Publish WebSocket events except through an application-level result/event publisher.

Current evidence:

- `GameStateController#startGame` checks player count before delegating.
- `PlayerStateController#savePlayer` currently exposes direct Redis state mutation.
- `TurnController#doAction` accepts path IDs but delegates using request-body IDs.

Quality standard:

- Controllers may contain simple request validation, but game decisions belong in application/domain services.
- WebSocket handlers, when added, should call the same application command handlers as REST endpoints.

### Application layer

Includes use-case orchestration such as create game, join game, start game, roll dice, apply action, pass action, remove player, timeout turn, complete game.

Responsible for:

- Loading current game/player state through infrastructure gateways or services.
- Checking command preconditions: game status, membership, active player, turn phase, idempotency/version.
- Calling domain logic to calculate transitions.
- Persisting state changes atomically enough for the command.
- Publishing domain/application events after successful state changes.

Should not:

- Hide raw transport details in domain code.
- Let frontend-submitted position, money, property ownership, or dice values become authoritative.
- Mix unrelated commands into one method merely because they touch the same Redis keys.

Current evidence:

- The audit-baseline `TurnService#throwDice` was the closest application command
  handler; current turn intent is owned by `TurnCommandService`.
- `GameStateService` mixes application commands, Redis access, stats finalization, and some rule decisions.

Quality standard:

- A future turn command should have a single authoritative command path regardless of whether it comes from REST, WebSocket, or a timer.
- Timer code should not bypass application services.

### Domain layer

Includes game rules and deterministic calculations.

Responsible for:

- Dice interpretation, movement, turn phase rules, tile effects, rent/tax/card/jail semantics, win/end conditions.
- Producing explicit transition results and domain events.

Should not:

- Know about HTTP, STOMP, Redis templates, SQL repositories, or browser state.
- Publish WebSocket messages.
- Read environment variables or application configuration directly.

Current evidence:

- `MovementService#move` is a good small deterministic domain component.
- `DiceService` is close to domain behavior but depends on injectable randomness, which is appropriate.
- `SquareActionService` currently mixes domain rules with Redis and MariaDB access.

Quality standard:

- Keep simple cohesive rule logic together.
- Extract only when deterministic testing, security, or concurrency safety materially improves.

### Persistence and infrastructure layer

Includes Redis access, MariaDB repositories, random providers, clocks, ID generation, Docker/config integration, external HTTP clients.

Responsible for:

- Encapsulating Redis key construction, serialization, TTL, and atomic operations.
- Encapsulating MariaDB repository access and query details.
- Providing injectable infrastructure collaborators such as randomness and clocks.

Should not:

- Decide game rules.
- Publish game events as a side effect of repository access.
- Advance turns or complete games on its own.

Current evidence:

- Raw Redis keys such as `game:{id}`, `player:{id}`, `stats:leaderboard`, and `dice:entropy` are constructed in multiple services.
- `StatsService` uses `StringRedisTemplate` for leaderboard cache.
- `SquareActionService` directly manipulates `player:{id}` hashes.

Quality standard:

- Redis key construction should be centralized by state type.
- Repositories should not publish WebSocket events.

### Messaging layer

Includes domain/application events, Redis Pub/Sub if introduced, and WebSocket broadcasting.

Responsible for:

- Creating event envelopes with event type, game ID, command ID, state version, and payload.
- Delivering events to WebSocket destinations or future Redis Pub/Sub channels.
- Making event publication observable and testable.

Should not:

- Mutate authoritative game state based only on outbound delivery.
- Recompute game rules.
- Depend on frontend component details.

Current evidence:

- The audit baseline published directly from `TurnService` and
  `GameLoopScheduler`; current publication is centralized behind
  `GameEventPublisher`.
- Event names include `actionCompleted`, `turnFinished`, `gameOver`, and `gameEnded`.

Quality standard:

- State changes come first, event publication second.
- Event names and payloads must be documented before frontend dependencies grow around them.

### Security layer

Responsible for:

- Authentication, player identity, game membership, host privileges, active-player enforcement, subscription authorization, and replay protection.

Should not:

- Be implemented only in React conditional rendering.
- Rely on path/query/body player IDs as proof of identity.

Current evidence:

- `WebSecurityConfig#apiSecurity` uses `anyRequest().permitAll()`.
- `Lobby.jsx` hides kick controls client-side, but `GameStateController#removePlayer` is public.

Quality standard:

- Backend remains authoritative for all game state and outcomes.
- Every state-changing command must identify the caller and validate authorization server-side.

### Scheduling and timer layer

Responsible for:

- Finding due work, creating timeout/cleanup commands, and calling application services.

Should not:

- Directly bypass command validation.
- Race with player commands without a documented concurrency strategy.

Current evidence:

- `GameLoopScheduler#pollEndConditions` scans `game:*` every 2 seconds and broadcasts end events.
- `DiceEntropyRefillJob#refill` optionally calls random.org on a schedule.

Quality standard:

- Timers must use the same state-machine and idempotency rules as player commands.

### Frontend state and presentation layers

Responsible for:

- Presenting server state.
- Sending user commands.
- Maintaining optimistic UI only when it can be reconciled with server truth.
- Handling reconnect/resync.

Should not:

- Calculate authoritative dice, movement, rents, ownership, money, jail status, or winner.
- Treat local storage identity as server authority.

Current evidence:

- `TurnAPI.throwDice` sends no dice value, which is correct.
- `Board.jsx` animates movement based on server `ThrowResultDto`.
- `Board.jsx` polls every 2 seconds; WebSocket subscription is commented out.

Quality standard:

- Frontend may animate and predict display, but server state wins on resync.

## 2. Single responsibility

A class has too many responsibilities when a change in one of these concerns forces changes in the same class for unrelated reasons:

- Transport contract.
- Authorization.
- Game rule.
- Redis schema.
- MariaDB query.
- Event payload.
- Timer behavior.
- Frontend presentation.

Sindopoly examples:

- Dice generation is one responsibility: `DiceService` plus an injectable `RandomIntGenerator` is acceptable.
- Movement calculation is one responsibility: `MovementService#move` is acceptable and should remain simple.
- Turn progression is a use-case orchestration responsibility: it can coordinate dice, movement, square resolution, persistence, and events, but it should not bury every rule and every Redis detail in one method.
- Player authorization is a security responsibility and should not live only in controllers or React components.
- Redis persistence should be encapsulated by state access components, not repeated in every rule service.
- Event publication and WebSocket delivery are related but not identical: event construction should be testable separately from delivery.
- Reconnect recovery belongs to application/client state synchronization, not presentation-only logic.

Extraction is justified when:

- Deterministic tests become much easier.
- A security boundary becomes explicit.
- Redis atomicity or serialization needs one owner.
- A rule is reused by REST, WebSocket, and timer paths.
- A class currently changes for unrelated reasons.

Keeping logic together is acceptable when:

- The logic is cohesive, short, deterministic, and has one reason to change.
- Introducing an interface would only add ceremony.
- The code is not on a security/concurrency boundary.

## 3. Dependency inversion and testability

Use injectable collaborators when the dependency is nondeterministic, external, stateful, or slow:

- Redis state access.
- MariaDB repositories.
- Clocks/time.
- Randomness/dice source.
- ID/command ID generation.
- WebSocket/event publisher.
- External HTTP clients.
- Scheduled timers.

Do not create interfaces for every service by default. An interface is justified when:

- Tests need a fake implementation.
- There are multiple real implementations, such as `SecureRandomGenerator` and `RandomOrgGenerator`.
- It protects domain logic from infrastructure details.
- It isolates a volatile integration such as WebSocket delivery or Redis atomic scripts.

Deterministic tests should be possible for:

- Dice behavior by injecting predictable `RandomIntGenerator`.
- Turn transitions by injecting state fixtures and command IDs.
- Timeout behavior by injecting a clock.
- Duplicate commands by replaying the same command ID.
- Concurrent commands by simulating stale state version or lock conflict.
- Event publication by asserting emitted domain/application events without opening a WebSocket.

Current positive evidence:

- `DiceService` depends on `RandomIntGenerator`.
- `SecureRandomGenerator` and `RandomOrgGenerator` are separate implementations.

Current gap evidence:

- The removed audit-baseline `TurnService` constructed `MovementService`
  directly and published through `SimpMessagingTemplate`; current transition
  services inject collaborators and publish through `GameEventPublisher`.
- Scheduled jobs call services and infrastructure directly without a shared command envelope.

## 4. Encapsulation

Future work should encapsulate the following:

- Redis key construction.
- Redis field names and serialization.
- TTL/lifecycle rules.
- Atomic updates and state versioning.
- Database access patterns.
- Public DTO mapping.
- Event-envelope construction.
- Game-state transitions.

Raw Redis key construction should not be duplicated across unrelated classes. Current repeated examples include:

- `game:{gameId}` and `game:{gameId}:players`.
- `player:{playerId}`.
- `game:{gameId}:deck`.
- `stats:leaderboard`.
- `dice:entropy`.

Expected standard:

- A Redis state component may expose meaningful methods such as `loadGame`, `saveTurnTransition`, `getPlayers`, `markOptionalAction`, or `appendDeck`.
- Application/domain code should not know the exact string layout unless the class is explicitly the schema owner.
- Public REST DTOs should be stable contracts, not raw Redis hash dumps, unless intentionally documented.

## 5. Domain modeling

Sindopoly should prefer explicit concepts where primitive strings/booleans make invalid states easy.

Concepts worth modeling explicitly:

- Game status: lobby, in progress, ended.
- Turn phase: awaiting roll, resolving tile, awaiting optional action, turn complete, timed out.
- Active player.
- Dice result: ideally individual dice plus total if doubles matter.
- Player position.
- Property ownership.
- Game command: create, join, start, roll, apply action, pass, leave, timeout.
- Domain event: game created, player joined, game started, dice rolled, player moved, tile resolved, action applied, turn advanced, game ended.
- State transition result: previous version, new version, emitted events, failure reason.

Primitive values are acceptable for static board metadata and simple DTO fields. They become risky when they represent state machines, ownership, authorization, or concurrency control.

Current evidence:

- `GameStateService` stores `status`, `playerTurn`, `winner`, `timer`, `optionalAction` as Redis hash strings.
- `ThrowResultDto` returns `dice`, `newPosition`, `passedGo`, `squareType`, `data`.
- `SquareEventDto` uses string event types such as `buyOffer`, `rentDue`, `jailOffer`, `card`.

Expected standard:

- Keep DTOs simple at the boundaries, but model internal command/transition phases explicitly before adding more game rules.

## 6. State-machine discipline

Game and turn lifecycle code must be treated as a state machine.

Every command should define:

- Current required state/phase.
- Required caller identity and membership.
- Allowed command.
- Validation rules.
- Atomic mutation.
- Events emitted.
- Next state/phase.
- Failure behavior.
- Idempotency behavior for duplicate command IDs.

Required interactions to cover:

- Player commands.
- Dice rolls.
- Movement.
- Tile resolution.
- Player action choices.
- End-turn/pass commands.
- Timers/timeouts.
- Disconnects.
- Reconnects.
- Game completion and cleanup.

Current evidence:

- The audit-baseline `TurnService` performed these checks and mutations inline;
  current authorization and typed optional-action transitions are enforced by
  the application command/transition path.
- `GameLoopScheduler` can end games independently of player commands.

Expected standard:

- Invalid transitions should fail without partial state mutation.
- Server-side state must be authoritative.
- Deterministic transition tests are required before refactoring turn or lifecycle behavior.

## 7. Error handling

### Domain validation failures

Examples: not your turn, game not in progress, no pending action, insufficient funds.

Standard:

- Throw/return typed application errors.
- Translate to appropriate transport response at controller/WebSocket boundary.
- Include safe, user-meaningful messages.

### Authorization failures

Standard:

- Return 401 for unauthenticated and 403 for authenticated-but-not-allowed.
- Do not encode authorization as generic 400 failures.

### Malformed input

Standard:

- Reject at transport boundary.
- Do not allow malformed values to reach Redis state.

### Redis/MariaDB failures

Standard:

- Treat as infrastructure failures.
- Avoid leaking connection strings, stack traces, SQL, Redis internals, or secret values to clients.
- Log sufficient context for operators.

### WebSocket delivery failures

Standard:

- A failed outbound WebSocket delivery must not roll back an already committed game transition unless the command explicitly requires synchronous delivery.
- Clients should recover via snapshot/resync.

### Duplicate commands and version conflicts

Standard:

- Duplicate accepted command should return the same result or a clear duplicate response.
- Stale command should fail with a conflict-style application error.

Current evidence:

- `GlobalExceptionHandler` maps `IllegalArgumentException` and `IllegalStateException` to 400 with exception messages and maps generic errors to 500.

## 8. Concurrency and idempotency

Every state-changing command must document its concurrency assumptions.

Standards:

- Use per-game concurrency control, not global locks.
- Avoid duplicate HTTP/WebSocket command effects through command IDs or state versions.
- Treat timer and player-action races as normal, expected cases.
- For Redis updates that span multiple fields/keys, use one of:
  - Redis transaction/watch.
  - Lua script.
  - per-game distributed lock with TTL.
  - optimistic version field with compare-and-set behavior.
- Multi-instance backend behavior must be safe or explicitly documented as unsupported.
- Event publication should include event IDs or state versions so clients can deduplicate.

Current evidence:

- The removed audit-baseline `TurnService#throwDice` performed several
  reads/writes without a lock/version; current commands use Lua CAS and state
  versions.
- `GameLoopScheduler` can run while player commands execute.
- `WebSocketConfig` uses an in-memory simple broker, which is not cross-instance event delivery.

## 9. Security by design

Every feature must account for:

- Authentication.
- Game membership.
- Player identity.
- Host/owner privileges.
- Active-player/turn ownership.
- Resource authorization.
- Input validation.
- Replay protection.
- Client-controlled state.
- WebSocket subscription authorization.
- Information exposure.
- Logging and sensitive-data redaction.
- Secrets and local-only credentials.

Backend authority rules:

- Clients may request commands.
- Clients may not decide dice, movement, rent, money, property ownership, jail state, active player, winner, or stats.
- Frontend state is presentation and cache only.

Current evidence:

- `WebSecurityConfig` permits all.
- `PlayerStateController#savePlayer` accepts arbitrary state.
- `PlayerStateController#grantPlayerMoney` mutates money through a public endpoint.
- `WebSocketConfig` allows all WebSocket origins with `setAllowedOriginPatterns("*")`.

Expected standard:

- State-changing features are incomplete until server-side authorization and anti-replay behavior are addressed or explicitly scoped as dev-only.

## 10. Runtime performance

Correctness, security, and clarity come first. Do not optimize without evidence.

Future changes should still check for:

- Excessive Redis round trips.
- Redis `KEYS` scans.
- Unnecessary MariaDB queries.
- N+1 query patterns.
- Repeated JSON serialization/deserialization.
- Oversized WebSocket messages.
- Full-state broadcasts where small events plus snapshot recovery would work.
- Global locks.
- Blocking external calls on request/WebSocket/scheduler threads.
- Inefficient timers and frontend polling.

Current evidence:

- `GameStateService` and `GameLoopScheduler` use Redis `keys(...)`.
- `GameStateController#getPlayersDetailed` loops players and calls MariaDB/Redis per player.
- `Board.jsx` polls every 2 seconds; `Lobby.jsx` polls every 1 second.
- `DiceEntropyRefillJob#refill` performs a blocking external HTTP call if random.org mode is enabled.

Expected standard:

- Performance claims must cite code, metrics, build output, logs, or profiling.
- Prefer simple fixes with clear evidence over speculative scalability work.

## 11. Maintainability

Standards:

- Names should reflect Sindopoly concepts, not implementation accidents.
- Keep public contracts stable unless a migration plan exists.
- Use comments for non-obvious game rules, Redis lifecycle, concurrency assumptions, temporary compatibility, and security decisions.
- Avoid comments that merely repeat code.
- Treat large methods/classes as warning signals, not automatic failures.
- Remove dead/commented code only after characterization tests or compatibility review.
- Keep configuration ownership clear; avoid multiple conflicting config classes for the same concern.
- Maintain dependency direction: transport -> application -> domain/infrastructure abstractions; infrastructure should not call transport.

Current evidence:

- `Board.jsx` is a large component mixing rendering, polling, game UI state, and animation.
- `CorsConfig` and `WebSecurityConfig` both configure CORS.
- REVAMP-025 removed the confirmed obsolete commented controller/frontend and
  turn implementations; meaningful square-rule comments remain with retained
  test-oriented code.

## 12. Observability

Future game commands and events should support diagnosis without leaking sensitive data.

Expected context:

- `gameId`.
- safe `playerId`.
- command ID.
- event ID.
- state version.
- correlation/request ID.
- command type.
- failure category.

Logging standards:

- Use structured logs where practical.
- Avoid raw stack traces to clients.
- Avoid logging secrets, credentials, invite codes unless explicitly safe and redacted.
- Avoid logging full player state or raw optional-action payloads in production.
- Log enough context to debug duplicate commands, timer races, and failed state transitions.

Current evidence:

- The removed audit-baseline `TurnService#applyAction` printed pending event
  JSON; current command publication does not retain that debug output.
- Several classes use `System.out.println` or `e.printStackTrace()`.
- `GlobalExceptionHandler` logs generic unhandled exceptions server-side.

## Quality gates for future Codex tasks

| Gate | Classification | Checklist |
| --- | --- | --- |
| Correctness | MANDATORY | Does the change preserve server-authoritative game state? Are invalid transitions rejected? |
| Architecture boundaries | MANDATORY | Is transport code free of game-rule decisions? Are Redis/MariaDB/WebSocket concerns in the right layer? |
| Testability | MANDATORY | Are deterministic tests added or clearly deferred with reason? Is randomness/time/infrastructure injectable where needed? |
| Concurrency | REQUIRED_WHEN_APPLICABLE | Does the change document and handle concurrent commands/timers for the same game? |
| Idempotency | REQUIRED_WHEN_APPLICABLE | Are duplicate HTTP/WebSocket commands safe? Is there a command ID or state version when needed? |
| Security | MANDATORY | Are authentication, membership, active-player, host privilege, replay, and input validation addressed? |
| Runtime performance | REQUIRED_WHEN_APPLICABLE | Does the change avoid obvious extra Redis/DB round trips, `KEYS` scans, oversized events, and blocking work? |
| Redis implications | REQUIRED_WHEN_APPLICABLE | Are key names, fields, TTL, serialization, atomicity, and cleanup documented/tested? |
| MariaDB implications | REQUIRED_WHEN_APPLICABLE | Are schema, constraints, query patterns, and transaction boundaries considered? |
| REST implications | REQUIRED_WHEN_APPLICABLE | Are endpoint contracts, status codes, DTOs, and backward compatibility preserved or migrated? |
| WebSocket implications | REQUIRED_WHEN_APPLICABLE | Are destinations, event names, auth, ordering, deduplication, and reconnect behavior covered? |
| Comments and documentation | REQUIRED_WHEN_APPLICABLE | Are non-obvious rules, concurrency assumptions, Redis lifecycle, and compatibility decisions documented? |
| Backward compatibility | REQUIRED_WHEN_APPLICABLE | Is any public contract change deliberate and migration-safe? |
| Verification commands | MANDATORY | Were relevant build/test/lint commands run or skipped with a concrete reason? |

## Pragmatism rules

This model explicitly rejects:

- Abstraction for abstraction's sake.
- Interfaces with only hypothetical value.
- Unnecessary design patterns.
- Splitting simple cohesive code into many tiny classes.
- Speculative scalability work.
- Premature optimization.
- Broad rewrites without characterization tests.
- Public contract changes without migration planning.

The preferred path is small, evidence-backed changes with tests around the behavior being protected.
