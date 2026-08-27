# Sindopoly code-commenting standard

Examples naming `TurnService` or the commented controller/frontend blocks are
audit-baseline examples. REVAMP-025 removes those confirmed obsolete sources;
the commenting rules remain normative for current code.

This standard defines how future Sindopoly code changes should use comments and technical documentation. It is tailored to the current Spring Boot, Redis, MariaDB, REST, WebSocket, scheduler, and React codebase.

Guiding principle:

> Comments should explain intent, business rules, constraints, risks, and reasons, not translate obvious code into prose.

Sindopoly should generally add useful comments alongside meaningful code additions and changes, especially around game rules, state transitions, Redis, WebSockets, authorization, idempotency, concurrency, timers, and compatibility behavior. The goal is not “more comments”; the goal is less mystery.

## Current repository pattern

Representative inspection found:

- REST controllers use Javadoc-like endpoint summaries, for example `GameStateController` and `PlayerStateController`.
- Core services contain a mix of useful intent comments and noisy step comments, for example `TurnService#throwDice`, `GameStateService#createGame`, and `SquareActionService`.
- Redis key and field behavior is partially described in comments but not consistently documented where state is mutated.
- WebSocket configuration has short comments for `/topic`, `/app`, and `/ws`, but does not document security or multi-instance assumptions.
- Frontend code contains many section dividers and line-level comments in `Board.jsx`, some helpful and some only restating Three.js setup.
- Commented-out legacy blocks exist in `TurnController`, `TurnService`, `SquareActionService`, `GamePlayAPI.jsx`, and `Board.jsx`.
- Existing technical comments are mostly English. User-facing board/card content includes Greek. Future technical comments, Javadoc, API docs, Redis docs, and architecture docs should use English unless a user-facing string requires another language.

## 1. What should be commented

Use comments or Javadoc when future code involves a non-obvious rule, invariant, ordering requirement, or risk.

Comments are required or strongly expected for:

- Non-obvious Sindopoly or Monopoly-inspired business rules.
- Dice rules, including future doubles behavior.
- Turn-state transitions.
- Jail or special-tile behavior.
- Passing the starting tile and money awards.
- Property purchase and rent decisions.
- Game-end conditions.
- Server-authoritative calculations.
- Security-sensitive decisions.
- Authorization checks whose reason is not obvious.
- Concurrency control.
- Distributed locks.
- Optimistic state versions.
- Atomic Redis operations.
- Redis Lua scripts.
- Idempotency and command deduplication.
- Event ordering.
- Pub/Sub delivery limitations.
- Reconnect and missed-event recovery.
- Timer races.
- Multi-instance backend behavior.
- Non-obvious performance decisions.
- Backward-compatibility logic.
- Migration logic.
- Framework workarounds.
- Platform-specific Windows, Docker, or WSL behavior.

Good comment topics in this repository include:

- Why one dice command must produce exactly one turn transition.
- Why a WebSocket event is published only after Redis state is committed.
- Why a Redis TTL is 30 seconds after game end.
- Why a player must be a game member before subscribing to `/topic/game/{gameId}`.
- Why a compatibility branch still accepts an old event or DTO shape.
- Why a timer must use the same state version as the player action it can race with.

## 2. What should not be commented

Avoid comments that merely restate:

- Variable assignment.
- Obvious conditions.
- Basic loops.
- Getters and setters.
- Ordinary constructors.
- Simple CRUD operations.
- Directly readable method calls.
- Obvious DTO mappings.
- Import behavior.
- Syntax.

Poor comments:

```java
// Increment the turn number.
turnNumber++;

// Get the player.
Player player = playerRepository.findById(playerId).orElseThrow();

// Return the response.
return ResponseEntity.ok(body);
```

Prefer clear names and small methods over comments that compensate for confusing code. If a method needs many comments to explain basic flow, the next improvement should often be clearer structure, not more prose.

## 3. Javadoc rules

### Mandatory Javadoc

Javadoc is mandatory for public classes or public methods when they expose or coordinate:

- Domain behavior.
- Game lifecycle behavior.
- Turn-state transitions.
- Side effects on Redis or MariaDB.
- Concurrency guarantees.
- Idempotency guarantees.
- Authorization expectations.
- Event publication.
- Failure conditions.
- Non-obvious return semantics.
- Lifecycle cleanup behavior.

Examples where future Javadoc should be expected:

- A command method that rolls dice and advances the turn.
- A service method that writes multiple Redis keys.
- A method that enforces host-only or active-player-only behavior.
- A method that publishes WebSocket events.
- A method that handles reconnect snapshot recovery.

### Recommended Javadoc

Javadoc is recommended for:

- Public DTOs with non-obvious fields.
- Scheduled jobs with timing/race assumptions.
- Configuration classes with production-impacting behavior.
- Redis schema owner classes.

### Unnecessary Javadoc

Javadoc is unnecessary for:

- Trivial getters and setters.
- Record accessors.
- Obvious DTO constructors.
- Simple repository interfaces unless a query has non-obvious semantics.
- Private helpers whose names and local context are clear.

## 4. Inline-comment rules

