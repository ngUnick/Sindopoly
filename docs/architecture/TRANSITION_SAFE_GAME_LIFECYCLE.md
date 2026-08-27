# Transition-safe game lifecycle

## Authoritative time and timeout commands

The backend uses an injected UTC `Clock`. `sindopoly.game.turn-timeout-seconds`
defaults to 60 seconds. The authoritative deadline is the decimal epoch-millis
field `game:{gameId}.turnDeadlineEpochMs`; it is written in the same Redis CAS
as game start and each new actionable roll or optional-action window. Reads,
polls, replay, and unrelated state changes do not refresh it.

The supported phases are `AWAITING_ROLL` and `AWAITING_OPTIONAL_ACTION`. A due
timeout becomes a deterministic system command bound to game ID, expected
`stateVersion`, active player, phase, and deadline. Redis CAS arbitrates
player/timer and multi-instance races. Roll timeout rotates without rolling or
applying a square. Property timeout is the canonical decline. Jail timeout is
the canonical skip/decrement/release. No timeout removes, bankrupts,
disconnects, or marks a player AFK.

The scheduler retains the two-second `KEYS game:*` discovery loop; only exact
`game:{decimalId}` hashes are processed. This is read-only discovery, not
transition ownership, and remains a measured scalability candidate.

## Completion and cleanup

Elapsed game time is `Clock.now - startTime`; legacy `timer` is not an
authority. Completion freezes status, winner, version, and bounded
`terminalResult` JSON in one CAS, and removes the deadline/optional action.
The JSON contains deterministic finalization/game identity, completion time,
duration, winner, and at most four player money/winner inputs.

`sindopoly.game.terminal-retention-seconds` defaults to 300 seconds. Completion
applies it to the game, membership, command replay, and deck keys. Redis expiry
owns cleanup; polls, replay, and finalization retry never refresh it. Shared
`player:{playerId}` hashes are neither deleted nor terminal-shortened because
the current schema cannot prove old-game ownership.

Only an applied completion publishes a typed `GAME_COMPLETED` notification. Redis completion remains
authoritative if MariaDB is unavailable; retained terminal JSON permits later
Stats retries without another transition or event. Expiry before a successful
retry can lose Stats, an explicit bounded non-atomic limitation.

## Durable Stats finalization

`game_finalization` stores one deterministic marker per game instance. One
MariaDB transaction inserts it, locks each bounded player's unique Stats row,
updates every row, and commits. An identical marker replay is a no-op;
conflicting identity fails. Missing rows or partial failure roll back the marker
and all Stats. Redis and MariaDB are not one atomic transaction.

## Existing-volume compatibility

Flyway V1 owns `game_finalization`, the Stats invariant, and the player-insert
trigger. Hibernate validates rather than updates MariaDB. For a recognized
non-empty database without Flyway history, `SindopolyFlywayMigrationStrategy`
runs the temporary `LegacyDatabaseBootstrapService` before Flyway migration.
The bridge holds `sindopoly:database-compatibility` only while it validates and
repairs the legacy schema, then baselines at V1 and releases the lock. A
Flyway-managed database never runs legacy repair.

The player-insert trigger is the only live Stats-row creation owner. For legacy
duplicates, one populated row plus zero rows retains the populated row; all-zero
duplicates retain the lowest Stats ID. Values are never summed. Multiple
populated rows, NULL owners, missing-player references, unknown schemas, and
unexpected reference data fail startup with bounded diagnostics and no guessed
deletion. MariaDB DDL implicit commits mean the bootstrap is not claimed to be
rollbackable. Full lifecycle and removal policy are documented in
`DATABASE_MIGRATION_OWNERSHIP.md` and ADR-0005.

## Contract effects

- Retained terminal state remains readable; REVAMP-021 adds the bounded member-only
  `/api/game-state/{gameId}/snapshot` recovery projection.
- Timer transitions and completion use bounded post-commit notifications.
  Snapshot recovery remains authoritative; delivery is non-durable and the
  simple broker remains process-local.
- No Pub/Sub or new Redis key is introduced. The only new game HASH fields are
  `turnDeadlineEpochMs` and `terminalResult`.
- No frontend contract change is required.
