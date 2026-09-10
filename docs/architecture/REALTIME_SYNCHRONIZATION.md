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
  "payload": {
    "reason": "ROLL_COMPLETED",
    "actorPlayerId": 41,
    "details": [
      { "type": "DICE_ROLLED", "dice": 7 },
      { "type": "PLAYER_MOVED", "fromPosition": 3, "toPosition": 10 },
      { "type": "LANDED_ON_TILE", "squareId": 10 }
    ]
  }
}
```

Event types are `LOBBY_UPDATED`, `GAME_STARTED`, `TURN_UPDATED`, and
`GAME_COMPLETED`. The exact reason values are `GAME_CREATED`, `PLAYER_JOINED`,
`PLAYER_LEFT`, `PLAYER_KICKED`, `GAME_STARTED`, `ROLL_COMPLETED`,
`ACTION_RESOLVED`, `TURN_TIMED_OUT`, and `GAME_COMPLETED`. Reasons are bounded
and expose no raw Redis fields. Turn notifications additionally carry a
server-derived actor ID and at most 12 typed UI details: `DICE_ROLLED`,
`PLAYER_MOVED`, `LANDED_ON_TILE`, `PROPERTY_AVAILABLE`, `PROPERTY_PURCHASED`,
`PROPERTY_DECLINED`, `RENT_PAID`, `TAX_PAID`, `CARD_DRAWN`, `MONEY_RECEIVED`,
`TURN_CHANGED`, `PLAYER_JAILED`, `PLAYER_RELEASED`, or `JAIL_EXIT_AVAILABLE`.
Card details include the MariaDB card ID, title, thematic text, effect type, and
authoritative amount/destination. These details explain a committed transition;
they are never accepted back as commands and never replace snapshot recovery.
`REPLAY`, `STALE`, and `NO_OP` outcomes emit nothing. Publication failure is
logged with game/type/version only and cannot roll back a committed transition.

One envelope is emitted per committed transition, rather than one broker frame
per internal fact. The active player keeps the REST-driven actionable dialog.
Other subscribed game members render one non-blocking informational notification
from the detail list; the notification contains no game-action controls. A
FIFO holds at most eight notifications. Appending does not restart the active
notification's 5.5-second lifetime; duplicate event IDs are ignored while
queued, and overflow drops the newest arrival so earlier notices cannot starve.
The envelope change is additive: older clients can ignore the new payload fields,
and newer clients treat an older reason-only envelope as a snapshot wake-up with
no observer text.

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

REST CORS and `/ws` share the fail-closed `WebOriginPolicy`; wildcard, empty,
malformed, and production non-HTTPS origins are rejected. The transport bounds
messages to 64 KiB, the per-session send buffer to 512 KiB, and a send to 10
seconds. These are transport-abuse bounds, not application rate limits, and do
not change destinations, envelopes, ordering, or recovery.

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
Pub/Sub publisher/subscriber, Stream, event key, or event history and no
cross-instance delivery claim.
Docker Compose launches one backend instance, which matches this contract. A
horizontally scaled deployment must first introduce an external STOMP broker
relay, a Redis Pub/Sub/Streams bridge, or an equivalent distributed transport;
otherwise clients attached to a different JVM can miss live events. Snapshot
recovery and polling remain authoritative in either topology.

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

Use two independent browser profiles so the HTTP sessions differ. Browser A is
player 1 and Browser B is player 2:

1. Create in A, join in B, and start the game. Confirm both snapshots list the
   same players, positions, balances, and active player.
2. Roll in A. Both browsers must move only player 1 to the same destination;
   player 2 must remain on its previous tile while A's dialog is open.
3. If the destination offers a purchase, A must see Buy/Decline controls while B
   sees a non-blocking Greek informational notice with no game-action controls.
4. Resolve the choice in A. Confirm B sees the purchase/decline result and both
   clients converge on ownership, money, and next player.
5. Repeat until rent and tax occur; confirm the observer text agrees with the
   authoritative balance transfer/deduction.
6. Draw both a Chance and Community Chest card. The active dialog and observer
   notice must contain the seeded thematic description, plus the mechanical
   amount/destination; a generic amount-only message is a failure.
7. Refresh B, then temporarily block `/ws` in B's Network tools and take another
   turn in A. Unblock/reload B and confirm `GET /api/game-state/{gameId}/snapshot`
   restores the latest state even though the transient event was missed.
8. Complete a game and verify both browsers reach the ended snapshot. After the
   300-second terminal TTL, the documented missing-game/404 response is expected;
   STOMP must not recreate expired state.

In DevTools, filter Network by `ws`/`sockjs`, open the active transport, and
inspect STOMP MESSAGE frames for `/topic/game/{gameId}`. Each applied command
should produce one envelope with a monotonically increasing `stateVersion` and
bounded `payload.details`; card frames must include `cardId`, `title`, `text`,
`effect`, and `amount`. Confirm rejected/replayed commands produce no new frame.
Also filter Fetch/XHR by `snapshot`: a newer frame should trigger an authorized
snapshot read, and the browser must render that snapshot rather than applying the
event detail as state.

Stop the local dependencies when finished:

```powershell
docker compose stop mariadb redis
```