Inline comments should be close to the decision they explain. They should describe why, not just what.

Use inline comments to explain:

- Why a branch exists.
- Why an operation must happen in a specific order.
- Why a lock or version check is necessary.
- Why an event is published after persistence.
- Why a timeout or TTL uses a specific value.
- Why seemingly redundant validation is intentional.
- Why compatibility code remains.

Good inline comment:

```java
// Publish after the Redis transition commits so reconnecting clients
// can recover the same state from the snapshot endpoint.
eventPublisher.publish(turnAdvanced);
```

Avoid long narrative comments in code. If the explanation needs a page, write or update a design document/ADR and leave a short reference.

## 5. Security comments

Security comments are mandatory when future code contains non-obvious security controls, including:

- Preventing a client from supplying dice values.
- Confirming game membership.
- Enforcing current-turn ownership.
- Preventing arbitrary WebSocket subscriptions.
- Protecting against command replay.
- Rejecting stale state versions.
- Limiting exposed event data.
- Redacting logs.
- Validating identifiers or payload sizes.

The comment should name the threat or invariant.

Good security comment:

```java
// Membership is checked before subscribing so a player cannot observe
// private game events by guessing /topic/game/{gameId}.
authorizeSubscription(playerId, gameId);
```

Poor security comment:

```java
// Security check.
authorizeSubscription(playerId, gameId);
```

## 6. Concurrency comments

Concurrency comments are mandatory for non-obvious behavior such as:

- Per-game locking.
- Optimistic locking.
- Compare-and-set updates.
- Redis transactions.
- Redis Lua scripts.
- Duplicate-event handling.
- Timer and player-action races.
- Exactly-once assumptions.
- At-least-once event delivery.
- Multi-instance subscriber behavior.

The comment should state the concurrency invariant.

Good concurrency comment:

```java
// The state version is checked atomically so two backend instances
// cannot accept separate dice rolls for the same turn.
transitionStore.compareAndAdvance(command);
```

## 7. Redis comments

Redis-related code needs documentation when it creates, changes, deletes, expires, migrates, or atomically updates a key.

Document:

- Key purpose.
- Data type.
- TTL rationale.
- Ownership.
- Lifecycle.
- Atomicity.
- Authoritative state versus cache behavior.
- Backward compatibility.

Do not repeat the full schema at every access if a central schema document exists. A short reference is enough when helpful:

```java
// See docs/architecture/REDIS_SCHEMA.md for game hash fields and TTL rules.
redis.opsForHash().put(gameKey, "status", "ended");
```

For Sindopoly's current patterns, future Redis comments should be especially careful around:

- `game:{gameId}`.
- `game:{gameId}:players`.
- `player:{playerId}`.
- `game:{gameId}:deck`.
- `stats:leaderboard`.
- `dice:entropy`.

## 8. WebSocket and Pub/Sub comments

Comments or Javadoc are required where message behavior depends on:

- Persistence-before-publication ordering.
- Duplicate delivery.
- Out-of-order delivery.
- Lost Pub/Sub messages.
- Snapshot recovery.
- User-specific queues.
- Authorization.
- Multi-instance broadcasting.
- Event deduplication.

Good WebSocket comment:

```java
// This event is only a notification. Clients must refresh the snapshot
// if they reconnect or detect a missing stateVersion.
broker.convertAndSend(topic, event);
```

If Redis Pub/Sub is introduced later, document whether delivery is at-most-once, at-least-once, durable, or recoverable through a snapshot.

## 9. Performance comments

Performance comments should document non-obvious trade-offs, not advertise ordinary code as “optimized”.

Good topics:

- Batching Redis reads to reduce round trips.
- Sending a small event instead of a full game snapshot.
- Using a projection instead of loading a full entity.
- Avoiding a global lock.
- Deferring expensive work from a WebSocket or request thread.

Do not claim performance benefits without evidence or a clear technical reason.

Poor performance comment:

```java
// Fast code.
return repository.findAll();
```

Good performance comment:

```java
// Use the player-current-game index instead of KEYS because this path
// runs on every lobby join attempt.
String gameId = playerGameIndex.find(playerId);
```

## 10. Temporary code and technical debt

Temporary workarounds must explain:

- Why they exist.
- What dependency or limitation requires them.
- What condition allows removal.
- An issue or backlog reference when available.

Avoid:

```java
// TODO fix later
```

Prefer:

```java
// COMPATIBILITY(REVAMP-42): Accept event schema v1 until all supported
// clients consume schema v2. Remove after the v1 client sunset.
```

If no issue tracker exists, include a specific condition:

```java
// COMPATIBILITY: Keep this parser until the frontend no longer sends
// legacy "pass" actions from GamePlayAPI.
```

## 11. TODO and FIXME rules

Approved tags:

- `TODO`: planned improvement that is not a current defect.
- `FIXME`: known defect or incorrect behavior.
- `SECURITY`: known security hardening or vulnerability follow-up.
- `PERFORMANCE`: known performance follow-up with a concrete trigger.
- `COMPATIBILITY`: temporary support for old behavior/contracts.

Recommended format:

