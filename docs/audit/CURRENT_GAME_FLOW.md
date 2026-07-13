# Current game flow

See also `CURRENT_DICE_FLOW.md`, `REDIS_SCHEMA_CURRENT.md`, and `API_INVENTORY.md`.

## Lobby creation

- Entry point: `POST /api/game-state/create` -> `GameStateController#createGame`.
- Request DTO: `GameCreationRequest` with `ownerId`, `visibility`.
- Service: `GameStateService#createGame`.
- Validation: player must exist; code scans `game:*:players` to reject players already in a game.
- Redis mutations:
  - Creates hash `game:{ownerId}` with `status=lobby`, `creationTime`, `visibility`, optional `inviteCode`.
  - Adds owner to set `game:{ownerId}:players`.
  - Sets 24h TTL on both keys.
- MariaDB: validates owner via `PlayerRepository.existsById`.
- Observed issue: controller adds `gameId=ownerId` to response rather than service storing an explicit owner field.

## Lobby discovery and joining

- Public lobby: `GET /api/game-state/public-lobby` -> `GameStateService#getAllPublicLobbyGames`.
  - Uses `redisTemplate.keys("game:*")`, skips `:players`, filters hash fields `visibility=public`, `status=lobby`.
  - Looks up creator nickname in MariaDB using game ID as owner/player ID.
- Join public: `POST /api/game-state/add/{gameId}/{playerId}`.
  - Controller checks "already in any game" and max players.
  - Service validates player exists, game exists, lobby status, visibility public, max players, then adds to set.
- Join private: `POST /api/game-state/join-with-invite?inviteCode=...&playerId=...`.
  - Service scans `game:*`, matches hash field `inviteCode`, validates status and max players.

Status: confirmed from `GameStateController` and `GameStateService`.

## Leaving / kicking

- Entry point: `POST /api/game-state/{gameId}/remove-player?playerId=...`.
- Service: `GameStateService#removePlayerFromGame`.
- Redis: removes player ID from `game:{gameId}:players`.
- Lobby owner behavior: if `gameId == playerId` and status is `lobby`, deletes game and players.
- In-progress behavior: finalizes stats for the leaving player and leaves game running.
- Security: no server-side validation that the caller is the player or host. Frontend owner-only kick is UI-only (`Lobby.jsx`).

## Game start

- Entry point: `POST /api/game-state/{gameId}/start?playerId=...`.
- Controller requires at least two players.
- Service requires `gameId == actorId` as owner check.
- Redis mutations:
  - `status=inProgress`
  - `playerTurn={actorId}`
  - `timer=0`
  - `startTime`
  - `maxTime=1200`
  - `maxMoney=5000`
  - `winner=null`
  - Initializes every `player:{pid}` hash.
- Frontend: lobby polls every 1s and navigates to `/Game` when `game.status === "inProgress"`.

## Active game snapshot

- Frontend `GamePlayAPI#getBoard` performs two REST reads:
  - `GET /api/game-state/{gameId}`
  - `GET /api/game-state/players-detailed/{gameId}`
- `Board.jsx` polls every 2s via `setInterval(handleTick, 2000)`.
- WebSocket subscription code exists but is commented out.

## Turn flow

See `CURRENT_DICE_FLOW.md` for detailed state machine.

## End game and cleanup

- `GameStateService#checkEndCondition` ends a game if `timer >= 1200` or any player has `money >= 5000`.
- `GameStateService#endGame` sets `status=ended`, determines winner, finalizes stats, and sets 30s TTL on game/player keys.
- `GameLoopScheduler#pollEndConditions` scans `game:*` every 2s and broadcasts `gameEnded`.
- `GameLoopScheduler#cleanupEndedGames` scans `game:*:players` every 5s and deletes ended games.
- `TurnService#finishTurn` also checks end condition and can broadcast `gameOver`.

Risk: duplicate end-condition paths and event names (`gameEnded`, `gameOver`) are inconsistent.

## Unresolved or incomplete game rules

Status: UNVERIFIED.

- Doubles handling is not implemented in `DiceService`/`TurnService` beyond summing two dice.
- Jail logic exists, but GOJAIL/JAIL mapping is inconsistent with modal type handling.
- Disconnect/reconnect behavior is only partially represented by "already member -> Reconnected" in `GameStateService#addPlayerToGame`.
- Property ownership has no dedicated Redis owner key; ownership is inferred by scanning player property lists.
- Auction, mortgages, houses/hotels, trading, and full Monopoly rule fidelity are not visible in current code.

