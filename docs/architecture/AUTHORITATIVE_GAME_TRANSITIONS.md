# Authoritative game transitions

This document is the implemented REVAMP-018 contract and the runtime companion
to ADR-0002, ADR-0003, and ADR-0004. The server accepts command intent, computes
a proposed result from an authoritative snapshot, and applies it through one
Redis compare-and-commit boundary. REST is the current inbound adapter; future
WebSocket commands and timers must use the same boundary.

## Command contract

Every mutating REST game command requires both headers:

- `X-Sindopoly-Command-Id`: a canonical lowercase or uppercase UUID string;
  the server normalizes it to lowercase.
- `X-Sindopoly-Expected-Version`: the last authoritative `stateVersion` seen by
  the client. Creation alone uses `-1`, meaning the game hash must be absent.

Missing, malformed, or out-of-range metadata returns HTTP 400. A stale version
or reuse of one command ID for a different actor, command type, game, expected
version, or normalized semantic payload returns HTTP 409. A stale response may
include the bounded current `stateVersion`; it never includes protected game
state. Clients refresh the authenticated snapshot and ask the user to submit a
new intent. They do not blindly retry a stale command.

The command fingerprint is SHA-256 over the game ID, server-derived actor,
command type, expected version, and normalized semantic payload. An exact retry
returns the originally recorded semantic result and version with
`replayed=true`. Duplicate lookup precedes the freshness check. Roll commands
perform this lookup before invoking the dice source, so a sequential retry does
not roll again. Concurrent duplicate calculations may both begin; Redis records
and returns only the first committed result.

The public-lobby projection includes `stateVersion`. Private clients first read
`GET /api/game-state/invite-metadata?inviteCode=...`, which discloses only the
matched lobby's game ID and version to an authenticated session. This supplies
the join precondition without weakening full private-game reads.

## Redis schema and lifecycle

Existing keys retain their current names; REVAMP-018 does not perform a key
rename or Redis Cluster migration.

| Key | Type / format | Ownership and purpose | Lifecycle |
| --- | --- | --- | --- |
| `game:<gameId>` | HASH of string fields | Authoritative game state. `stateVersion` is a base-10 non-negative safe integer; `turnOrder` is a JSON array of 1-4 unique positive IDs in accepted join order. | 24 hours from lobby creation, retained on start, configurable 300-second default after completion. |
| `game:<gameId>:players` | SET of decimal player IDs | Authoritative membership. | Same transition-managed TTL as the game. |
| `player:<playerId>` | HASH of string fields | Authoritative active player state shared across game identity. | Initialized at start with a 2-hour TTL; completion/abandonment never shortens it. |
| `game:<gameId>:deck` | LIST of decimal card IDs | Per-game isolated cycling card order; an atomic draw moves the head to the tail while applying its effect. | Same TTL as the game when present. |
| `game:<gameId>:commands` | HASH; field is normalized command UUID. New values use `{"fingerprint":string,"stateVersion":number,"resultJson":string}`; readers also accept legacy `result` JSON. | Idempotency fingerprint, committed version, and exact serialized semantic result. This is active-state retry data, not an audit log; the compatible value evolution needs no key rewrite. | Same remaining TTL as the game; retained for 30 seconds when owner-leave deletes lobby state. Maximum 4096 accepted IDs; new IDs fail closed at capacity. |

For an active game created before REVAMP-018, a missing `stateVersion` is read as
logical version `0`; the first successful state-changing command persists `1`.
New creation has an explicit absent precondition and persists version `0`.
Every state-changing transition advances the version exactly once regardless of
the number of game, membership, player, or deck writes. A recorded no-op retry
result does not advance the version.

All values use the existing String Redis serializers. Replay records use
Jackson JSON. Results are fixed command DTOs/maps: they contain no snapshot,
player collection, request body, exception, cookie, session, or CSRF data.
The implementation assumes the project's current
single Redis deployment: the existing keys do not contain Redis Cluster hash
tags, so this multi-key Lua script is not cluster-compatible without a planned
key migration.

The commands hash does not evict entries. `HLEN` is checked only for a new ID;
at 4096 retained IDs, the store returns `COMMAND_CAPACITY` without writing.
Exact replay and command-ID collision detection therefore remain valid for the
commands key's complete lifetime, including for `NO_OP`. This trades a bounded,
fail-closed per-game command capacity for lifetime-wide retry semantics. The
20-minute configured game limit makes the cap substantially larger than the
expected command volume, but capacity exhaustion is still an explicit 409.

## Compare-and-commit invariant

`RedisGameTransitionStore` accepts only a server-owned typed mutation plan; no
transport payload can supply Redis keys, fields, or operations. Its cached Lua
script performs this order:

1. decode inputs and validate every Redis key type, then read the command replay record and either replay it or reject a fingerprint
   collision;
2. establish existence and logical current version;
3. enforce absent-on-create or exact expected-version equality;
4. decode and validate all plan structure, key indexes, and TTLs before the
   first write;
5. apply game, membership, player, and deck changes;
6. set the one resulting `stateVersion`;
7. store the replay result after an O(1) capacity check;
8. align TTLs; and
9. return `APPLIED`, `NO_OP`, or `REPLAY`.

