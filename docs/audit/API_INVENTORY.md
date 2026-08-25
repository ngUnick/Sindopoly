# REST API inventory

Authentication baseline: `POST /api/player-state/create`, public-lobby discovery,
and API documentation are anonymous. Other `/api/**` routes require the opaque
server-managed player session established during player creation. Legacy actor
IDs are consistency checks at the migrated boundaries described in
`docs/security/AUTHENTICATED_PLAYER_SESSION.md`. Private game reads and game
commands use the membership/host/active-player/phase matrix in
`docs/security/GAME_COMMAND_AUTHORIZATION.md`.

Realtime synchronization is defined in
`docs/architecture/REALTIME_SYNCHRONIZATION.md`: authenticated members subscribe
to `/topic/game/{gameId}`, while `GET /api/game-state/{gameId}/snapshot` is the
authoritative reconnect and version-gap recovery contract.

Error handling: authentication is `401`; authorization is generic `403`;
missing active games are `404`; lifecycle/turn-phase conflicts are `409`;
unsupported methods are `405`; malformed and legacy adapter validation failures remain `400`; unhandled
failures return `500` with generic `"Internal server error"`.

REVAMP-018 command update: every game-state or turn `POST` listed below now
requires `X-Sindopoly-Command-Id` (canonical UUID) and
`X-Sindopoly-Expected-Version` (non-negative, except create uses `-1`). These
commands delegate to the authoritative compare-and-commit services documented
in `docs/architecture/AUTHORITATIVE_GAME_TRANSITIONS.md`; older service/effect
wording below remains audit provenance rather than the current write boundary.
Successful JSON command results expose `stateVersion` and `replayed`; stale or
command-ID-reuse conflicts are `409`.

## Player session API: `/api/session`

| Method | Path | Response | State/effects | Main concerns |
| --- | --- | --- | --- | --- |
| GET | `/me` | `{id,nickname}` | Resolves the server-owned session actor and durable Player | `401` for missing/expired/stale sessions; exposes no session internals. |
| GET | `/csrf` | CSRF header/parameter/token names and token | Materializes the session CSRF token for the browser client | Token is kept in browser memory and sent only as the CSRF header. |
| POST | `/logout` | `204` | Invalidates the HTTP session and expires session/CSRF cookies | Does not delete Player or active game state. |

## Game state API: `/api/game-state`

`GET /invite-metadata?inviteCode=...` is the authenticated bounded preflight for
a private join and returns only `{gameId,stateVersion}` for a matching lobby.
Public-lobby entries include `stateVersion`.

| Method | Path | Controller method | Request | Response | Service(s) | State/effects | Main concerns |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/players-detailed-lobby/{gameId}` | `getPlayerDetailsInGame` | path `gameId` | list of maps `{id,nickname}` | authorization policy, `PlayerRepository` | Authorized Redis membership read; MariaDB lookup per player | Private member read; N+1 DB lookups remain. |
| GET | `/players-detailed/{gameId}` | `getPlayersDetailed` | path `gameId` | `List<PlayerDetailedDto>` | authorization policy, `PlayerStateService`, `PlayerRepository` | Authorized Redis game/membership/player reads; MariaDB lookup per player | Private member read; controller shaping remains. |
| POST | `/create` | `createGame` | `GameCreationRequest` + command headers | map with game fields, `gameId`, version/replay metadata | `GameCommandService` | Atomically bootstraps Redis game/membership/version/replay state | Session actor must match legacy owner ID; expected `-1` proves absence. |
| GET | `/in-game/{playerId}` | `isPlayerInGame` | path `playerId` | boolean | `GameStateService` | Redis `KEYS game:*:players` scan | Session actor must match selector; scan remains potentially expensive. |
| POST | `/{gameId}/start?playerId=` | `startGame` | path+query + command headers | versioned JSON result | `GameCommandService` | Atomically initializes game/player Redis hashes | Host member only, lobby only, minimum two members; current host convention remains `gameId == actorId`. |
| GET | `/public-lobby` | `getAllPublicLobbyGames` | none | list of maps | `GameStateService` | Redis `KEYS game:*`, MariaDB owner lookup | KEYS scan; hard-coded owner inference. |
| POST | `/add/{gameId}/{playerId}` | `addPlayer` | path + command headers | versioned JSON result | `GameCommandService` | Atomically adds Redis membership and replay record | Session actor must match player ID; visibility/capacity checks precede versioned commit. |
| GET | `/players/{gameId}` | `getPlayersInGame` | path | set of IDs | authorization policy | Authorized Redis set read | Private member read; duplicates `/{gameId}/players`. |
| POST | `/join-with-invite?inviteCode=&playerId=` | `joinWithInvite` | query + command headers | versioned JSON result | `GameCommandService` | Atomically adds Redis membership and replay record | Session actor must match player ID; invite metadata supplies the version without exposing private state. |
| POST | `/{gameId}/remove-player?playerId=` | `removePlayer` | path+query + command headers | versioned JSON result | `GameCommandService` | Atomically removes the actor's membership/owned lobby state | Self-leave replay remains available after its own membership revocation. |
| POST | `/{gameId}/players/{targetPlayerId}/kick` | `kickPlayer` | path target + command headers | versioned JSON result | `GameCommandService` | Atomically removes target membership | Explicit lobby-host command; current host authorization is rechecked before replay. |
| GET | `/{gameId}` | `getGameState` | path | Redis hash map | authorization policy | Authorized Redis hash read | Private member read; raw-map shaping remains for later boundary work. |
| GET | `/{gameId}/players` | `getPlayers` | path | set of IDs | authorization policy | Authorized Redis set read | Private member read; duplicate of `/players/{gameId}`. |

## Player state API: `/api/player-state`

| Method | Path | Controller method | Request | Response | State/effects | Main concerns |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/create` | `createPlayer` | map with `nickname` | player ID | Creates MariaDB player and establishes session | Anonymous establishment endpoint; nickname regex is A-Z/a-z/0-9/_ 2-15. |
| GET | `/{playerId}` | `getPlayer` | path | Redis hash map | Reads active player state | Self-session consistency enforced; broader resource policy remains pending. |

