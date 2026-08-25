# Game command authorization

## Scope and authority

REVAMP-016 centralizes current REST game authorization in
`GameAuthorizationService`. The authenticated actor is resolved only from the
Spring Security session through `PlayerPrincipal` and
`AuthenticatedPlayerResolver`. Path, query, and body player IDs remain
compatibility selectors or consistency checks; they never grant authority.

The policy loads one authorization snapshot from the existing Redis game hash
and membership set. Controllers use it for private reads and lifecycle actions;
`TurnCommandService` applies the equivalent snapshot policy at the application-command boundary before gameplay
mutation. The same policy has no servlet dependency and can be reused by future
inbound WebSocket adapters.

## Authorization matrix

| REST route | Command/read | Actor and selectors | Required policy | Previous behavior | REVAMP-016 behavior |
| --- | --- | --- | --- | --- | --- |
| `POST /api/game-state/create` | Create game | Session actor; body `ownerId` must match | Authenticated actor | Identity match only | Unchanged; creator remains host under the current owner-as-game-ID schema |
| `POST /api/game-state/add/{gameId}/{playerId}` | Join public lobby | Session actor; path player must match | Authenticated actor; existing lobby/capacity/visibility validation | No game authorization beyond identity | Join remains available before membership; client identity cannot be substituted |
| `POST /api/game-state/join-with-invite` | Join private lobby | Session actor; query player must match | Authenticated actor; existing invite/lobby/capacity validation | No game authorization beyond identity | Same compatibility contract; invite is a selector, not identity |
| `POST /api/game-state/{gameId}/remove-player` | Leave self | Session actor; query player must match | Existing-game membership | Any authenticated matching player could target any game ID | Cross-game/self-removal attempts are rejected |
| `POST /api/game-state/{gameId}/players/{target}/kick` | Host kick | Session host actor; path target is resource only | Host membership, host role, `LOBBY`, target membership, actor differs from target | UI attempted to impersonate target through self-removal | Explicit actor/target command; arbitrary deletion and in-progress kick are rejected |
| `POST /api/game-state/{gameId}/start` | Start game | Session actor; query player must match | Host membership, host role, `LOBBY`, at least two members | Partial owner check in service; non-host error handling was inconsistent | Central host/lifecycle guard; minimum-player failure is a conflict |
| private game and player-list GET routes | Private snapshot/read | Session actor; path game selector | Existing-game membership | Any authenticated player knowing a game ID could read | Non-members receive `403`; missing games receive `404` |
| `GET /api/game-state/public-lobby` | Public discovery | None | Intentionally public metadata only | Public | Unchanged |
| `POST /api/turn/{gameId}/{playerId}/throw` | Roll | Session actor; path player must match | Membership, `IN_PROGRESS`, active player, no pending option | Service checked lifecycle/turn/option with mixed `400` behavior | Wrong actor is `403`; lifecycle/phase conflict is `409` |
| `POST .../action` | Resolve option | Session actor; path/body IDs must agree | Membership, `IN_PROGRESS`, active player, pending option | Body DTO entered service after identity checks; option ownership was implicit | Service receives trusted actor plus choice only and authorizes before mutation |
| `POST .../pass` | Decline option | Session actor; path player must match | Membership, `IN_PROGRESS`, active player, pending option | Controller orchestrated several state calls | One authorized application-service entry performs the existing pass flow |

`GET /api/game-state/players-detailed-lobby/{gameId}`,
`GET /api/game-state/players-detailed/{gameId}`,
`GET /api/game-state/players/{gameId}`, `GET /api/game-state/{gameId}`,
and `GET /api/game-state/{gameId}/players` are private membership reads.

## Lifecycle, phase, and error semantics

Current Redis values map to the canonical model without a schema migration:

- `status=lobby` maps to `LOBBY/NONE`;
- `status=inProgress` plus no `optionalAction` maps to
  `IN_PROGRESS/AWAITING_ROLL`;
- `status=inProgress` plus `optionalAction` maps to
  `IN_PROGRESS/AWAITING_OPTIONAL_ACTION`;
- `status=ended` maps to `COMPLETED/NONE`.

REST failures are deterministic at the new policy boundary:

| Status | Meaning |
| --- | --- |
| `401` | Missing, expired, invalidated, or stale authenticated session |
| `403` | Actor-ID mismatch, non-member, non-host, non-active player, or invalid kick target |
| `404` | Selected active game does not exist |
| `409` | Wrong lifecycle/turn phase or unmet start-state requirement |
| `400` | Malformed/invalid request or a legacy adapter validation failure |

The `403` body remains generic and does not disclose the denied role or private
game state. Redis/SQL payloads and stack traces are not returned.

## Redis authorization facts