```text
TODO(REVAMP-42): Replace polling after snapshot recovery is implemented.
FIXME(REVAMP-51): Rent should debit the payer and credit only the owner.
SECURITY(REVAMP-57): Add subscription-level authorization for private game topics.
PERFORMANCE(REVAMP-63): Replace KEYS with player-current-game index on join path.
COMPATIBILITY(REVAMP-70): Remove v1 action parser after all clients send action v2.
```

Issue identifiers are recommended but not mandatory. The explanation must still be specific enough for a future developer to act.

## 12. Comment maintenance

Comments are part of the code contract.

Whenever behavior changes:

- Update related comments.
- Remove comments that no longer apply.
- Update referenced docs.
- Verify examples still match actual DTOs, Redis fields, events, and endpoints.

Stale comments are defects. Future Codex tasks should check nearby comments before finishing any implementation or refactor.

## 13. Comment language and style

Use English for:

- Code comments.
- Javadoc.
- API documentation.
- Redis documentation.
- Architecture documents.
- Test names and test documentation.

Greek or other languages are fine for user-facing Sindopoly content, board labels, and card text.

Style rules:

- Use complete sentences for explanatory comments.
- Be concise.
- Use precise terms such as command, event, state version, Redis hash, WebSocket topic, active player.
- Avoid conversational filler.
- Avoid emojis in technical comments.
- Do not present speculation as fact.
- Say `Status: UNVERIFIED` in docs when behavior is not confirmed.

## 14. Comment density

Do not target a percentage of commented lines.

Good comment coverage means important intent and constraints are documented. It does not mean every field, branch, or line has a comment.

This standard rejects:

- Commenting every line.
- Comments on every field.
- Generated Javadoc with no useful content.
- Repeated comments across several layers.
- Comments used to hide poor naming.
- Comments used to excuse oversized methods.

## Sindopoly-specific examples

### Good Javadoc

```java
/**
 * Applies a roll command for the active player.
 *
 * The command is accepted only when the game is in progress, the caller is the
 * active player, and no optional action is pending. A successful transition
 * stores the dice result and movement before returning the tile-resolution
 * prompt to the client.
 *
 * Throws a domain validation error when the command is stale, duplicated, or
 * submitted by a non-active player.
 */
public ThrowResultDto throwDice(int gameId, int playerId) { ... }
```

### Good security comment

```java
// The player ID in the URL is not trusted; it must match the authenticated
// session so clients cannot roll or buy property for another player.
playerIdentity.requireSamePlayer(pathPlayerId);
```

### Good concurrency comment

```java
// The timeout command uses the same expected turnVersion as player actions,
// so a late timer cannot rotate a turn that was already completed manually.
turnStore.advanceIfVersionMatches(gameId, expectedTurnVersion);
```

### Good Redis comment

```java
// player:{playerId} is authoritative only while the player is in an active
// game. The 2-hour TTL prevents abandoned lobby state from surviving forever.
redis.expire(playerKey, Duration.ofHours(2));
```

### Good game-rule comment

```java
// Passing Start awards money once per movement command, even when a card
// later moves the player again during tile resolution.
money += START_PASS_REWARD;
```

### Good compatibility comment

```java
// COMPATIBILITY: Older frontend builds still expect squareType/data instead
// of a typed SquareEventDto. Remove after the frontend consumes eventType.
return legacyThrowResult(event);
```

### Unnecessary comment

```java
// Set the status to ended.
game.put("status", "ended");
```

### Misleading comment

```java
// Write everything atomically.
hashOps.putAll(playerKey, init);
```

This is misleading unless the code clearly defines what atomicity means for the Redis operation and related keys.

### Stale comment

```java
// Refresh every 3 s.
const id = setInterval(fetchPublicGames, 10000);
```

The comment and code disagree.

### Over-commented code

```java
// Get the game.
Map<String, String> game = gameStateService.getGame(gameId);
// Get the status.
String status = game.get("status");
// Check if status is lobby.
if ("lobby".equals(status)) { ... }
```

Prefer clearer names and one intent comment only if the branch protects a rule.

## Comment review checklist for future Codex tasks

| Question | Requirement |
| --- | --- |
| Does the changed code contain a non-obvious business rule? | MANDATORY |
| Does it introduce a security invariant? | MANDATORY |
| Does it rely on concurrency or ordering? | MANDATORY |
| Does it create or change Redis lifecycle behavior? | MANDATORY |
| Does it depend on Pub/Sub/WebSocket delivery semantics? | MANDATORY |
| Does it add retry or idempotency behavior? | MANDATORY |
| Does it introduce a compatibility workaround? | MANDATORY |
| Does it make a non-obvious performance trade-off? | RECOMMENDED |
| Would a future developer understand why this implementation exists? | RECOMMENDED |
| Are existing nearby comments still accurate? | MANDATORY |
| Would clearer naming remove the need for the comment? | RECOMMENDED |
| Is the code trivial/self-documenting? | NOT_NEEDED |
| Is this a getter, setter, obvious DTO field, or simple constructor? | NOT_NEEDED |

Future Codex tasks should apply this checklist before final response.