Removed in REVAMP-017: `POST /{playerId}` arbitrary state overwrite,
`DELETE /{playerId}` direct active-state deletion, and
`POST /grant-money/{playerId}/{amount}` direct balance mutation. These routes
now resolve as `404` or `405`; server-owned game commands remain the only
supported mutation path for money, position, ownership, jail, and other active
player state.

Removed from the game-state API in REVAMP-017:

- `DELETE /api/game-state/{gameId}`; a player leaves through the authenticated
  `POST /api/game-state/{gameId}/remove-player` command, while canonical cleanup
  remains server-owned.
- `POST /api/game-state/{gameId}/check-end`; completion evaluation remains an
  internal transition/scheduler concern.

Frontend references but backend does not expose:

- `POST /api/player-state/{gameId}/{playerId}/buy?propertyId=...`
- `POST /api/player-state/{gameId}/{playerId}/pay-jail`

Evidence: `sindopoly-front/src/apis/GamePlayAPI.jsx`; no matching mappings found in `PlayerStateController`.

## Turn API: `/api/turn`

| Method | Path | Controller method | Request | Response | State/effects | Main concerns |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/{gameId}/{playerId}/throw` | `throwDice` | path + command headers | `ThrowResultDto` with authoritative square result plus version/replay metadata | One atomic roll/movement/automatic-square transition, or a typed purchase/jail-payment option | Exact retry precedes dice/card draw; stale/competing command is `409`; doubles have no special flow. |
| POST | `/{gameId}/{playerId}/action` | `doAction` | path + `ActionRequestDto` choice + command headers | `ActionResultDto` with version/replay metadata | Atomically accepts typed `PURCHASE_PROPERTY` or `PAY_JAIL_EXIT` | Session/path/body identity, active actor, option actor/version/type, current price/ownership/funds, and fingerprint are checked. |
| POST | `/{gameId}/{playerId}/pass` | `passOptional` | path + command headers | `ActionResultDto` with version/replay metadata | Declines purchase and rotates, or skips/decrements a jailed turn and rotates | Membership/active/pending phase, typed option, and expected version enforced. |

Commented obsolete endpoints remain in `TurnController`.
For bounded backward compatibility, `POST .../action` with `yes=false` enters
the same typed pass calculation and validation as `/pass`; new clients use the
explicit `/pass` endpoint. It is not a separate rule path.

Authenticated curl/Postman requests preserve the `JSESSIONID` cookie and CSRF
header described in `docs/security/GAME_COMMAND_AUTHORIZATION.md`, then add a
new UUID and the latest snapshot version for each new intent:

```bash
curl -b player.cookies -H "$CSRF_HEADER: $CSRF_TOKEN" \
  -H "X-Sindopoly-Command-Id: $COMMAND_UUID" \
  -H "X-Sindopoly-Expected-Version: $STATE_VERSION" -X POST \
  http://localhost:8080/api/turn/GAME_ID/PLAYER_ID/throw

# Use /action with JSON {"gameId":GAME_ID,"playerId":PLAYER_ID,"yes":true} to accept a typed
# purchase/jail option, or /pass with no body to decline/skip it.
```

Automatic rent, tax, Start, card, Jail/Go-To-Jail, owned-property, and
unaffordable-property outcomes are already committed by `/throw`; clients must
not call `/action` for those informational results.

## Statistics API: `/api/statistics`

| Method | Path | Controller method | Response | State/effects | Main concerns |
| --- | --- | --- | --- | --- | --- |
| GET | `/user/{playerId}` | `getUserStats` | `PlayerStatsDto` | MariaDB read | Session required; target-resource visibility policy remains pending. |
| GET | `/leaderboard` | `getLeaderboard` | `List<LeaderboardEntryDto>` | Redis cache read or MariaDB read/cache write | No paging; cache has no TTL. |