Redis continues to be authoritative for active-game authorization:

| Key | Type and serialization | Facts read | TTL/lifecycle | Owner |
| --- | --- | --- | --- | --- |
| `game:{gameId}` | HASH; string keys/fields/values via `StringRedisSerializer` | `status`, `playerTurn`, typed `optionalAction`, and private `turnOrder`; creator/host is inferred from `gameId` because no owner field exists | 24 hours at lobby creation; shortened to 30 seconds after current end flow | Transition command/store boundary |
| `game:{gameId}:players` | SET of decimal player-ID strings via `StringRedisSerializer` | Current active-game membership and kick target membership | 24 hours at lobby creation; shortened to 30 seconds after current end flow | `GameStateService` |

One authorization decision performs one game-hash load and one membership-set
load, then reuses that snapshot for its membership, host, active-player, and
phase checks. There is no authorization cache because stale authorization is
more dangerous than the bounded Redis reads.

REVAMP-018 adds `stateVersion` and the bounded `game:{gameId}:commands` retry
hash. REVAMP-019 adds private `turnOrder` to the existing game hash. Ordered
state must exactly match membership and is never inferred from SET iteration;
ambiguous legacy state fails closed. Neither change renames keys, changes
serializers, or adds a session/role cache.

MariaDB schema/entity changes: **NONE**. Durable `Player` existence continues
to be checked by the established actor resolver; active membership and roles
are not duplicated into MariaDB.

## Concurrency and deferred boundaries

REVAMP-018 now calculates normal create/join/start/leave/kick/roll/action/pass
commands from an authoritative snapshot and compares that snapshot's version in
one Redis Lua commit. Membership, host, active-player, and phase facts cannot
change between authorization and a successful mutation without causing a stale
conflict. Current membership is checked before private turn/start/kick replay;
exact replay is then checked before freshness, and fingerprints bind the
server-derived actor. Self-leave replay is intentionally allowed after the
command revokes membership because its result is bounded non-private removal
metadata. No JVM/global/distributed lock is used. Snapshot reads
remain separate Redis operations, but their result is only advisory until the
compare-and-commit succeeds.

This closes per-game TOCTOU only. The cross-game "one active game per player"
scan is not protected by either game's version, so simultaneous joins to two
games remain a documented race for the state-infrastructure/index work in
REVAMP-023/REVAMP-027.

REVAMP-017 removed arbitrary player-state overwrite/deletion, money grant,
client-triggered game deletion, and manual completion evaluation. Authenticated
self-leave and explicit lobby-host kick remain the supported membership
commands; completion and cleanup remain server-owned. REVAMP-021 owns
STOMP CONNECT identity propagation, destination/subscription authorization,
reconnect recovery, and WebSocket origin hardening. Current realtime delivery
is Spring's in-memory STOMP simple broker, not Redis Pub/Sub.

## Client migration and examples

The React lobby now calls the explicit host-kick route. UI host/turn controls
remain convenience only; a manipulated browser receives the same backend
denial. Clients must handle `401`, `403`, and `409` without treating cached
`player_id` as proof.

Cookie and CSRF-aware curl flow (requires `jq`; values shown are placeholders):

```bash
# Establish the host session and retain cookies.
curl -sS -c host.cookies -H 'Content-Type: application/json' \
  -d '{"nickname":"HostExample"}' \
  http://localhost:8080/api/player-state/create

# Obtain the per-session CSRF token and header name.
curl -sS -b host.cookies -c host.cookies \
  http://localhost:8080/api/session/csrf > host-csrf.json
TOKEN=$(jq -r .token host-csrf.json)
HEADER=$(jq -r .headerName host-csrf.json)

# Authorized private read (HOST_ID also selects its creator-owned game).
curl -sS -b host.cookies \
  http://localhost:8080/api/game-state/HOST_ID

# Authorized host kick; TARGET_ID never becomes the acting identity.
curl -sS -b host.cookies -H "$HEADER: $TOKEN" -X POST \
  http://localhost:8080/api/game-state/HOST_ID/players/TARGET_ID/kick

# A different authenticated non-member cookie receives HTTP 403.
curl -i -b outsider.cookies \
  http://localhost:8080/api/game-state/HOST_ID
```

Postman uses the same flow: preserve the `JSESSIONID` cookie, call
`GET /api/session/csrf`, copy the returned token into its returned header name,
and send only the authenticated actor's legacy player ID where an adapter still
requires one. Never copy session or CSRF values into documentation or logs.

The former `DELETE /api/game-state/{gameId}` and
`POST /api/game-state/{gameId}/check-end` compatibility adapters are no longer
routable. Clients do not replace manual completion with another endpoint;
server transitions and the scheduler evaluate terminal conditions.
