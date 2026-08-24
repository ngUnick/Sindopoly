# REST API inventory

Authentication baseline: `POST /api/player-state/create`, public-lobby discovery,
and API documentation are anonymous. Other `/api/**` routes require the opaque
server-managed player session established during player creation. Legacy actor
IDs are consistency checks at the migrated boundaries described in
`docs/security/AUTHENTICATED_PLAYER_SESSION.md`. Private game reads and game
commands use the membership/host/active-player/phase matrix in
`docs/security/GAME_COMMAND_AUTHORIZATION.md`.

Error handling: authentication is `401`; authorization is generic `403`;
missing active games are `404`; lifecycle/turn-phase conflicts are `409`;
malformed and legacy adapter validation failures remain `400`; unhandled
failures return `500` with generic `"Internal server error"`.

## Player session API: `/api/session`

| Method | Path | Response | State/effects | Main concerns |
| --- | --- | --- | --- | --- |
| GET | `/me` | `{id,nickname}` | Resolves the server-owned session actor and durable Player | `401` for missing/expired/stale sessions; exposes no session internals. |
| GET | `/csrf` | CSRF header/parameter/token names and token | Materializes the session CSRF token for the browser client | Token is kept in browser memory and sent only as the CSRF header. |
| POST | `/logout` | `204` | Invalidates the HTTP session and expires session/CSRF cookies | Does not delete Player or active game state. |

## Game state API: `/api/game-state`

| Method | Path | Controller method | Request | Response | Service(s) | State/effects | Main concerns |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/players-detailed-lobby/{gameId}` | `getPlayerDetailsInGame` | path `gameId` | list of maps `{id,nickname}` | authorization policy, `PlayerRepository` | Authorized Redis membership read; MariaDB lookup per player | Private member read; N+1 DB lookups remain. |
| GET | `/players-detailed/{gameId}` | `getPlayersDetailed` | path `gameId` | `List<PlayerDetailedDto>` | authorization policy, `PlayerStateService`, `PlayerRepository` | Authorized Redis game/membership/player reads; MariaDB lookup per player | Private member read; controller shaping remains. |
| POST | `/create` | `createGame` | `GameCreationRequest` | map with game fields and `gameId` | `GameStateService` | Creates Redis game hash/set | Session actor must match legacy owner ID; command-level host policy remains. |
| GET | `/in-game/{playerId}` | `isPlayerInGame` | path `playerId` | boolean | `GameStateService` | Redis `KEYS game:*:players` scan | Session actor must match selector; scan remains potentially expensive. |
| POST | `/{gameId}/start?playerId=` | `startGame` | path+query | `{status,gameId}` or error | authorization policy, `GameStateService` | Initializes game/player Redis hashes | Host member only, lobby only, minimum two members; current host convention remains `gameId == actorId`. |
| GET | `/public-lobby` | `getAllPublicLobbyGames` | none | list of maps | `GameStateService` | Redis `KEYS game:*`, MariaDB owner lookup | KEYS scan; hard-coded owner inference. |
| POST | `/add/{gameId}/{playerId}` | `addPlayer` | path | text | `GameStateService` | Adds Redis set member | Session actor must match player ID; duplicate/max-player checks remain split. |
| GET | `/players/{gameId}` | `getPlayersInGame` | path | set of IDs | authorization policy | Authorized Redis set read | Private member read; duplicates `/{gameId}/players`. |
| POST | `/join-with-invite?inviteCode=&playerId=` | `joinWithInvite` | query | `{gameId}` or `{error}` | `GameStateService` | Adds Redis set member | Session actor must match player ID; some errors still use HTTP 200 maps. |
| POST | `/{gameId}/remove-player?playerId=` | `removePlayer` | path+query | text | authorization policy, `GameStateService` | Removes the actor's Redis membership; may finalize current legacy stats flow | Authenticated actor must match selector and be a member. |
| POST | `/{gameId}/players/{targetPlayerId}/kick` | `kickPlayer` | path actor-independent target | text | authorization policy, `GameStateService` | Removes a target Redis membership | Explicit lobby-host command; target must be another current member. |
| GET | `/{gameId}` | `getGameState` | path | Redis hash map | authorization policy | Authorized Redis hash read | Private member read; raw-map shaping remains for later boundary work. |
| GET | `/{gameId}/players` | `getPlayers` | path | set of IDs | authorization policy | Authorized Redis set read | Private member read; duplicate of `/players/{gameId}`. |
| DELETE | `/{gameId}` | `deleteGame` | path | text | authorization policy, `GameStateService` | Deletes Redis game hash/set | Host member and lobby lifecycle required; REVAMP-017 owns final containment decision. |
| POST | `/{gameId}/check-end` | `checkGameEnd` | path | text | authorization policy, `GameStateService` | May end game/finalize stats | Host member and in-progress lifecycle required, but external exposure remains for REVAMP-017 containment. |

## Player state API: `/api/player-state`

| Method | Path | Controller method | Request | Response | State/effects | Main concerns |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/create` | `createPlayer` | map with `nickname` | player ID | Creates MariaDB player and establishes session | Anonymous establishment endpoint; nickname regex is A-Z/a-z/0-9/_ 2-15. |
| POST | `/{playerId}` | `savePlayer` | arbitrary map | text | Writes arbitrary fields to `player:{playerId}` | Self-session only, but arbitrary authoritative-state mutation remains a confirmed vulnerability. |
| GET | `/{playerId}` | `getPlayer` | path | Redis hash map | Reads active player state | Self-session consistency enforced; broader resource policy remains pending. |
| DELETE | `/{playerId}` | `deletePlayer` | path | text | Deletes Redis player hash | Self-session only; lifecycle safety remains pending. |
| POST | `/grant-money/{playerId}/{amount}` | `grantPlayerMoney` | path | player ID | Adds money in Redis | Self-session only, but still a direct cheating endpoint pending containment. |

Frontend references but backend does not expose:

- `POST /api/player-state/{gameId}/{playerId}/buy?propertyId=...`
- `POST /api/player-state/{gameId}/{playerId}/pay-jail`

Evidence: `sindopoly-front/src/apis/GamePlayAPI.jsx`; no matching mappings found in `PlayerStateController`.

## Turn API: `/api/turn`

| Method | Path | Controller method | Request | Response | State/effects | Main concerns |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/{gameId}/{playerId}/throw` | `throwDice` | path | `ThrowResultDto` | Policy verifies membership/lifecycle/active player/phase; rolls; mutates Redis | No idempotency/atomic compare-and-commit yet; no WebSocket event on throw. |
| POST | `/{gameId}/{playerId}/action` | `doAction` | path + `ActionRequestDto` | `ActionResultDto` | Policy verifies member/active/pending phase; applies optional; rotates; broadcasts `actionCompleted` | Session/path/body identity agree; body identity does not enter the application service; version/idempotency remain. |
| POST | `/{gameId}/{playerId}/pass` | `passOptional` | path | `{status:"passed"}` | Authorized application-service pass clears optional, rotates, and broadcasts | Membership/active/pending phase enforced; version/idempotency remain. |

Commented obsolete endpoints remain in `TurnController`.

## Statistics API: `/api/statistics`

| Method | Path | Controller method | Response | State/effects | Main concerns |
| --- | --- | --- | --- | --- | --- |
| GET | `/user/{playerId}` | `getUserStats` | `PlayerStatsDto` | MariaDB read | Session required; target-resource visibility policy remains pending. |
| GET | `/leaderboard` | `getLeaderboard` | `List<LeaderboardEntryDto>` | Redis cache read or MariaDB read/cache write | No paging; cache has no TTL. |
