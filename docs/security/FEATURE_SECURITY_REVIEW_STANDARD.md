# Feature security review standard

This standard defines the security review process for every non-trivial Sindopoly feature, bug fix, refactor, or infrastructure-facing change. It aligns with the engineering quality model and code-commenting standard:

- Security is part of the normal engineering workflow.
- The backend remains authoritative for game outcomes.
- Reviews must be evidence-based and proportional to the changed attack surface.
- Do not turn every bug into a vulnerability; identify realistic game-integrity, authorization, state-manipulation, messaging, and availability risks.

Use this process in Codex prompts, code reviews, merge requests, and release verification.

## Security principles

### 1. Backend-authoritative state

The backend must remain authoritative for:

- Dice results.
- Active player.
- Turn number and turn phase.
- Movement and player position.
- Balances.
- Property ownership.
- Rent, penalties, and rewards.
- Timer outcomes.
- Game completion.
- Game-state transitions.

Clients may submit intent, not authoritative results.

Acceptable client intent:

```json
{
  "commandId": "7f428251-39d7-4a26-9853-a862d59db486"
}
```

Client-controlled fields that should normally be rejected or ignored:

```json
{
  "diceTotal": 12,
  "newPosition": 28,
  "newBalance": 1700,
  "nextPlayerId": "player-4"
}
```

Trusting these fields creates direct game-state manipulation risk: a compromised frontend or malicious player can choose outcomes instead of requesting actions.

### 2. Authentication is not authorization

Every externally triggered operation must verify the actor's right to perform the requested action.

Reviews must distinguish:

- Authentication: who is the user?
- Game membership: is the player in this game?
- Resource authorization: can the actor access this game/property/card/stat/resource?
- Turn authorization: is this the active player?
- Phase authorization: is this command valid in the current game/turn phase?
- Administrative authorization: is this host/admin-only?
- Subscription authorization: may this user subscribe to this WebSocket destination?

### 3. Never trust client-supplied identity

The server should derive player identity from authenticated context or trusted server-side mapping.

A client-supplied value such as:

```json
{
  "playerId": "player-123"
}
```

is not proof of identity. If a player identifier is included for routing/resource selection, it must be checked against the authenticated actor.

### 4. Input validation

Every external input surface must be reviewed:

- REST path variables.
- Query parameters.
- Request bodies.
- Headers.
- WebSocket messages.
- STOMP destinations.
- Lobby settings.
- Player names.
- Game identifiers.
- Property/tile/card identifiers.
- Chat or user-generated content, if introduced.
- Administrative inputs.
- Imported or serialized state.

Validation considerations:

- Type validation.
- Nullability.
- Allowed values.
- Length limits.
- Numeric ranges.
- Enum validation.
- Normalization.
- Unexpected fields.
- Malformed identifiers.
- Oversized payloads.
- Unsupported state combinations.
- Stored-content risks.
- Injection risks.
- Deserialization risks.

Frontend validation is useful UX, never sufficient security.

### 5. Idempotency and replay protection

Review every command that may be double-clicked, retried, resent, replayed, or delivered more than once:

- Rolling dice.
- Buying property.
- Ending a turn.
- Joining/leaving a game.
- Starting a game.
- Accepting/rejecting trades, if added.
- Paying rent.
- Resolving cards.
- Handling timeouts.

Future implementations should consider a command ID or idempotency key. The exact implementation can vary, but the security property must be addressed.

If Redis is used for deduplication, document:

```text
Key:
game:{gameId}:command:{commandId}

Type:
STRING, HASH or documented equivalent

Purpose:
Command deduplication and replay protection

Example values:
PROCESSING
COMPLETED
FAILED_RETRYABLE

TTL:
Must be explicitly documented

Security invariant:
The same logical command must not produce duplicate game-state changes.
```

### 6. Concurrency is a security concern

Race conditions are correctness and security risks. Reviews must consider:

