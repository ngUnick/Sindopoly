# REST API contract

Base URL in the local development topology: `http://localhost:8080`.
Request and response media type is JSON unless noted. OpenAPI is enabled only
when configured (enabled by default in `dev`, disabled by default in `prod`).

## Session, CSRF, and command concurrency

Sindopoly has no password login. `POST /api/player-state/create` creates a
durable player and an opaque server session; subsequent browser calls must send
that session cookie. The server-derived session player is authoritative even
where a compatibility path/query/body `playerId` remains.

Unsafe authenticated requests require the CSRF value returned by
`GET /api/session/csrf` in `X-XSRF-TOKEN`. The identity-creation endpoint is the
only unsafe `/api` CSRF exemption. Browser requests use credentials.

Every game-state mutation also requires:

| Header | Contract |
| --- | --- |
| `X-Sindopoly-Command-Id` | Canonical UUID. Equivalent replay returns the recorded semantic result; reuse for different intent conflicts. |
| `X-Sindopoly-Expected-Version` | `-1` for create; otherwise the last snapshot/command version, from `0` through `9007199254740990`. A stale value conflicts without mutation. |

Successful command responses contain `stateVersion` and `replayed` along with
operation-specific data. Generate a new command ID for new intent; retain the
same ID only when retrying an uncertain identical request. Use the version
returned by a command or authoritative snapshot; never increment it locally.

Each game retains at most 4096 accepted command IDs for its lifetime; records
are not evicted and new IDs fail closed at capacity. Equivalent replay produces
no second mutation/event. UUID reuse with a different fingerprint, stale
expected version, rejected validation/authorization, and transition no-op also
produce no applied event.

## Endpoints

Unless a row states otherwise, GET routes are reads with no CSRF requirement,
and POST routes are mutations requiring the authenticated session plus CSRF.
All game/turn POST routes additionally require both command headers. Successful
reads and mutations return `200` JSON except logout (`204`); the common error
statuses below apply to every route according to its guards.

### Identity and session

| Method and path | Access | Request / result |
| --- | --- | --- |
| `POST /api/player-state/create` | Anonymous only; CSRF exempt | `{ "nickname": "..." }` → numeric player ID and authenticated session. Rejects an already authenticated session. |
| `GET /api/session/me` | Authenticated | Current server-derived player identity. |
| `GET /api/session/current-game` | Authenticated | Current resumable game for the server-derived player, or `204` when none exists. |
| `GET /api/session/csrf` | Authenticated | CSRF token for unsafe requests. |
| `POST /api/session/logout` | Authenticated + CSRF | Invalidates session, removes session/CSRF cookies, returns `204`. |
| `GET /api/player-state/{playerId}` | Same player only | Current bounded player projection. |

`GET /api/session/current-game` accepts no player ID. A successful lookup returns
`{gameId,status,stateVersion,visibility}` with canonical `status` equal to
`lobby` or `inProgress` and `visibility` equal to `public` or `private`.
Membership is discovered through the existing incremental Redis SCAN adapter
and then revalidated against a stable game snapshot. Missing games, stale
memberships, players who left or were kicked, host-deleted lobbies, and retained
`ended` games produce `204`. If corrupt state exposes more than one resumable
game for the player, the request fails explicitly with `409` rather than using
Redis scan order. An absent or expired authenticated session produces `401`.
This read adds no Redis key, reverse index, TTL, or MariaDB schema change.

### Board reference data

| Method and path | Access | Request / result |
| --- | --- | --- |
| `GET /api/board/squares` | Authenticated | No body → exactly 40 canonical board-square metadata objects in ascending position order. |

Each object has `position` (the contiguous integer `0`–`39`), a non-blank Greek
`name`, and the canonical `type`. Purchasable squares also have
`property: {purchasePrice,baseRent,group}`. `baseRent` is `null` only for
utilities, whose charge is calculated by the authoritative turn service;
`group` is the exact canonical type name. Special, card, tax, jail, parking,
go-to-jail, and Start squares have `property: null`.

