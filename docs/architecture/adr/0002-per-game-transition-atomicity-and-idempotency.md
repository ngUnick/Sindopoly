# ADR 0002: Per-game transition atomicity and idempotency

- Status: Proposed

## Context

Current roll/action/end paths update several Redis values without a version,
command ID, atomic commit, or multi-instance guard. Retries and timer/player
races can therefore commit the same or competing transitions. Exactly-once
transport delivery cannot be assumed.

## Decision

Every authoritative mutation is an application command with a unique command
ID and expected game-state version. Browser clients originate stable IDs for
retryable REST/STOMP intents; server jobs generate deterministic IDs from the
job kind, game, and triggering state/version.

The application computes a proposed deterministic transition from a snapshot.
The active game-state store then performs one per-game atomic compare-and-commit:
verify expected version, check the command marker, apply all Redis mutations,
increment version, and store a compact completed result/marker. The initial
implementation direction is a centralized Redis Lua operation because it can
atomically validate and update the current multi-key state on the present Redis
topology. The store API, not domain rules, owns that mechanism.

A repeated completed command returns the recorded compatible result without
reapplying. Competing commands with the same expected version allow one commit;
others receive a stale/conflict result and must refresh. If an implementation
later reserves a command before computing, duplicates observing `processing`
receive an explicit retryable/in-progress result. Marker/result retention has a
configured TTL at least covering the active game's retry/reconnect window; no
arbitrary duration is fixed here.

## Decision drivers

- Prevent duplicate rolls/actions and timer/action double advancement.
- Work across backend instances without global/JVM locks.
- Keep domain rules deterministic and infrastructure-independent.
- Make stale/conflict behavior explicit to REST and realtime clients.

## Alternatives considered

- **Global or JVM lock:** rejected for throughput and multi-instance failure.
- **Per-game distributed lock alone:** rejected because expiry/failure does not
  provide deduplication or stale-state detection.
- **Redis WATCH/MULTI:** viable fallback but retry/control logic is less cohesive
  for the current multi-key transition.
- **Exactly-once messaging/event sourcing:** rejected as unnecessary complexity.

## Consequences

Mutating contracts eventually carry command ID and expected version. The store
becomes the single atomic commit owner. Redis and MariaDB are not presented as
one transaction: durable stats/finalization require explicit idempotent
follow-up handling.

## Security implications

Command IDs do not authorize; they are scoped to authenticated actor/game and
validated before use. Deduplication prevents replay from applying twice, while
state/version and authorization reject stale or forged commands.

## Performance implications

One bounded per-game atomic operation replaces repeated race-prone writes.
There is no global lock. Lua payloads and result markers must remain bounded;
TTL tuning and measurement remain configuration work.

## Testing implications

Test duplicate/retry, same-version competing commands, timer/player race,
multi-instance simulation, stale version, processing duplicate behavior,
failure before/after commit, and event-after-commit ordering. Application tests
inject deterministic command IDs and versions.

## Redis implications

The store owns compare-and-commit, version, command markers/results, TTL, and
cleanup. Proposed key concepts are detailed in ADR 0003. Redis Cluster/hash-slot
compatibility must be addressed before adopting a clustered topology.

## MariaDB implications

No cross-store atomic transaction is claimed. Stats/finalization must use its
own idempotency/constraint strategy when later implemented.

## REST/WebSocket implications

Mutating commands converge on the same application path. They eventually carry
command ID/expected version and return completed, duplicate, stale/conflict, or
retryable outcomes through transport-specific mappings.

## Compatibility and migration

Add the internal command/store boundary first. Legacy REST adapters may generate
a command ID and read the current version during transition, but that fallback
does not promise retry idempotency and must be removed after clients migrate.
Move one command family at a time.

## Follow-up backlog items

REVAMP-018, REVAMP-020, and REVAMP-021; REVAMP-011 provides infrastructure.

## Explicit non-goals

Implementing Lua/keys, selecting TTL numbers, guaranteeing exactly-once event
delivery, or making Redis and MariaDB one atomic transaction.