- Two roll requests at the same time.
- Timer and player action executing together.
- Two backend instances processing the same command.
- Two players attempting to buy the same resource.
- Reconnect processing while cleanup runs.
- Duplicate Pub/Sub delivery.
- Stale state overwriting newer state.
- Turn advancement happening twice.
- Game-end logic racing with another transition.

Document concurrency invariants, such as:

- Only one dice roll may be accepted for a specific game-state version.
- Only one transition may advance a turn from `TURN_COMPLETE`.
- A timer must not end a turn that has already advanced.

Consider per-game locking, optimistic state versions, compare-and-set updates, Redis transactions, Lua scripts, database constraints, and event deduplication. Do not mandate global locks.

### 7. WebSocket security

Every WebSocket-related feature review must consider:

- Authentication during handshake or STOMP CONNECT.
- Token expiry.
- Session-to-user mapping.
- Inbound destination authorization.
- Outbound subscription authorization.
- Arbitrary topic subscription.
- Private game visibility.
- User-specific error queues.
- Payload validation.
- Forged player IDs.
- Replayed WebSocket commands.
- Oversized messages.
- Disconnect cleanup.
- Reconnect behavior.
- Cross-game information leakage.
- Origin restrictions.
- Multi-instance behavior.

Required invariant:

> Guessing or knowing a game ID must not automatically authorize subscription to that game's private events.

Trace every WebSocket feature:

```text
Authenticated user
-> WebSocket session
-> requested destination
-> authorization decision
-> game membership
-> subscribed topic
```

### 8. Redis security

For every Redis read/write/delete/expire, review:

- Exact key ownership.
- Whether the key contains sensitive data.
- Whether the key is authoritative state, cache, lock, event, or idempotency marker.
- Serialization safety.
- TTL.
- Cleanup.
- Atomicity.
- Stale-state behavior.
- Key collision risk.
- Predictable identifiers.
- Accidental cross-game access.
- Unsafe deserialization.
- Direct exposure of internal Redis structures through APIs.
- Multi-instance consistency.

Redis Pub/Sub must not be treated as durable authoritative state because disconnected subscribers may miss messages.

### 9. MariaDB security

Review:

- Parameterized/ORM query safety.
- Mass assignment.
- Entity overexposure.
- Unique constraints.
- Foreign-key constraints.
- Ownership validation.
- Transaction boundaries.
- Sensitive fields.
- Unintended cascade behavior.
- Migration safety.
- Data retention.
- Duplicate/conflicting state between MariaDB and Redis.

ORM use does not eliminate authorization or data-integrity risks.

### 10. REST API security

For every changed or added endpoint, review:

- Authentication.
- Authorization.
- Path-resource ownership.
- Request validation.
- Response data exposure.
- Idempotency.
- Replay.
- Abuse considerations.
- Error handling.
- Status codes.
- Method semantics.
- CORS.
- CSRF relevance.
- Logging.
- Enumeration risks.
- Insecure direct object references.

Always ask:

```text
Can a user change the gameId, playerId or resourceId and access another resource?
```

### 11. Event and Pub/Sub security

For every event, review:

- Who is allowed to create it.
- Whether it represents intent or authoritative result.
- Whether state is persisted before publication.
- Whether the event may be duplicated.
- Whether it may arrive out of order.
- Whether it contains sensitive data.
- Whether unauthorized subscribers can receive it.
- Whether a malicious producer can forge it.
- Whether consumers validate game ID, event ID, and state version.
- Whether schema changes require compatibility planning.

Recommended metadata to consider:

```json
{
  "eventId": "01J...",
  "gameId": "game-123",
  "type": "DICE_ROLLED",
  "actorPlayerId": "player-4",
  "stateVersion": 28,
  "occurredAt": "2026-07-13T18:42:00Z"
}
```

Do not require this exact schema if another valid contract is adopted.

### 12. Secrets and configuration

Review:

- Committed credentials.
- Default passwords.
- Production secrets in source control.
- `.env` files.
- Example configuration.
- Redis exposure.
- MariaDB exposure.
- Container port exposure.
- Insecure production defaults.
- Debug mode.
- Stack-trace exposure.
- Permissive CORS.
- Logging connection strings.
- Secret rotation.
- Development vs production profiles.