Redis Lua atomicity prevents other Redis commands from observing partial state,
but Lua does not roll back writes after a runtime error. Validation before the
first write therefore covers JSON decoding, key count/types, version range,
operation shapes, player key indexes, values, and TTLs. A wrong-type game,
membership, commands, deck, or player key fails before mutation. No JVM monitor, global
lock, or distributed lock is used. A snapshot can become stale between read and
commit; the version check rejects it, closing the per-game authorization-to-
mutation TOCTOU window for migrated commands.

The cross-game predicate "one player belongs to at most one active game" still
uses the legacy `KEYS game:*:players` discovery check. Concurrent joins to two
different games can therefore both pass because separate game versions cannot
protect a global predicate. REVAMP-018 deliberately implements ADR-0002's
per-game boundary; a global membership index/ownership migration belongs to
REVAMP-023 and requires measurement/index design under REVAMP-027. This is not
claimed as a solved authorization race.

## Migrated paths and notifications

Normal create, public/invite join, start, leave, kick, roll, action, pass, and
scheduler completion paths use the transition store. Authorization-relevant
membership, host/lobby, active-player, and phase state is checked against the
same snapshot whose version is compared at commit. Legacy low-level mutation
helpers remain internal compatibility candidates and are not transport entry
points.

The release write-path audit classifies production Redis writers as follows:

- normal game/lobby/turn/completion state writes are category A and enter
  `RedisGameTransitionStore`;
- leaderboard caching, dice-entropy refill, and post-commit MariaDB statistics
  are category B infrastructure outside authoritative active-game mutation;
- raw mutators retained in `GameStateService`, `PlayerStateService`,
  `SquareActionService`, `CardService`, and `BankruptcyService` are category C:
  repository-wide caller/wiring search found no controller, scheduler, listener,
  or live Spring service invoking them. The only orchestration caller is the
  deprecated `TurnService`, which has no Spring stereotype, `@Bean`, reflection
  lookup, or production instantiation; characterization tests instantiate it
  directly. Their removal/consolidation remains REVAMP-023/025.

No category D live authoritative mutation bypass was found. Redis writes for
the leaderboard and random-entropy pool are not game state and do not advance a
game version.

Current membership is checked before returning replayed private turn/start/kick
results. A self-leave replay is the narrow exception: the successful command
necessarily revoked its own membership, and its stored result contains only
status, game ID, removed player ID, replay flag, and version. Creation/join
replays likewise require the actor's resulting membership. Fingerprint mismatch
never returns the stored semantic result.

Notifications are emitted only for `APPLIED`, after Redis returns success, and
carry the committed `stateVersion`. Replays, stale commands, collisions, and
failed computations emit nothing. The current in-memory STOMP broker still has
a crash window after Redis commit and before publication; clients recover from
the authenticated REST snapshot. REVAMP-021 implements membership-authorized
subscriptions and monotonic reconnect recovery. Durable delivery and
cross-instance fan-out remain deliberately absent; broker-backed and full
end-to-end coverage is REVAMP-022 scope.

Scheduler timeout and completion submit deterministic system commands carrying
the same expected-version contract as player commands. Redis completion is
authoritative. MariaDB finalization occurs afterward through a durable marker
and one transaction; retained `terminalResult` permits retries without another
Redis transition or event. The stores are not claimed to be atomic.

## Compatibility and known deferrals

Responses for roll/action/pass include `stateVersion` and `replayed`; lobby
mutation responses use JSON consistently. The frontend owns a monotonic
per-game version tracker and generates a new UUID only for a new user intent.
Only affordable unowned property and jailed pre-roll payment create typed,
server-owned optional actions; informational/automatic square results require
no follow-up mutation.

REVAMP-019 repairs the approved rent, tax, card, Jail/Go-To-Jail, Start reward,
purchase/decline, frozen join-order, and no-doubles behavior inside this same
transition path. A missing `turnOrder` is initialized only for an unambiguous
single-host lobby; ambiguous lobbies and in-progress legacy games fail closed.
No membership SET iteration or numeric sorting reconstructs order. Durable event
delivery remains out of scope; REVAMP-021 supplies snapshot-based reconnect
recovery over the process-local simple broker.

Lobby creation sets 24-hour game/membership/commands TTLs. Join, start, turn,
replay, stale, reuse, and no-op processing do not refresh the game lifetime;
start creates player hashes with 2-hour TTLs while retaining the game's existing
24-hour deadline. For a migrated legacy game, a newly created commands/deck key
inherits the game's remaining TTL. Completion applies the configurable terminal
TTL to game, membership, commands, and deck only; shared player hashes are not
shortened.

## Verification

- Fast tests cover command metadata, UUID/version validation, fingerprint
  binding, result publication semantics, thin-controller delegation, and the
  approved dice/movement/square/optional-action/jail/order rule matrix.
- Real Redis Testcontainers tests cover first apply, exact replay, stale
  commands, command-ID collision, concurrent competing commands, concurrent
  duplicates, validation-before-write/no partial mutation, absent creation, and
  TTL alignment, frozen-order lifecycle, atomic rent/tax/purchase effects, and
  per-game deck isolation/cycling.
- The existing Redis/MariaDB REST integration flow uses the public command
  contract, and the frontend production build verifies the client migration.