```json
[
  {
    "position": 0,
    "name": "ΑΦΕΤΗΡΙΑ",
    "type": "START",
    "property": null
  },
  {
    "position": 39,
    "name": "ΗΛΕΚΤΡΟΝΙΚΗΣ",
    "type": "BLUE",
    "property": {
      "purchasePrice": 400,
      "baseRent": 50,
      "group": "BLUE"
    }
  }
]
```

The projection is global immutable reference data, not game state, so it needs
an authenticated session but no game membership, command headers, or CSRF. The
server fails closed rather than returning a partial, unordered, duplicated, or
malformed catalog. MariaDB/Flyway owns the source rows; the endpoint does one
ordered read and creates no Redis key, poll, timer, or STOMP event.

### Lobby and game state

| Method and path | Request and response | Authorization / purpose |
| --- | --- | --- |
| `GET /api/game-state/public-lobby` | No body → list of bounded public lobby maps | Anonymous discovery. |
| `POST /api/game-state/create` | `{ownerId, visibility}` → game map with `gameId`, `stateVersion`, `replayed` | Actor/body ID match. Expected version must be `-1`. |
| `POST /api/game-state/add/{gameId}/{playerId}` | No body → join result/version/replay | Actor joins an eligible public lobby as self. |
| `POST /api/game-state/join-with-invite?inviteCode=...&playerId=...` | No body → join result/version/replay | Actor joins as self using invite. |
| `GET /api/game-state/invite-metadata?inviteCode=...` | No body → `{gameId,stateVersion}` | Authenticated bounded pre-join lookup. |
| `POST /api/game-state/{gameId}/start?playerId=...` | No body → started game result/version/replay | Eligible lobby host. |
| `POST /api/game-state/{gameId}/remove-player?playerId=...` | No body → bounded leave result/version/replay | Member leaves as self. |
| `POST /api/game-state/{gameId}/players/{targetPlayerId}/kick` | No body → bounded kick result/version/replay | Lobby host kicks another member. |
| `GET /api/game-state/{gameId}/snapshot` | No body → authoritative `GameRealtimeSnapshot` | Member recovery read. |
| `GET /api/game-state/{gameId}` | No body → private game hash projection | Member read. |
| `GET /api/game-state/players-detailed-lobby/{gameId}` | No body → lobby IDs/nicknames | Member read. |
| `GET /api/game-state/players-detailed/{gameId}` | No body → player ID/nickname/position/money/properties list | Member read. |
| `GET /api/game-state/players/{gameId}` | No body → player-ID set | Member read. |
| `GET /api/game-state/{gameId}/players` | No body → player-ID set | Member compatibility read. |
| `GET /api/game-state/in-game/{playerId}` | No body → boolean | Same authenticated player only. |

Visibility values are the server-supported public/private representation. Game
creation establishes version `0`; later accepted transitions increment once.

### Turn commands

All routes require the authenticated member to match `{playerId}`, be the active
player, be in the accepted lifecycle/phase, and provide command headers.

| Method and path | Request / result |
| --- | --- |
| `POST /api/turn/{gameId}/{playerId}/throw` | Server generates one authoritative pair and resolves movement/square effects. A genuine roll returns `die1`, `die2`, `total`, compatibility alias `dice=total`, position, Start flag, square result, version, replay status, and nullable `card`. Each die is 1–6, `total` is 2–12, and `total=die1+die2`. When a jailed player's command only creates the payment/skip offer, no entropy is consumed, `dice` is `0`, and the nullable pair fields are omitted. When a card is drawn, `card` contains the MariaDB `cardId`, `title`, thematic `text`, effect (`money` or `transport`), and authoritative signed amount/destination. |
| `POST /api/turn/{gameId}/{playerId}/action` | Body includes `gameId`, `playerId`, legacy `squareType`, and `yes`. Path/body IDs must agree; the server-owned typed pending option—not `squareType`—authorizes the choice. |
| `POST /api/turn/{gameId}/{playerId}/pass` | No body → action/rotation result with version/replay; declines the current permitted typed option. |

Example genuine-roll fields:

```json
{
  "dice": 7,
  "die1": 3,
  "die2": 4,
  "total": 7,
  "newPosition": 10,
  "passedGo": false,
  "squareType": 8,
  "data": -1,
  "stateVersion": 12,
  "replayed": false,
  "card": null
}
```

