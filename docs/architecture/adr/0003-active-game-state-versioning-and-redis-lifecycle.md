# ADR 0003: Active game state versioning and Redis lifecycle

- Status: Proposed

## Context

Redis is authoritative for active games, but current keys are constructed by
several services, transitions have no version, TTLs differ, and cleanup can
leave related keys such as decks behind. Events and reconnect snapshots cannot
reliably identify stale state. The current schema is recorded in
`docs/audit/REDIS_SCHEMA_CURRENT.md`.

## Decision

Each active game has one monotonically increasing `stateVersion`. Every accepted
authoritative transition compares an expected version and increments it exactly
once in the atomic commit from ADR 0002. Snapshots and emitted events expose the
committed version. Clients never overwrite state from events; they discard old
versions and fetch a snapshot when a gap or contradiction appears.

One active game-state store owns key construction, serialization, reads/writes,
versioning, command markers, atomicity, TTL, and cleanup. Existing keys migrate
incrementally behind that boundary; no key is silently renamed or deleted.

Conceptual key contracts (proposed, not implemented):

| Concept | Redis type | Purpose | Lifecycle |
| --- | --- | --- | --- |
| `game:{gameId}` with `stateVersion` | HASH | Active game metadata and committed version | Lobby/game TTL; shortened only by terminal lifecycle |
| Current membership/player/deck keys | SET/HASH/LIST | Active authoritative state | Aligned with owning game cleanup; current names retained initially |
| `game:{gameId}:commands` | HASH or equivalent bounded structure | Completed command ID to compact status/result/version | Configured retry/reconnect TTL; removed with game lifecycle |
| Per-game concurrency metadata | Store-internal field/key if required | Supports atomic commit, not game rules | Bounded and removed with game lifecycle |

The exact key shape may change during implementation, but type, serializer,
purpose, owner, TTL, atomicity, and compatibility must be documented first.

## Decision drivers

- Detect stale writes and competing transitions.
- Give events and reconnect snapshots a shared ordering reference.
- Centralize scattered Redis ownership and cleanup.
- Permit incremental migration from the current schema.

## Alternatives considered

- **No version, command markers only:** rejected because different commands and
  stale events still conflict.
- **Event sequence as authoritative state:** rejected; transport is not durable.
- **Immediate wholesale key redesign:** rejected as risky and unnecessary.
- **MariaDB as live turn store:** rejected because it duplicates the established
  active-state owner and adds network/transaction work.

## Consequences

All authoritative state-changing paths, including timers, share one version.
Read-only snapshots expose it. State-store APIs replace direct raw access
incrementally. Lifecycle cleanup covers game, membership, players, deck,
commands, and any concurrency metadata owned by that game.

## Security implications

Version checks block stale overwrites but do not replace actor/authorization
checks. Key construction must prevent cross-game access; internal Redis payloads
and command results are never exposed wholesale. Guessable game IDs grant no
access.

## Performance implications

Version reads/writes occur within the bounded atomic operation, avoiding an
extra architectural round trip. Do not broadcast full snapshots for each small
event or scan global keyspaces as a lifecycle substitute.

## Testing implications

Test monotonic increment, one increment per accepted command, unchanged version
on rejection/duplicate, stale conflict, event/snapshot version agreement,
expiry and complete cleanup, and mixed old/new migration fixtures.

## Redis implications

This ADR defines architectural ownership and lifecycle, not final key names.
Existing `game:*`, `player:*`, deck, leaderboard, and entropy contracts remain
as audited until migrated. Idempotency data is transition metadata, not an event
log. Redis Pub/Sub is neither state nor recovery storage.

## MariaDB implications

MariaDB remains durable metadata/statistics storage and does not mirror active
`stateVersion`. Any durable game history is a separate future decision.

## REST/WebSocket implications

REST snapshots expose state version. Mutating requests eventually supply an
expected version. Events carry the resulting version so clients can ignore
stale/duplicate notifications and detect gaps.

## Compatibility and migration

On first migration of an existing active game, the store initializes a version
under a documented compatibility rule (conceptually version zero), then all new
writes use the store. Readers tolerate missing version only during the bounded
migration. Public DTO additions must be backward-compatible before version
becomes required. Old keys are removed only after usage evidence, migration
verification, rollback planning, and documented lifecycle updates.

## Follow-up backlog items

REVAMP-011, REVAMP-018, REVAMP-020, REVAMP-021, and REVAMP-024.

## Explicit non-goals

Redesigning every key, choosing exact TTLs/serializers here, introducing event
sourcing, or defining Redis Cluster deployment.
