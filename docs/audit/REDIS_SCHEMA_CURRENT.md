# Redis schema current

Serializer: `RedisConfig` sets `StringRedisSerializer` for keys, values, hash keys, and hash values.

REVAMP-018/019 update: normal game commands now write through the centralized Lua
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
- TTL: 24h at lobby creation; configurable 300s default after authoritative completion; start leaves the earlier lobby TTL in place.
- Fields observed: `status`, `creationTime`, `visibility`, `inviteCode`, `playerTurn`, `turnOrder`, `timer`, `startTime`, `maxTime`, `maxMoney`, `winner`, `lastDice`, `optionalAction`, `optionalDeadline`, `stateVersion`, `turnDeadlineEpochMs`, `terminalResult`.
- Purpose: authoritative active game metadata.
- `optionalAction` is server-created typed JSON bound to the active player and
  committed `stateVersion`; a concurrent surviving-player membership change
  rebinds it in the same CAS while invalidating intent from the older snapshot.
- Risks: no owner field despite owner being inferred from game ID; deprecated raw helpers still contain legacy optional-action formats but are not live transport paths.

`turnDeadlineEpochMs` is the server-owned deadline for the current actionable
phase. `terminalResult` is bounded JSON containing all durable finalization
inputs. Completion removes the deadline and retains terminal state for the
terminal TTL; polling and retries do not refresh it.

`stateVersion` is a base-10 integer. `turnOrder` is a JSON array of one to four
unique positive decimal player IDs, for example `[41,7,103]`; it is created as
`[ownerId]`, appended in accepted join order, frozen at start, and filtered on
leave/kick. It must exactly match membership when an order-dependent command
runs. A missing legacy order may be initialized only for a one-member lobby
whose sole member is its host; multi-member lobbies and all in-progress games
fail closed rather than infer order from the membership SET. Completed state is
never reconstructed. The field uses the game hash's serializer and TTL, is
private authoritative state, and is removed from public-lobby projections.

### `game:{gameId}:players`

- Type: SET.
- Example: `game:1:players`.
- Created by: `GameStateService#createGame`.
- Updated by: `addPlayerToGame`, `addPlayerToGameWithInviteCode`, `removePlayerFromGame`.
- Read by: lobby/game details, membership authorization, and ownership scanning; never used as an ordering source.
- Deleted by: `deleteGame`, `deleteGameAndPlayers`.
- TTL: 24h at lobby creation; configurable 300s default after completion.
- Purpose: active game membership.
- Ordering: Redis SET iteration and numeric player IDs have no turn-order semantics; `game:{gameId}.turnOrder` is authoritative.

### `player:{playerId}`

- Type: HASH.
- Example: `player:1`.
- Created by: `PlayerStateService#initializePlayer` at game start.
- Updated by: `PlayerStateService#savePlayerState`, `grantMoney`, `payToExitJail`; `TurnService`; `SquareActionService`.
- Read by: game details, turn flow, end conditions, winner calculation.
- Deleted by: explicit player lifecycle only; game completion/abandonment does not own this shared key.
- TTL: 2h at initialization; never shortened by old-game terminal cleanup.
- Fields observed: `position`, `money`, `jail`, `jailTime`, `bankrupt`, `properties`, `afk`.
- Purpose: authoritative active player state.
- Risks: the former arbitrary client-write routes were removed by REVAMP-017,
  but deprecated internal raw helpers remain; the key is not game-namespaced, so
  one player in multiple games would still collide if cross-game membership
  exclusion races.

### `game:{gameId}:deck`

- Type: LIST.
- Example: `game:1:deck`.
- Created by: `CardService#initialiseDeck`.
- Updated/read by: the authoritative `TurnCommandService`; deprecated `CardService` remains an unwired compatibility helper.
- TTL: aligned with the game by the transition store; completion uses the configurable terminal TTL (300s default).
- Stored value: card IDs as strings.
- Purpose: isolated per-game cycling card order. A draw removes the head and appends that card to the tail in the same atomic transition as its effect.
- Static effect contract: MariaDB money-card amount is signed (positive credit,
  negative cost); transport amount is an absolute board destination. Redis
  stores only the ordered card IDs, not client-supplied effect values.
- Risks: final cleanup ownership remains REVAMP-020 scope.

The migrated roll path consumes and replaces this list within the same Lua
commit as player/game state and aligns its TTL with the game. If absent or
empty, all supported MariaDB card IDs are shuffled once to initialize it; used
cards then cycle rather than disappear.

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
- Value JSON fields for newly accepted commands: `fingerprint`, `stateVersion`,
  `resultJson`. `resultJson` holds the exact serialized semantic-result JSON so
  Lua validation does not change empty arrays into objects. Readers retain
  compatibility with legacy records that used the decoded `result` field.

Completed-game command records use the terminal TTL (300s default), preserving
completion/timeout replay evidence for the terminal window.

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
