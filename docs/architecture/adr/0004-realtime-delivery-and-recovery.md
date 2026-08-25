# ADR 0004: Realtime delivery and recovery

- Status: Proposed

## Context

The backend has Spring's in-memory STOMP simple broker, no inbound STOMP command
handlers, and inconsistent event publication. The frontend currently polls
REST. Redis Pub/Sub is absent and would not provide durable replay. Reconnect
and missed-event recovery have no contract.

## Decision

Adopt a hybrid model: authoritative REST snapshots plus authorized STOMP event
notifications for timely updates. Retain the simple broker for current
single-instance operation. Do not add Redis Pub/Sub, Streams, or an external
broker until a demonstrated multi-instance or replay requirement justifies it.

On initial connection/reconnect, the client establishes its authenticated
session, subscribes to authorized game destinations, then fetches an
authoritative REST snapshot. Events carry at least an event ID, game ID, type,
and committed state version. The client discards events at or below its snapshot
version, processes compatible next-version notifications, and refetches a
snapshot on a gap, unsupported event, ordering ambiguity, or reconnect. Events
are deltas/notifications, never the sole authoritative state.

Delivery is at-least-once and may be duplicated or delayed. Client and server
use event ID/state version for deduplication and staleness detection. State is
persisted before publication. Polling remains a staged fallback until realtime
behavior is verified.

If multi-instance deployment becomes required, select an external broker relay
or notification fan-out that reaches all instances. Redis Pub/Sub may provide
ephemeral fan-out but never recovery; Streams/replayable infrastructure is
considered only if snapshot recovery proves insufficient.

## Decision drivers

- REST already supplies snapshots and gives simple durable recovery.
- The simple broker is adequate for today's verified single-instance topology.
- State versions make missed/out-of-order events detectable.
- Avoid speculative durable messaging infrastructure.

## Alternatives considered

- **Polling only:** safe but retains latency/load and discards available STOMP.
- **Events as authoritative state:** rejected because delivery is not durable or
  exactly once.
- **Redis Pub/Sub now:** rejected because it adds infrastructure without replay
  or a present multi-instance requirement.
- **Redis Streams/event sourcing now:** rejected as disproportionate; snapshot
  recovery satisfies current requirements.

## Consequences

REST remains recovery authority. Event contracts need identifiers/version and
one post-commit publisher. Clients must tolerate duplicates/gaps and perform a
bounded snapshot refresh. REVAMP-021 replaces active legacy completion/event
shapes with the bounded taxonomy; old names remain only in an unwired deprecated
fixture pending cleanup.

## Security implications

Handshake/CONNECT uses ADR 0001 identity. Every subscription proves membership
and visibility; knowing a game ID is insufficient. Inbound commands use the
same application authorization path. Payload/destination size, origin, expiry,
cross-game disclosure, and user-specific errors require review.

## Performance implications

Events should be focused notifications rather than full-state broadcasts.
Snapshot refresh occurs on connect/reconnect/gaps, not every event. Polling
reduction must be measured. No distributed broker is mandatory before need.

## Testing implications

Test authenticated/unauthorized subscription, initial subscribe-plus-snapshot,
missed/duplicate/out-of-order events, reconnect/session expiry, event-after-
commit, snapshot/version agreement, fallback polling, and documented
single-instance limits.

## Redis and MariaDB implications

Neither Redis Pub/Sub nor Streams is introduced. Redis active state/version is
the snapshot source behind the application/store boundary. MariaDB has no
realtime-delivery role.

## REST/WebSocket implications

REST exposes authoritative versioned snapshots. STOMP publishes authorized
versioned notifications. Future inbound STOMP and REST intents invoke the same
application commands; this ADR does not prefer one command transport.

## Compatibility and migration

Add version/event metadata and authorized subscriptions while existing REST
polling remains functional. Enable realtime consumers incrementally, verify
recovery, then reduce polling. Event-name/envelope changes require documented
client compatibility; old events are not silently reinterpreted.

## Follow-up backlog items

REVAMP-015, REVAMP-016, REVAMP-018, REVAMP-020, REVAMP-021, and REVAMP-022.

## Explicit non-goals

Implementing WebSockets, selecting an external broker, guaranteeing exactly-once
delivery, retaining a durable event history, or enabling multi-instance scale.
