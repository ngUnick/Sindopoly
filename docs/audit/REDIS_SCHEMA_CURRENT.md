# Redis schema current

The contextual game-event work adds no Redis key, serializer, TTL, Pub/Sub
channel, Stream, or event history. Realtime notifications remain process-local
and ephemeral; recovery reads the existing authoritative keys through a
version-bracketed snapshot. The richer STOMP payload is not persisted in Redis.
No old-to-new key or value migration is required. Exact command replay continues
to return its originally stored semantic result; therefore, for at most the
existing commands-key lifetime, a pre-deployment card-roll replay can have a
null `card` projection. It still returns the correct authoritative effect and
does not publish a duplicate transient event.

Serializer: `RedisConfig` sets `StringRedisSerializer` for keys, values, hash keys, and hash values.

REVAMP-027 changes discovery commands, not schema. `RedisGameDiscovery` uses a
cursor `SCAN` with exact canonical-key filtering for `game:*` and
`game:*:players`; `GameStateService` delegates public-lobby and cross-game
membership discovery to it. `MATCH` narrows candidates and `COUNT 128` is only
a hint; the cursor is consumed to completion. SCAN is O(N), weakly consistent,
may return empty nonterminal batches or repeated keys, and may observe
concurrent creation/expiry. Candidates are deduplicated, parsed only as exact
ASCII positive integer key forms, and then checked by authoritative reads/Lua
CAS. No key, type, value, TTL, serializer, index,
Pub/Sub channel, or Stream was added or changed. Measurement and rejected
alternatives are recorded in `docs/performance/PERFORMANCE_BASELINE.md`.

REVAMP-018/019 update: normal game commands now write through the centralized Lua
compare-and-commit store described in
`docs/architecture/AUTHORITATIVE_GAME_TRANSITIONS.md`. The game hash adds
`stateVersion`; the new `game:{gameId}:commands` HASH stores
bounded JSON replay records. Missing versions on pre-existing games read as
logical zero. Game/membership/player/deck changes and the replay marker commit
atomically on the current single Redis deployment. The detailed entries below
retain pre-revamp audit provenance where explicitly labeled as risks.

The Lua transition spans multiple game, membership, replay, deck, and player
keys without Redis Cluster hash tags. Atomicity is guaranteed for the current
single Redis deployment; Redis Cluster slot-safe operation is not supported.

## Authoritative active-game keys

### `game:{gameId}`

- Type: HASH.
- Example: `game:1`.
- Created/updated/deleted by: application command services through
  `RedisGameTransitionStore`.
- Read by: command/snapshot services and the read-only `GameStateService`
  discovery/authorization facade; frontend consumers read through REST.
- TTL: 24h at lobby creation; configurable 300s default after authoritative completion; start leaves the earlier lobby TTL in place.
- Fields observed: `status`, `creationTime`, `visibility`, `inviteCode`, `playerTurn`, `turnOrder`, `timer`, `startTime`, `maxTime`, `maxMoney`, `winner`, `lastDice`, `optionalAction`, `optionalDeadline`, `stateVersion`, `turnDeadlineEpochMs`, `terminalResult`.
- Purpose: authoritative active game metadata.
- `optionalAction` is server-created typed JSON bound to the active player and
  committed `stateVersion`; a concurrent surviving-player membership change
  rebinds it in the same CAS while invalidating intent from the older snapshot.
- Risks: no owner field despite owner being inferred from game ID; the legacy
  optional-action helper was removed by REVAMP-025.

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
- Created/updated/deleted by: application command services through
  `RedisGameTransitionStore`.
- Read by: lobby/game details, membership authorization, and ownership scanning; never used as an ordering source.
- TTL: 24h at lobby creation; configurable 300s default after completion.
- Purpose: active game membership.
- Ordering: Redis SET iteration and numeric player IDs have no turn-order semantics; `game:{gameId}.turnOrder` is authoritative.

### `player:{playerId}`

- Type: HASH.
- Example: `player:1`.
- Created/updated by: authoritative application transitions through
  `RedisGameTransitionStore`.
- Read by: command/snapshot services and the read-only `PlayerStateService`
  projection facade.
- Deleted by: explicit player lifecycle only; game completion/abandonment does not own this shared key.
- TTL: 2h at initialization; never shortened by old-game terminal cleanup.
- Fields observed: `position`, `money`, `jail`, `jailTime`, `bankrupt`, `properties`, `afk`.
- Purpose: authoritative active player state.
- Risks: the former arbitrary client-write routes were removed by REVAMP-017
  and unused raw projection-service mutators by REVAMP-025; the key is not game-namespaced, so
  one player in multiple games would still collide if cross-game membership
  exclusion races.

### `game:{gameId}:deck`

- Type: LIST.
- Example: `game:1:deck`.
- Created/updated by: authoritative card transitions through
  `RedisGameTransitionStore`; `TurnCommandService` selects the deterministic
  cycling order. `CardService` remains an unwired test-oriented helper.
- TTL: aligned with the game by the transition store; completion uses the configurable terminal TTL (300s default).
- Stored value: card IDs as strings.
- Purpose: isolated per-game cycling card order. A draw removes the head and appends that card to the tail in the same atomic transition as its effect.
- Static effect contract: MariaDB money-card amount is signed (positive credit,
  negative cost); transport amount is an absolute board destination. Redis
  stores only the ordered card IDs, not client-supplied effect values.
- Cleanup: authoritative completion aligns the deck TTL with the configured
  terminal retention window; later expiry removes it with the game-owned state.

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

## Auxiliary Redis keys

These keys are not authoritative active-game state and are not part of the
per-game Lua CAS.

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

Invite codes are fields of `game:{gameId}` and are discovered through the
central cursor-based game discovery component. There is no current
`invite:{code}` key; audit-era references to such a key describe removed code,
not an alternate schema.

## Pub/Sub

No Redis Pub/Sub publisher/subscriber was found. Event publication currently uses Spring's in-memory WebSocket broker directly through `SimpMessagingTemplate`.

Status: confirmed by search for `RedisMessageListenerContainer`, `PatternTopic`, and `convertAndSend`.