Example environment files must use placeholder-only values.

### 13. Logging and information disclosure

Review whether logs/errors expose:

- Passwords, tokens, cookies.
- Connection strings.
- Private WebSocket headers.
- Full request bodies.
- Sensitive player metadata.
- Internal Redis payloads.
- Stack traces.
- SQL details.
- Infrastructure hostnames.
- Private game information.

Useful diagnostic context:

- Game ID.
- Command ID.
- Event ID.
- State version.
- Error category.

Use diagnostic context without sensitive data.

### 14. Error handling

Future features must define safe failure behavior:

- Client-visible error messages.
- Authorization failures.
- Validation failures.
- State conflicts.
- Duplicate commands.
- Infrastructure failures.
- Internal exceptions.
- WebSocket error delivery.

Errors should not reveal unnecessary internal implementation details.

### 15. Abuse and resource exhaustion

Apply a lightweight abuse review at public entry points:

- Repeated lobby creation.
- Repeated join/leave cycles.
- WebSocket connection/subscription floods.
- Large messages.
- Repeated invalid commands.
- Timer creation.
- Game creation without cleanup.
- Unbounded Redis keys.
- Event-stream growth.
- Expensive endpoints.
- Repeated reconnects.
- Chat/user-generated content, if added.

Do not require rate limiting for every internal method.

### 16. Security comments

Follow `docs/engineering/CODE_COMMENTING_STANDARD.md`.

Good example:

```java
// The player ID from the payload is not trusted for authorization.
// The acting player is resolved from the authenticated WebSocket session.
```

Bad example:

```java
// Security check
```

Security comments must explain the invariant or threat being mitigated.

## Required feature review process

### Step 1 — Identify changed attack surface

Document whether the change affects:

- REST.
- WebSockets.
- Redis.
- Pub/Sub/events.
- MariaDB.
- Authentication.
- Authorization.
- Game-state transitions.
- Timers.
- Frontend input.
- Configuration.
- Logging.

### Step 2 — Identify protected invariants

Examples:

- Only the active player may roll.
- A command may change game state at most once.
- A player may subscribe only to games they are authorized to view.
- Clients cannot choose dice results.
- A stale event cannot overwrite newer state.

### Step 3 — Identify abuse cases

Describe realistic misuse or malicious cases, such as:

- Changing `playerId` to another player.
- Replaying the same roll command.
- Subscribing to another game's topic.
- Sending a stale action after the turn advanced.
- Sending oversized or malformed payloads.

### Step 4 — Define controls

Document:

- Validations.
- Authorization checks.
- Concurrency controls.
- Idempotency/replay protection.
- Payload restrictions.
- Safe error behavior.
- Logging/redaction behavior.

### Step 5 — Add tests

Relevant tests include:

- Unauthenticated request.
- Unauthorized game access.
- Invalid active player.
- Invalid turn phase.
- Forged player ID.
- Duplicate request.
- Concurrent request.
- Stale state version.
- Unauthorized WebSocket subscription.
- Malformed payload.
- Oversized input, where relevant.
- Sensitive-data response test.

### Step 6 — Review logs and errors

Confirm no secrets, internal payloads, stack traces, or infrastructure details are exposed to clients or unsafe logs.

### Step 7 — Review Redis and database implications

Document key, TTL, atomicity, transaction, cleanup, migration, and ownership implications.

### Step 8 — Record residual risk

State what is not addressed and why. Residual risk must be visible in the merge request security section.

## Reusable merge request security section

Future merge requests should include:

```text
## Security review

Attack surface changed:
...

Protected invariants:
...

Authorization checks:
...

Validation:
...

Replay/idempotency:
...

Concurrency:
...

Redis/database implications:
...

WebSocket implications:
...

Sensitive data/logging:
...

Tests:
...

Residual risks:
...
```

If a section is not applicable, write `Not applicable` with a short reason.
