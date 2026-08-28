# Direct mutation containment

## Scope and decision

REVAMP-017 removes browser-callable primitives that accepted authoritative
state or exposed lifecycle internals. Authentication alone did not make those
operations safe: a valid player could still choose money, position, ownership,
or destructive lifecycle effects. Supported clients submit intent through the
authenticated game commands documented in `GAME_COMMAND_AUTHORIZATION.md`.

The trusted actor remains the Spring Security session `PlayerPrincipal`,
resolved by `AuthenticatedPlayerResolver`. Path, query, and body player IDs are
selectors or consistency checks and never grant authority.

## Pre-change threat inventory and disposition

| Route before REVAMP-017 | Controller to service | Actor/selectors | State and durable effects | Finding | Disposition |
| --- | --- | --- | --- | --- | --- |
| `POST /api/player-state/{playerId}` | `PlayerStateController#savePlayer` to `PlayerStateService#savePlayerState` | Session actor had to equal path player; arbitrary body map | Arbitrary fields in `player:{playerId}`; MariaDB player-existence read | Allowed a player to choose money, position, properties, jail, AFK, or any Redis field; no frontend caller | **REMOVE** |
| `DELETE /api/player-state/{playerId}` | `PlayerStateController#deletePlayer` to `PlayerStateService#deletePlayer` | Session actor had to equal path player | Immediate deletion of `player:{playerId}`; no MariaDB mutation | Destroyed active state outside leave, completion, and cleanup policy; no frontend caller | **REMOVE** |
| `POST /api/player-state/grant-money/{playerId}/{amount}` | `PlayerStateController#grantPlayerMoney` to `PlayerStateService#grantMoney` | Session actor had to equal path player; amount was client-controlled | Direct `money` update in `player:{playerId}`; MariaDB player-existence read | General-purpose self-cheating balance command; no frontend caller | **REMOVE** |
| `DELETE /api/game-state/{gameId}` | `GameStateController#deleteGame` to `GameStateService#deleteGame` | Session actor plus host/member/lobby policy from REVAMP-016 | Immediate deletion of `game:{gameId}` and `game:{gameId}:players`; no finalization | Bypassed canonical abandonment, completion, finalization, player-state cleanup, and recovery; frontend wrapper existed but had no caller | **REMOVE** |
| `POST /api/game-state/{gameId}/check-end` | `GameStateController#checkGameEnd` to `GameStateService#checkEndCondition` | Session actor plus host/member/in-progress policy from REVAMP-016 | Could write terminal fields/TTLs in game and player hashes and finalize MariaDB stats | Exposed server-owned completion evaluation as a client mutation; no frontend caller | **REMOVE** |
| `POST /api/turn/{gameId}/{playerId}/action` | `TurnController#doAction` to `TurnCommandService#resolveOptionalAction` | Session actor must equal path player; body game/player IDs must equal path; body identity does not enter authoritative calculation | Versioned authorized optional-action transition | Compatibility body fields remain non-authoritative; legitimate frontend caller | **RESTRICT/RETAIN** |

Removed routes are not compatibility no-ops. Depending on whether the path
still has another HTTP method, Spring returns `404 Resource not found` or
`405 Method not allowed`. Both are mapped deliberately rather than becoming a
generic `500`.

## Reviewed supported mutation surface

| Command route | Authority and disposition |
| --- | --- |
| `POST /api/player-state/create` | Anonymous identity-establishment command; creates one MariaDB Player and server session. Retained. |
| `POST /api/game-state/create` | Session actor must match legacy owner selector. Retained. |
| public and invite join routes | Session actor must match player selector; lobby, visibility/invite, capacity, duplicate, and cross-game rules remain enforced. Retained. |
| `POST /api/game-state/{gameId}/remove-player` | Authenticated member may leave only as self. For the current lobby host policy this is also the supported abandonment path. Retained pending REVAMP-018 atomicity. |
| `POST /api/game-state/{gameId}/players/{target}/kick` | Authenticated lobby host is actor; target is another current member. Retained. |
| start, roll, action, and pass routes | REVAMP-016 membership/host/active-player/lifecycle/phase policy remains authoritative. Retained. |
| session logout | Invalidates only the server session; it does not write active game state. Retained. |