`dice` is a temporary response-compatibility alias and is not calculated
independently. An equivalent retry reads the serialized result from the existing
`game:{gameId}:commands` replay record, returns the original pair exactly, and
does not consume entropy or publish another event.

### Statistics

| Method and path | Access / result |
| --- | --- |
| `GET /api/statistics/user/{playerId}` | Authenticated; statistics for the selected player. |
| `GET /api/statistics/leaderboard` | Authenticated; cached leaderboard projection. |

### Development API documentation

When OpenAPI is enabled, `/v3/api-docs/**`, `/swagger-ui/**`, and
`/swagger-ui.html` are anonymous documentation resources. The `prod` profile
disables both API docs and Swagger UI by default; these routes are not game or
administrative APIs.

## Snapshot and realtime relationship

The game snapshot contains `gameId`, `stateVersion`, lifecycle status, active
player, nullable `turnDeadlineEpochMs`, winner, nullable `finalResult`,
visibility/invite metadata, typed optional action, and bounded players
(`playerId`, nickname, position, money, properties, jail/bankrupt/AFK fields).
`finalResult` is `null` before completion. An ended snapshot exposes the stored
winner ID and ordered standings shaped as
`{playerId,nickname,cash,propertyValue,totalValue,rank,winner}`. `cash` is the
terminal Redis balance, `propertyValue` is the sum of canonical MariaDB
`square.price` purchase values for the player's terminal owned-property IDs,
and `totalValue = cash + propertyValue`; all are unformatted integers.
Standings sort by total value descending. Equal totals share competition rank
(`1,1,3`) and retain turn order only as a stable, non-competitive display tie
break. The `winner` flag and `winnerPlayerId` preserve the existing winner rule:
highest total value, then cash, then earlier turn order.

Completion values are calculated once from the terminal transition input and
the one-read canonical board projection, then frozen in the existing
`game:{gameId}.terminalResult` field by the same Redis CAS that writes ended
status, winner, and the next `stateVersion`. The member-only snapshot read adds
nicknames and exposes that frozen result; it never accepts result values from a
client. Terminal JSON written before this additive format is recalculated on
the server during its short retention window. The deadline is a server-generated
absolute epoch-millisecond value read from `game:{gameId}` in the same stable
state read as the snapshot version. It is `null` when no authoritative deadline
exists, including lobby, retained terminal, and compatibility-missing state.
The browser may present this value but never declares or submits a timeout.
Internal replay/finalization identity is excluded. STOMP notifications are
ephemeral wake-up signals; clients fetch this snapshot on connect, reconnect,
newer version, gap, or ambiguity. See `../architecture/REALTIME_SYNCHRONIZATION.md`.

## Errors

The API uses `400` for invalid input, `401` for missing/expired identity, `403`
for forbidden actor/resource/role access, `404` for absent resources, `405` for
unsupported methods, and `409` for stale/version/lifecycle/phase conflicts. Some
conflicts include a bounded reason and current `stateVersion`. Unexpected errors
return a generic `500`; internal Redis, SQL, credentials, and membership details
are not exposed.

## PowerShell example

The following Windows PowerShell outline uses `curl.exe` explicitly so it does
not invoke PowerShell's historical `curl` alias. It preserves two independent
sessions. Replace IDs/versions with values returned by your own requests.

```powershell
$base = 'http://localhost:8080'
$hostId = curl.exe -sS -c host.cookies -H 'Content-Type: application/json' `
  --data-raw '{"nickname":"HostExample"}' "$base/api/player-state/create"
