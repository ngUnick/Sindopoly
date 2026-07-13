# REST API inventory

Authentication requirement for every endpoint: none enforced server-side. Evidence: `WebSecurityConfig` uses `authorizeHttpRequests(auth -> auth.anyRequest().permitAll())`.

Error handling: `GlobalExceptionHandler` returns 400 for `IllegalArgumentException`/`IllegalStateException` with the exception message, and 500 with generic `"Internal server error"` for other exceptions.

## Game state API: `/api/game-state`

| Method | Path | Controller method | Request | Response | Service(s) | State/effects | Main concerns |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/players-detailed-lobby/{gameId}` | `getPlayerDetailsInGame` | path `gameId` | list of maps `{id,nickname}` | `GameStateService`, `PlayerRepository` | Redis set read; MariaDB lookup per player | N+1 DB lookups; no membership auth. |
| GET | `/players-detailed/{gameId}` | `getPlayersDetailed` | path `gameId` | `List<PlayerDetailedDto>` | `GameStateService`, `PlayerStateService`, `PlayerRepository` | Redis set/player hash reads; MariaDB lookup per player | Controller mixes shaping, Redis, DB. |
| POST | `/create` | `createGame` | `GameCreationRequest` | map with game fields and `gameId` | `GameStateService` | Creates Redis game hash/set | No auth; owner ID trusted from body. |
| GET | `/in-game/{playerId}` | `isPlayerInGame` | path `playerId` | boolean | `GameStateService` | Redis `KEYS game:*:players` scan | Potentially expensive; no auth. |
| POST | `/{gameId}/start?playerId=` | `startGame` | path+query | `{status,gameId}` or error | `GameStateService` | Initializes game/player Redis hashes | Host check is `gameId == actorId`; no auth. |
| GET | `/public-lobby` | `getAllPublicLobbyGames` | none | list of maps | `GameStateService` | Redis `KEYS game:*`, MariaDB owner lookup | KEYS scan; hard-coded owner inference. |
| POST | `/add/{gameId}/{playerId}` | `addPlayer` | path | text | `GameStateService` | Adds Redis set member | Duplicate max-player checks split controller/service. |
| GET | `/players/{gameId}` | `getPlayersInGame` | path | set of IDs | `GameStateService` | Redis set read | Duplicates `/{gameId}/players`. |
| POST | `/join-with-invite?inviteCode=&playerId=` | `joinWithInvite` | query | `{gameId}` or `{error}` | `GameStateService` | Adds Redis set member | Errors returned as HTTP 200 maps in some cases. |
| POST | `/{gameId}/remove-player?playerId=` | `removePlayer` | path+query | text | `GameStateService` | Removes Redis member; maybe stats finalization/delete | Anyone can request removal of any player. |
| GET | `/{gameId}` | `getGameState` | path | Redis hash map | `GameStateService` | Redis hash read | Exposes raw internal game fields. |
| GET | `/{gameId}/players` | `getPlayers` | path | set of IDs | `GameStateService` | Redis set read | Duplicate of `/players/{gameId}`. |
| DELETE | `/{gameId}` | `deleteGame` | path | text | `GameStateService` | Deletes Redis game hash/set | No auth/owner check. |
| POST | `/{gameId}/check-end` | `checkGameEnd` | path | text | `GameStateService` | May end game/finalize stats | Publicly triggerable state transition. |

## Player state API: `/api/player-state`

| Method | Path | Controller method | Request | Response | State/effects | Main concerns |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/create` | `createPlayer` | map with `nickname` | player ID | Creates MariaDB player | No auth; nickname regex only A-Z/a-z/0-9/_ 2-15. |
| POST | `/{playerId}` | `savePlayer` | arbitrary map | text | Writes arbitrary fields to `player:{playerId}` | Confirmed security/data integrity vulnerability if exposed. |
| GET | `/{playerId}` | `getPlayer` | path | Redis hash map | Reads active player state | No auth; IDOR. |
| DELETE | `/{playerId}` | `deletePlayer` | path | text | Deletes Redis player hash | No auth; can disrupt games. |
| POST | `/grant-money/{playerId}/{amount}` | `grantPlayerMoney` | path | player ID | Adds money in Redis | No auth; direct cheating endpoint. |

Frontend references but backend does not expose:

- `POST /api/player-state/{gameId}/{playerId}/buy?propertyId=...`
- `POST /api/player-state/{gameId}/{playerId}/pay-jail`

Evidence: `sindopoly-front/src/apis/GamePlayAPI.jsx`; no matching mappings found in `PlayerStateController`.

## Turn API: `/api/turn`

| Method | Path | Controller method | Request | Response | State/effects | Main concerns |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/{gameId}/{playerId}/throw` | `throwDice` | path | `ThrowResultDto` | Validates active turn; rolls; mutates Redis player/game | No idempotency/lock; no WebSocket event on throw. |
| POST | `/{gameId}/{playerId}/action` | `doAction` | path + `ActionRequestDto` | `ActionResultDto` | Applies optional; rotates turn; broadcasts `actionCompleted` | Path/body IDs not compared; no auth. |
| POST | `/{gameId}/{playerId}/pass` | `passOptional` | path | `{status:"passed"}` | Clears optional; rotates; broadcasts `turnFinished` | Only validates optional belongs to player, not authenticated caller. |

Commented obsolete endpoints remain in `TurnController`.

## Statistics API: `/api/statistics`

| Method | Path | Controller method | Response | State/effects | Main concerns |
| --- | --- | --- | --- | --- | --- |
| GET | `/user/{playerId}` | `getUserStats` | `PlayerStatsDto` | MariaDB read | No auth/IDOR. |
| GET | `/leaderboard` | `getLeaderboard` | `List<LeaderboardEntryDto>` | Redis cache read or MariaDB read/cache write | No paging; cache has no TTL. |

