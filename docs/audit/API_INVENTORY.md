# REST API inventory

Authentication baseline: `POST /api/player-state/create`, public-lobby discovery,
and API documentation are anonymous. Other `/api/**` routes require the opaque
server-managed player session established during player creation. Legacy actor
IDs are consistency checks at the migrated boundaries described in
`docs/security/AUTHENTICATED_PLAYER_SESSION.md`; full game authorization remains
pending.

Error handling: `GlobalExceptionHandler` returns 400 for `IllegalArgumentException`/`IllegalStateException` with the exception message, and 500 with generic `"Internal server error"` for other exceptions.

## Player session API: `/api/session`

| Method | Path | Response | State/effects | Main concerns |
| --- | --- | --- | --- | --- |
| GET | `/me` | `{id,nickname}` | Resolves the server-owned session actor and durable Player | `401` for missing/expired/stale sessions; exposes no session internals. |
| GET | `/csrf` | CSRF header/parameter/token names and token | Materializes the session CSRF token for the browser client | Token is kept in browser memory and sent only as the CSRF header. |
| POST | `/logout` | `204` | Invalidates the HTTP session and expires session/CSRF cookies | Does not delete Player or active game state. |

## Game state API: `/api/game-state`

| Method | Path | Controller method | Request | Response | Service(s) | State/effects | Main concerns |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/players-detailed-lobby/{gameId}` | `getPlayerDetailsInGame` | path `gameId` | list of maps `{id,nickname}` | `GameStateService`, `PlayerRepository` | Redis set read; MariaDB lookup per player | Session required; N+1 DB lookups and membership authorization remain. |
| GET | `/players-detailed/{gameId}` | `getPlayersDetailed` | path `gameId` | `List<PlayerDetailedDto>` | `GameStateService`, `PlayerStateService`, `PlayerRepository` | Redis set/player hash reads; MariaDB lookup per player | Controller mixes shaping, Redis, DB. |
| POST | `/create` | `createGame` | `GameCreationRequest` | map with game fields and `gameId` | `GameStateService` | Creates Redis game hash/set | Session actor must match legacy owner ID; command-level host policy remains. |
| GET | `/in-game/{playerId}` | `isPlayerInGame` | path `playerId` | boolean | `GameStateService` | Redis `KEYS game:*:players` scan | Session actor must match selector; scan remains potentially expensive. |
| POST | `/{gameId}/start?playerId=` | `startGame` | path+query | `{status,gameId}` or error | `GameStateService` | Initializes game/player Redis hashes | Session actor must match player ID; host check still relies on `gameId == actorId`. |
| GET | `/public-lobby` | `getAllPublicLobbyGames` | none | list of maps | `GameStateService` | Redis `KEYS game:*`, MariaDB owner lookup | KEYS scan; hard-coded owner inference. |
| POST | `/add/{gameId}/{playerId}` | `addPlayer` | path | text | `GameStateService` | Adds Redis set member | Session actor must match player ID; duplicate/max-player checks remain split. |
| GET | `/players/{gameId}` | `getPlayersInGame` | path | set of IDs | `GameStateService` | Redis set read | Duplicates `/{gameId}/players`. |
| POST | `/join-with-invite?inviteCode=&playerId=` | `joinWithInvite` | query | `{gameId}` or `{error}` | `GameStateService` | Adds Redis set member | Session actor must match player ID; some errors still use HTTP 200 maps. |
| POST | `/{gameId}/remove-player?playerId=` | `removePlayer` | path+query | text | `GameStateService` | Removes Redis member; maybe stats finalization/delete | Restricted to self-removal until explicit host-kick authorization is implemented. |
| GET | `/{gameId}` | `getGameState` | path | Redis hash map | `GameStateService` | Redis hash read | Exposes raw internal game fields. |
| GET | `/{gameId}/players` | `getPlayers` | path | set of IDs | `GameStateService` | Redis set read | Duplicate of `/players/{gameId}`. |
| DELETE | `/{gameId}` | `deleteGame` | path | text | `GameStateService` | Deletes Redis game hash/set | Session required; owner/host authorization remains missing. |
| POST | `/{gameId}/check-end` | `checkGameEnd` | path | text | `GameStateService` | May end game/finalize stats | Session required; still an externally triggerable lifecycle transition. |

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
| POST | `/{gameId}/{playerId}/throw` | `throwDice` | path | `ThrowResultDto` | Validates active turn; rolls; mutates Redis player/game | No idempotency/lock; no WebSocket event on throw. |
| POST | `/{gameId}/{playerId}/action` | `doAction` | path + `ActionRequestDto` | `ActionResultDto` | Applies optional; rotates turn; broadcasts `actionCompleted` | Session/path/body identity must agree; phase/version/idempotency work remains. |
| POST | `/{gameId}/{playerId}/pass` | `passOptional` | path | `{status:"passed"}` | Clears optional; rotates; broadcasts `turnFinished` | Session actor must match player; command-level phase/idempotency remains. |

Commented obsolete endpoints remain in `TurnController`.

## Statistics API: `/api/statistics`

| Method | Path | Controller method | Response | State/effects | Main concerns |
| --- | --- | --- | --- | --- | --- |
| GET | `/user/{playerId}` | `getUserStats` | `PlayerStatsDto` | MariaDB read | Session required; target-resource visibility policy remains pending. |
| GET | `/leaderboard` | `getLeaderboard` | `List<LeaderboardEntryDto>` | Redis cache read or MariaDB read/cache write | No paging; cache has no TTL. |