curl.exe -sS -b host.cookies "$base/api/session/me"
# Before game creation this returns 204; after create/start it returns 200 with
# the authoritative resume route data. No CSRF header is required for this GET.
curl.exe -i -b host.cookies "$base/api/session/current-game"
$hostCsrf = (curl.exe -sS -b host.cookies -c host.cookies `
  "$base/api/session/csrf" | ConvertFrom-Json).token

$createId = [guid]::NewGuid().ToString()
$game = curl.exe -sS -b host.cookies -H "X-XSRF-TOKEN: $hostCsrf" `
  -H "X-Sindopoly-Command-Id: $createId" `
  -H 'X-Sindopoly-Expected-Version: -1' -H 'Content-Type: application/json' `
  --data-raw "{`"ownerId`":$hostId,`"visibility`":`"public`"}" `
  "$base/api/game-state/create" | ConvertFrom-Json
$gameId = $game.gameId
$version = $game.stateVersion
curl.exe -i -b host.cookies "$base/api/session/current-game"

$guestId = curl.exe -sS -c guest.cookies -H 'Content-Type: application/json' `
  --data-raw '{"nickname":"GuestExample"}' "$base/api/player-state/create"
$guestCsrf = (curl.exe -sS -b guest.cookies -c guest.cookies `
  "$base/api/session/csrf" | ConvertFrom-Json).token
$joinId = [guid]::NewGuid().ToString()
$joined = curl.exe -sS -b guest.cookies -H "X-XSRF-TOKEN: $guestCsrf" `
  -H "X-Sindopoly-Command-Id: $joinId" `
  -H "X-Sindopoly-Expected-Version: $version" -X POST `
  "$base/api/game-state/add/$gameId/$guestId" | ConvertFrom-Json
$version = $joined.stateVersion

$startId = [guid]::NewGuid().ToString()
$started = curl.exe -sS -b host.cookies -H "X-XSRF-TOKEN: $hostCsrf" `
  -H "X-Sindopoly-Command-Id: $startId" `
  -H "X-Sindopoly-Expected-Version: $version" -X POST `
  "$base/api/game-state/$gameId/start?playerId=$hostId" | ConvertFrom-Json
$version = $started.stateVersion
curl.exe -sS -b host.cookies "$base/api/game-state/$gameId/snapshot"

$rollId = [guid]::NewGuid().ToString()
$roll = curl.exe -sS -b host.cookies -H "X-XSRF-TOKEN: $hostCsrf" `
  -H "X-Sindopoly-Command-Id: $rollId" `
  -H "X-Sindopoly-Expected-Version: $version" -X POST `
  "$base/api/turn/$gameId/$hostId/throw" | ConvertFrom-Json
$version = $roll.stateVersion

# If the snapshot exposes an optional action, either resolve it...
$actionId = [guid]::NewGuid().ToString()
$actionBody = @{gameId=[int]$gameId; playerId=[int]$hostId; squareType=0; yes=$true} | ConvertTo-Json -Compress
curl.exe -sS -b host.cookies -H "X-XSRF-TOKEN: $hostCsrf" `
  -H "X-Sindopoly-Command-Id: $actionId" `
  -H "X-Sindopoly-Expected-Version: $version" -H 'Content-Type: application/json' `
  --data-raw $actionBody "$base/api/turn/$gameId/$hostId/action"

# ...or decline it with a distinct command ID at the same current version.
$passId = [guid]::NewGuid().ToString()
curl.exe -sS -b host.cookies -H "X-XSRF-TOKEN: $hostCsrf" `
  -H "X-Sindopoly-Command-Id: $passId" `
  -H "X-Sindopoly-Expected-Version: $version" -X POST `
  "$base/api/turn/$gameId/$hostId/pass"

$leaveId = [guid]::NewGuid().ToString()
curl.exe -sS -b guest.cookies -H "X-XSRF-TOKEN: $guestCsrf" `
  -H "X-Sindopoly-Command-Id: $leaveId" `
  -H "X-Sindopoly-Expected-Version: CURRENT_VERSION" -X POST `
  "$base/api/game-state/$gameId/remove-player?playerId=$guestId"
curl.exe -sS -b guest.cookies -H "X-XSRF-TOKEN: $guestCsrf" -X POST `
  "$base/api/session/logout"
```

Action and pass are alternatives, not sequential commands against one version.
The legacy `squareType` is shown only because the DTO still requires it; the
server-owned pending option determines authority. In Postman, retain each
session cookie, call `/api/session/csrf`, set `X-XSRF-TOKEN`, and generate one
UUID plus the last server-returned version per new mutation. A stale `409` means
recover the snapshot. Retrying uncertain identical intent uses the same command
ID; changing intent with that ID is rejected.
