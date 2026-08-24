# Redis schema current

Serializer: `RedisConfig` sets `StringRedisSerializer` for keys, values, hash keys, and hash values.

REVAMP-018 update: normal game commands now write through the centralized Lua
compare-and-commit store described in
`docs/architecture/AUTHORITATIVE_GAME_TRANSITIONS.md`. The game hash adds
`stateVersion`; the new `game:{gameId}:commands` HASH stores
bounded JSON replay records. Missing versions on pre-existing games read as
logical zero. Game/membership/player/deck changes and the replay marker commit
atomically on the current single Redis deployment. The detailed entries below
retain pre-revamp audit provenance where explicitly labeled as risks.

## Keys

### `game:{gameId}`

- Type: HASH.
- Example: `game:1`.
- Created by: `GameStateService#createGame`.
- Updated by: `GameStateService#startGame`, `setGameField`, `updateGameFields`, `endGame`; `TurnService` via `GameStateService`.
- Read by: controllers, `TurnService`, `GameLoopScheduler`, frontend through REST.
- Deleted by: `GameStateService#deleteGame`, `deleteGameAndPlayers`.
- TTL: 24h at lobby creation; 30s after `endGame`; startGame leaves earlier TTL in place.
- Fields observed: `status`, `creationTime`, `visibility`, `inviteCode`, `playerTurn`, `timer`, `startTime`, `maxTime`, `maxMoney`, `winner`, `lastDice`, `optionalAction`, `optionalDeadline`.
- Purpose: authoritative active game metadata.
- Risks: no atomic transitions; no owner field despite owner being inferred from game ID; optional action has two incompatible formats in code (JSON DTO and colon-delimited string).

Implemented field: `stateVersion` is a base-10 integer. Normal migrated commands
are atomic; owner inference, numeric turn ordering, and legacy optional-action
helpers remain compatibility/refactor concerns.

### `game:{gameId}:players`

- Type: SET.
- Example: `game:1:players`.
- Created by: `GameStateService#createGame`.
- Updated by: `addPlayerToGame`, `addPlayerToGameWithInviteCode`, `removePlayerFromGame`.
- Read by: lobby/game details, turn rotation, end conditions, ownership scanning.
- Deleted by: `deleteGame`, `deleteGameAndPlayers`.
- TTL: 24h at lobby creation; 30s after `endGame`.
- Purpose: active game membership.
- Risks: Redis Set order is undefined, but turn rotation sorts IDs and comments mention join order.

### `player:{playerId}`

- Type: HASH.
- Example: `player:1`.
- Created by: `PlayerStateService#initializePlayer` at game start.
- Updated by: `PlayerStateService#savePlayerState`, `grantMoney`, `payToExitJail`; `TurnService`; `SquareActionService`.
- Read by: game details, turn flow, end conditions, winner calculation.
- Deleted by: `PlayerStateService#deletePlayer`, `deleteGameAndPlayers`; expired after game end.
- TTL: 2h at initialization; 30s after `endGame`.
- Fields observed: `position`, `money`, `jail`, `jailTime`, `bankrupt`, `properties`, `afk`.
- Purpose: authoritative active player state.
- Risks: arbitrary client write endpoint can overwrite fields; no version; no per-game namespace, so one player in multiple games would collide if membership checks fail.

### `game:{gameId}:deck`

- Type: LIST.
- Example: `game:1:deck`.
- Created by: `CardService#initialiseDeck`.
- Updated/read by: `CardService#drawCard`.
- TTL: none set directly.
- Stored value: card IDs as strings.
- Purpose: per-game shuffled card deck.
- Risks: not deleted explicitly unless covered by `deleteGameAndPlayers`? Current deletion deletes only game hash, players set, and player hashes. Deck key can remain.

The migrated roll path consumes and replaces this list within the same Lua
commit as player/game state and aligns its TTL with the game. Its current
exhaust-and-reshuffle behavior is intentionally preserved for REVAMP-019.

### `game:{gameId}:commands`

- Type: HASH; field is normalized UUID, value is JSON fingerprint/version/result.
- Created/updated by: `RedisGameTransitionStore` Lua compare-and-commit.
- TTL: 24h from game creation without join/start/replay/no-op refresh; a new
  commands key for a legacy game inherits the game's remaining TTL; retained as a 30-second
  tombstone when owner leave deletes lobby state.
- Bound: at most 4096 accepted command IDs. No entry is evicted; a new ID fails
  closed with `COMMAND_CAPACITY` when full, preserving replay/collision evidence
  for the key's lifetime. Capacity checking is O(1) `HLEN`.
- Purpose: exact semantic-result replay and command-ID collision detection.
- Value JSON fields: `fingerprint`, `stateVersion`, `result`.

### `stats:leaderboard`

- Type: STRING.
- Created/updated by: `StatsService#refreshLeaderboard`.
- Read by: `StatsService#getLeaderboard`.
- TTL: none.
- Stored value: JSON list of `LeaderboardEntryDto`.
- Purpose: cache of top stats.
- Risks: no TTL; stale until scheduled refresh or cache parse failure.

### `dice:entropy`

- Type: LIST.
- Created/updated by: `DiceEntropyRefillJob#refill` via `RandomOrgGenerator#pushBatch`.
- Read by: `RandomOrgGenerator#nextDie`.
- TTL: none.
- Purpose: optional random.org dice entropy pool.
- Risks: external blocking `.block()` call in scheduled job; no failure handling around HTTP retrieve; only active if `dice.source=randomorg`.

### `invite:{code}`

- Type: intended/unknown.
- Evidence: `GameStateService#generateInviteCode` checks `redisTemplate.hasKey(INVITE_PREFIX + code)`.
- Status: UNVERIFIED.
- Reason: no code writes `invite:{code}`; invite code is stored as a field on `game:{gameId}`.
- Risk: uniqueness check does not actually check existing game invite fields.

## Pub/Sub

No Redis Pub/Sub publisher/subscriber was found. Event publication currently uses Spring's in-memory WebSocket broker directly through `SimpMessagingTemplate`.

Status: confirmed by search for `RedisMessageListenerContainer`, `PatternTopic`, and `convertAndSend`.