No REST controller constructs Redis keys, receives arbitrary Redis fields, or
calls raw `RedisTemplate` mutation. REVAMP-025 removed the unused raw mutation
and legacy orchestration methods from `GameStateService`; it now provides only
the discovery and authorization reads consumed by live callers.
`PlayerStateService` likewise exposes only its live read projection. Active
game and player writes are owned by the authoritative transition store.

## Replacement and lifecycle policy

- A player leaves through
  `POST /api/game-state/{gameId}/remove-player?playerId={actorId}`.
- A lobby host removes another member through
  `POST /api/game-state/{gameId}/players/{targetPlayerId}/kick`.
- There is no client replacement for arbitrary state writes, balance grants,
  active-state deletion, or manual completion evaluation.
- Completion evaluation and cleanup are owned by the transition-safe
  lifecycle/scheduler path established in REVAMP-020.
- Canonical cleanup remains a system responsibility after terminal
  finalization/recovery through the common transition path.

## Redis and MariaDB contracts

| Key | Type and serialization | Affected fields/operation | Owner | TTL/lifecycle |
| --- | --- | --- | --- | --- |
| `player:{playerId}` | HASH; string keys/fields/values through `StringRedisSerializer` | Removed routes formerly overwrote arbitrary fields, changed `money`, or deleted the hash | `RedisGameTransitionStore` | Initialized for approximately two hours; completion/abandonment does not shorten this shared key |
| `game:{gameId}` | HASH; string fields/values | Removed delete route deleted the hash; removed check-end could set `status=ended`, `winner`, and terminal TTL | `RedisGameTransitionStore` | Approximately 24 hours at lobby creation; configurable 300-second default after completion |
| `game:{gameId}:players` | SET of decimal player-ID strings | Removed delete route deleted membership; check-end read membership and shortened TTL on completion | `RedisGameTransitionStore` | Same lobby/terminal lifecycle as the game hash |

The removed check-end flow also read player `money`/`properties`, queried
MariaDB `Square` metadata to value assets, and could update MariaDB `Stats` rows
during finalization. Those effects remain available only to server-owned
completion paths.

Redis schema/key changes: **NONE**. No key, field, serializer, TTL, namespace,
session store, Pub/Sub channel, or Stream was added or migrated.

MariaDB schema/entity changes: **NONE**. No admin, authorization, audit, game,
or active-state table was introduced.

## Error, security, concurrency, and performance behavior

- `401`, `403`, `404`, and `409` semantics from REVAMP-015/016 remain.
- Unknown removed routes return `404`; unsupported methods on retained resource
  paths return `405`.
- Action path/body disagreement remains `403`, and only the session actor plus
  boolean choice reaches the application service.
- Removing transport entry points eliminates their replay and race surface.
  Retained commands still have authorize-then-mutate races; REVAMP-018 owns
  `stateVersion`, command IDs, idempotency, and atomic compare-and-commit.
- No authorization cache, global/JVM lock, new Redis round trip, new MariaDB
  query, or N+1 path was added. Removing endpoints reduces reachable work.
- STOMP CONNECT/subscription/origin authorization and snapshot recovery are
  implemented and documented in `../architecture/REALTIME_SYNCHRONIZATION.md`.
  Current realtime delivery is Spring's in-memory simple broker, not Redis
  Pub/Sub.

## Client migration examples

After establishing a session and obtaining the CSRF header/token as documented
in `AUTHENTICATED_PLAYER_SESSION.md`, a supported self-leave is:

```bash
curl -i -b player.cookies -H "$HEADER: $TOKEN" -X POST \
  "http://localhost:8080/api/game-state/GAME_ID/remove-player?playerId=PLAYER_ID"
```

The removed direct mutations are rejected and have no replacement:

```bash
curl -i -b player.cookies -H "$HEADER: $TOKEN" \
  -H 'Content-Type: application/json' -X POST \
  -d '{"money":999999,"position":39,"properties":"[1,2]"}' \
  http://localhost:8080/api/player-state/PLAYER_ID

curl -i -b player.cookies -H "$HEADER: $TOKEN" -X POST \
  http://localhost:8080/api/player-state/grant-money/PLAYER_ID/999999

curl -i -b host.cookies -H "$HEADER: $TOKEN" -X POST \
  http://localhost:8080/api/game-state/GAME_ID/check-end
```

In Postman, retain the `JSESSIONID` cookie, obtain the CSRF token from
`GET /api/session/csrf`, and send it under the returned header name. Do not use
removed routes in new collections and never store real cookies or CSRF values
in examples.
