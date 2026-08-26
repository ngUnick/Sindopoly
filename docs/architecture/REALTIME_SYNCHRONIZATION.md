# Realtime synchronization and recovery

## Contract

Sindopoly uses authenticated STOMP notifications as ephemeral wake-up signals and
`GET /api/game-state/{gameId}/snapshot` as the authoritative recovery read. A
notification is never game state and must not be applied as a delta. The existing
polling paths remain a staged compatibility fallback.

The browser establishes its authenticated HTTP session, connects SockJS/STOMP at
`/ws`, subscribes to `/topic/game/{gameId}`, and then fetches the snapshot.
Subscribing before reading closes the connect/read race. A newer notification, a
version gap, ambiguity, or reconnect requests another snapshot.

## Notification envelope

The server emits one JSON envelope after an `APPLIED` authoritative transition:

```json
{
  "eventId": "f74f74c8-cf70-4cba-8a40-c3ca3214d0e1",
  "eventType": "TURN_UPDATED",
  "gameId": 7,
  "stateVersion": 12,
  "occurredAt": "2026-08-25T10:00:00Z",
  "payload": { "reason": "ROLL_COMPLETED" }
}
```

Event types are `LOBBY_UPDATED`, `GAME_STARTED`, `TURN_UPDATED`, and
`GAME_COMPLETED`. Reasons are bounded and expose no raw Redis fields. `REPLAY`,
`STALE`, and `NO_OP` outcomes emit nothing. Publication failure is logged with
game/type/version only and cannot roll back a committed transition.

## Snapshot and client ordering

The snapshot endpoint requires a current game member. It returns game ID, numeric
version, lifecycle status, active player, winner, visibility/invite metadata,
typed optional action, and bounded public player projections. Replay records and
terminal-finalization data are excluded. The store brackets its multi-key read
with `stateVersion`; changing reads retry up to three times and then fail as a
retryable conflict.

Clients accept snapshots monotonically, ignore notifications at or below their
local version, and use every newer or gapped notification only to request a fresh
snapshot. Bursts coalesce while a read is in flight; a newer notification racing
that read causes one follow-up. One subscription exists per mounted game and is
removed on route change/unmount. Reconnect subscribes first, then recovers. Socket
or read failure retains the last accepted state and polling remains the fallback.
The lobby fallback is reduced from 1 second to 10 seconds and the board fallback
from 2 seconds to 15 seconds; normal state changes now trigger coalesced snapshots.

## Security and deployment limits

The handshake uses the opaque HTTP session. CONNECT without a valid durable player
fails closed. SUBSCRIBE accepts only `/topic/game/{positiveGameId}` and reuses
server-side membership authorization. Client SEND frames are rejected because
commands remain REST-only. `/ws` uses the configured origin allow-list. Errors do
not disclose membership.

An authorized subscription records the server-derived player ID against its
STOMP session/subscription IDs. Outbound broker frames do not reliably retain the
authenticated `Principal`, so delivery resolves that server-owned record and
rechecks current membership. UNSUBSCRIBE and DISCONNECT remove the record. This
closes the defect found by the real transport suite where valid notifications
were dropped while preserving post-subscription revocation checks.

Records are keyed by `(STOMP session ID, subscription ID)` and contain only game
and player IDs. Reused subscription IDs fail closed while the replacement is
authorized; session-scoped disconnect cleanup cannot remove a reconnecting
session's records. An abrupt transport loss may retain a small process-local
record until Spring dispatches disconnect cleanup, but that record cannot
authorize a new session. Revocation is evaluated at the outbound membership
check: a frame already authorized just before removal may be in flight, while
frames checked after committed removal are dropped.

The Spring simple broker is process-local and non-durable. There is no Redis
Pub/Sub, Stream, event key, or event history and no cross-instance delivery claim.
A multi-instance deployment therefore needs a future broker decision; snapshot
recovery and polling remain authoritative.

## Verification

Backend fast tests cover CONNECT/subscription authorization, forbidden SEND and
destinations, typed committed-version publication, and publication failure.
Frontend tests cover malformed/cross-game validation, duplicate/stale/out-of-order
handling, gap recovery, burst coalescing, late and in-flight read races, reconnect,
and command-response versus snapshot versions. The CI frontend job runs this
Node-based suite before its production build.

REVAMP-022 adds real-port HTTP/session/CSRF and `/ws` SockJS-over-WebSocket STOMP
coverage to the existing Testcontainers integration tier. It verifies authorized
delivery, denied subscriptions/SEND, membership revocation, one notification for
concurrent idempotent retries, no notification for rejected stale/reused commands,
disconnect/reconnect snapshot recovery, and the critical flow through scheduler
completion and MariaDB finalization. This is server-transport coverage, not a
browser-rendering or cross-instance broker claim; those limits above remain.

## Manual Windows verification

From the repository root in PowerShell:

```powershell
docker compose up -d mariadb redis
cd Sindopoly-Java
.\mvnw.cmd spring-boot:run
```

In a second PowerShell window:

```powershell
cd sindopoly-front
npm.cmd run dev
```

Open two independent browser sessions, create/join/start one game, and confirm
that an action by player A updates player B's position, balance, active turn, and
optional action. In browser developer tools, temporarily block the `/ws` request,
advance the game in A, unblock it, and confirm B reconnects to the latest version
without duplicate prompts or subscriptions. Repeat across completion and verify a
reconnecting client reaches the ended snapshot. After the 300-second terminal TTL,
the documented missing-game/404 response is expected; STOMP must not recreate it.

Stop the local dependencies when finished:

```powershell
docker compose stop mariadb redis
```
