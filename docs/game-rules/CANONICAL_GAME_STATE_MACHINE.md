# Canonical game state machine

## Status and interpretation

This document defines the approved target command/state vocabulary. It does not
describe unimplemented behavior as current reality. Stable rule decisions live
in `RULE_DECISIONS.md`.

Labels used below:

- **CURRENT:** observed in code or characterization tests.
- **TARGET:** approved architecture/state-machine behavior.
- **DEFECT:** observed behavior that is not an approved rule.
- **PENDING:** a later policy requires user approval; none of RULE-003 through
  RULE-011 is pending.
- **OUT OF SCOPE:** not part of the current Sindopoly feature set.

## State dimensions

### Game lifecycle

| Lifecycle | Meaning | Entry | Exit |
| --- | --- | --- | --- |
| `LOBBY` | Game exists and membership may change. Start eligibility is a guard, not another lifecycle state. | `CreateGame` | `StartGame`, host/approved abandonment policy |
| `IN_PROGRESS` | Active state and exactly one active player/turn exist. | Successful `StartGame` | Approved terminal condition |
| `COMPLETED` | Terminal result is committed; gameplay commands are rejected. | `CompleteGame` internal continuation | Redis cleanup after durable finalization/recovery window |

`READY_TO_START`, `CLEANUP_PENDING`, and `ABANDONED` are not canonical states
yet. Readiness is derived from lobby guards; cleanup is an operational step;
abandonment/disconnect policy remains pending.

### Turn phase

| Phase | Meaning | Accepted player command |
| --- | --- | --- |
| `NONE` | Lifecycle is not `IN_PROGRESS`. | None |
| `AWAITING_ROLL` | Active player may submit one roll for the current version, unless a jailed player has the pre-roll payment option. | `RollDice`, or the jail payment/pass option when present |
| `AWAITING_OPTIONAL_ACTION` | A typed server-created option is pending for the active player/turn, including purchase or jailed-player payment. | `PerformOptionalAction` or permitted `PassOptionalAction` |

Dice generation, movement, square resolution, automatic effects, turn
completion, and rotation are internal deterministic continuations inside an
accepted authoritative command. They are not independent client-visible phases
or REST commands. If no optional choice remains, the transition rotates to the
next active player and returns to `AWAITING_ROLL`.

## Command model and common acceptance contract

External commands: `CreateGame`, `JoinGame`, `LeaveGame`, `StartGame`,
`RollDice`, `PerformOptionalAction`, and `PassOptionalAction`.

System commands: `HandleTurnTimeout`, `HandleDisconnect` (policy pending), and
`CleanupGame`. Reconnect is primarily authenticated snapshot recovery; it is a
mutation command only if a later presence policy requires one.

Every authoritative mutation is accepted only after actor, membership/role,
lifecycle/phase, `commandId`, and `expectedStateVersion` guards. Per ADR 0002:

```text
new command X + expected version 42 + current version 42
  -> one atomic transition commits at version 43
completed command X repeated
  -> recorded idempotent result, no mutation
new command + expected version not current
  -> stale/conflict result, no mutation
```

The application-command boundary owns guards. The Redis state store owns the
atomic compare-and-commit. Domain rules never trust client dice, position,
balance, phase, active player, or next player.

## Canonical transition table

| Lifecycle / phase | Command or trigger | Actor and guards | Authoritative reads / effect | Resulting state and version | Notification / failure |
| --- | --- | --- | --- | --- | --- |
| none / `NONE` | `CreateGame` | Authenticated actor; eligible player; new command | MariaDB player metadata; create Redis lobby and owner membership | `LOBBY/NONE`; initial version | `LobbyCreated` after commit; unauthenticated/invalid/conflict otherwise |
| `LOBBY/NONE` | `JoinGame` | Authenticated actor; game exists; visibility/invite, capacity, duplicate policy | Membership and lobby metadata; add member atomically | `LOBBY/NONE`; version +1 | `LobbyMembershipChanged`; forbidden/full/invalid/stale |
| `LOBBY/NONE` | `LeaveGame` | Actor is member; host-leave policy pending | Membership; remove member or approved abandon behavior | `LOBBY/NONE` or terminal policy; version +1 | `LobbyMembershipChanged`; forbidden/stale |
| `LOBBY/NONE` | `StartGame` | Member with host authority; minimum players; current version | Membership plus durable board/player metadata; freeze join order and initialize active state | `IN_PROGRESS/AWAITING_ROLL`; version +1 | `GameStarted`; forbidden/invalid phase/stale |
| `IN_PROGRESS/AWAITING_ROLL` | jailed turn begins | Active player is jailed with remaining turns | Create typed `PAY_JAIL_EXIT` option (cost 50), bound to player/turn/version | `IN_PROGRESS/AWAITING_OPTIONAL_ACTION`; version +1 | Optional action available; stale transition rejected |
| `IN_PROGRESS/AWAITING_ROLL` | `RollDice` | Member, active player, not jailed/pending jail option, new command, matching version | Active game/player state; server dice; movement; square rule | Optional choice or next player's `AWAITING_ROLL`; one version +1 | One `RollResolved` result notification; wrong actor/phase/duplicate/stale |
| internal | movement/square/automatic effect | Already accepted roll | Apply Start reward, position, positive-cost tax, rent transfer, card effect, Go To Jail, and ownership rules | Part of same roll commit | No separate command; event may summarize results |
| `IN_PROGRESS/AWAITING_ROLL` | roll exposes purchase option | Already accepted roll | Build typed `PURCHASE_PROPERTY` option bound to game, actor, turn/version | `AWAITING_OPTIONAL_ACTION`; same roll commit | `OptionalActionAvailable` within roll result |
| `IN_PROGRESS/AWAITING_OPTIONAL_ACTION` | `PerformOptionalAction` | Active member; matching option/type/turn/version; new command | Purchase property, or pay 50 to clear jail/count and return to same player's `AWAITING_ROLL` | Purchase: next player's `AWAITING_ROLL`; jail payment: same player's `AWAITING_ROLL`; version +1 | `OptionalActionResolved`/turn changed; invalid option/stale |
| same | `PassOptionalAction` | Same guards; option explicitly declinable | Purchase: clear option and rotate; jail payment: clear option, decrement remaining jail turns, and rotate | Next player's `AWAITING_ROLL`; after third skipped jail turn player is released for their next turn; version +1 | Resolution/turn changed; non-declinable/invalid/stale |
| `IN_PROGRESS/*` | `HandleTurnTimeout` | System actor; referenced active player/phase/version still current | Current turn and deadline; apply approved timeout consequence once | Approved next phase/player; version +1 | `TurnTimedOut`/turn changed; stale timer is no-op/conflict |
| `IN_PROGRESS/*` | leave/disconnect | Authenticated member or system observation; policy pending | Membership/turn/state | Only through canonical command; version +1 if accepted | No independent cleanup or duplicate turn mutation |
| `IN_PROGRESS/*` | terminal condition after accepted transition/system check | Current version; condition approved | Active state; compute final result | `COMPLETED/NONE`; version +1 | One `GameCompleted` after persistence |
| `COMPLETED/NONE` | durable finalization | Idempotent system work | Redis final snapshot; write MariaDB statistics once | Lifecycle remains completed | No second completion event |
| `COMPLETED/NONE` | `CleanupGame` | Finalization complete; recovery TTL elapsed; current terminal version | All game-owned Redis keys | Active keys removed; durable records retained | Operational result only |

The exact event envelope is deferred to REVAMP-021. Events are versioned
notifications after persistence, not authoritative history.

## Dice and optional-action flow

`RollDice` is one logical command: server dice → deterministic movement →
position update → square resolution → automatic effect or typed option → atomic
commit → notification. The client chooses none of those authoritative results.
Doubles have no game-flow meaning in this revamp: no extra roll or jail
interaction. The resulting total is sufficient for the target contract.

The target optional action is a small typed value containing conceptually:
`gameId`, active `playerId` derived server-side, turn/state reference, action
type, allowed choices, typed argument(s), positive cost where applicable, and
whether decline is allowed. The supported target types are
`PURCHASE_PROPERTY` and `PAY_JAIL_EXIT`. The client submits only a permitted
choice plus command/version guards. Stale or mismatched submissions fail
without mutation. Completion clears the option and rotates/continues according
to the approved rule. This is deliberately not a generic workflow engine.

## Approved rule semantics

Movement awards 200 on either passing Start or landing exactly on it. Monetary
costs are positive domain amounts: paying a cost subtracts it once and receiving
money adds it. Rent is one positive transfer: `payer - amount`, `owner +
amount`; self-owned squares create no rent.

Money and transport cards remain the supported subset. The server owns an
isolated deck per game, preserves the amount/destination in the effect, cycles
used cards back into the playable deck, and removes deck state during game
cleanup. Exact shuffle order and Redis key structure remain implementation
details under the Redis ADR.

Landing on Jail is just visiting. Go To Jail immediately places the player at
10, marks them jailed, and assigns three jail turns. The pre-roll payment
option uses the existing optional-action phase; passing skips/decrements/rotates
and a third skipped turn releases the player for their next normal turn.
Whenever rotation selects a still-jailed player, that same transition creates
the version-bound `PAY_JAIL_EXIT` option. Paying clears jail and leaves that
player active in `AWAITING_ROLL`; it does not roll automatically. Poll/reconnect
recovery projects the existing option, so no extra mutation is needed to reveal
the choice.

Join order is persisted in `game:{gameId}.turnOrder` as players join and frozen
at game start. It is explicit ordered state distinct from membership; removal
preserves remaining relative order and rotation picks the next active player.
Numeric player-ID sorting survives only in unwired deprecated helpers, not the
authoritative command path.

Implemented migration state and remaining legacy representations:

- authoritative `optionalAction` is typed JSON bound to game, actor, committed
  version, action type, arguments/cost, and declinability;
- an unrelated in-progress membership change preserves a surviving active
  player's option but rebinds it to the newly committed version atomically, so
  intent submitted against the prior snapshot is stale;
- deprecated `SquareEventDto` and colon-delimited helpers remain unwired cleanup
  candidates;
- `/action` path/body identity agreement is enforced and server session identity
  remains authoritative;
- selected events `actionCompleted`, `turnFinished`, `gameOver`, `gameEnded`;
- notifications remain non-durable and snapshot recovery remains required.

## Redis and durable-data mapping

| CURRENT field/key | CURRENT meaning | TARGET concept | Migration owner |
| --- | --- | --- | --- |
| `game:{id}.status` (`lobby`, `inProgress`, `ended`) | Lifecycle approximation | `LOBBY`, `IN_PROGRESS`, `COMPLETED` | REVAMP-018/020 |
| `game:{id}.playerTurn` | Active player | Server-owned active player | REVAMP-018 |
| presence of typed `optionalAction` | Implemented phase marker bound to actor/version/type | `AWAITING_OPTIONAL_ACTION`; absence during active game implies `AWAITING_ROLL` | REVAMP-018/019 |
| `lastDice` | Last server total | Roll result metadata, never client authority | REVAMP-018/019 |
| `timer`, `startTime`, `maxTime`, `maxMoney` | Current terminal/time inputs | Version-guarded lifecycle/timeout policy | REVAMP-020 |
| `winner` | Current result | Committed terminal result | REVAMP-020 |
| `optionalDeadline` | Partial timeout metadata | Timer references turn/phase/version | REVAMP-020 |
| `game:{id}:players` plus `game:{id}.turnOrder` | Membership SET plus explicit JSON join order | Membership and separately persisted frozen turn order | REVAMP-019 |
| `player:{id}` hashes | Active money/position/jail/properties | Active player state, including jailed flag and remaining jail turns | REVAMP-018/019 |
| `game:{id}:deck` | Isolated cycling Redis LIST | Money/transport card order; atomic head-to-tail draw | REVAMP-019; cleanup REVAMP-020 |
| no field | No version/command marker | `stateVersion` and bounded idempotency result | REVAMP-018 |

No key/field is renamed by this document. Redis remains authoritative for
active state. MariaDB remains authoritative for player metadata, static
square/card definitions, and idempotently finalized statistics—not live turns.

## REST adapters and errors

| Current endpoint | Target command | Current identity issue |
| --- | --- | --- |
| `POST /api/game-state/create` | `CreateGame` | Body owner ID is not proof |
| `POST /api/game-state/add/{gameId}/{playerId}` and invite join | `JoinGame` | Path/query player ID is not proof |
| `POST /api/game-state/{gameId}/remove-player` | `LeaveGame` | Caller/host authority absent |
| `POST /api/game-state/{gameId}/start` | `StartGame` | Query player ID is not proof |
| `POST /api/turn/{gameId}/{playerId}/throw` | `RollDice` | Path player ID is not proof; no command/version |
| `POST .../action` | `PerformOptionalAction` | Path/body identity mismatch is accepted |
| `POST .../pass` | `PassOptionalAction` | Actor authentication absent |
| removed public `check-end` | Internal/system completion evaluation | Removed in REVAMP-017; no client replacement |

Transport eventually maps typed categories: unauthenticated, forbidden, not
found, invalid command/input, invalid lifecycle/phase, stale conflict, duplicate
result, and infrastructure failure. Exact HTTP codes remain implementation/API
work; internal Redis/SQL details are never returned.

## Notifications and recovery

Conceptual notifications: lobby membership changed, game started, roll resolved
(including movement/square summary), optional action available/resolved, turn
changed/timed out, and game completed. Internal calculations need not each emit
an event. Every accepted notification carries the resulting `stateVersion` and
is sent after persistence.

On connect/reconnect, authenticate and authorize subscription, then fetch the
REST snapshot containing lifecycle, phase, active player, optional action, and
version. Discard stale local choices/events. Apply compatible later events; on
a gap or ambiguity fetch another snapshot. STOMP simple broker remains current;
Pub/Sub/Streams are not recovery storage.

## Terminal state and cleanup

The configured time limit or configured cash threshold may trigger completion.
Winner selection is deterministic: highest total asset value (cash plus the
configured/base value of currently represented owned assets), then higher cash,
then earlier frozen turn order. No unrepresented house, hotel, mortgage,
trading, or bankruptcy valuation is invented.

Completion commits terminal lifecycle and stored winner before durable
finalization. MariaDB statistics are finalized idempotently and exactly once
per player/game; a recoverable final snapshot/event follows. Cleanup is
separate and may run only after finalization and the configured recovery window.
It removes every game-owned active key, including membership, player state,
deck, command markers, and timer metadata. A late/duplicate cleanup is safe.

## Test mapping

| Tests | Current evidence | Target relation | Classification |
| --- | --- | --- | --- |
| `GameStateControllerCharacterizationTest` create/join/start | Current adapter responses/prechecks | `CreateGame`, `JoinGame`, `StartGame` | Partial match; actor authorization missing |
| same remove plus removed check-end | Authenticated self-leave remains; public completion adapter removed | `LeaveGame`, internal completion | Partial match; leave atomicity/version pending |
| `TurnControllerCharacterizationTest` throw | Server actor plus command/version headers | `RollDice` adapter | Matches implemented entry guards |
| same action mismatch | Mismatched body/path actor is rejected | Optional-action command | Matches target guard |
| same pass | Typed choice clears/decrements and rotates | `PassOptionalAction` | Matches implemented entry guards |
| `TurnCommandGameplayRuleTest` roll cases | One transition applies movement and automatic square effect or creates one typed choice | Atomic roll transition | Matches implemented rule/atomicity boundary |
| same wrong-player/stale cases | Reject before commit | Roll/action guards | Matches target guards |
| same optional buy/pass cases | Typed option clears and rotates exactly once | Optional resolution | Matches target behavior |
| `MovementServiceRuleTest` plus gameplay tests | Modulo movement/pass flag and authoritative reward | Internal movement rule | Covers ordinary/pass/exact Start behavior |
| `DiceServiceRuleTest` plus gameplay tests | Two server-source values summed | Server-authoritative roll | Covers normal and equal-die/no-doubles flow |
| `SquareActionServiceRuleTest` plus gameplay tests | Affordable unowned property offers buy | Optional action | Covers affordability, ownership, stale, accept, and decline |
| gameplay and real-Redis integration tests | Positive rent/tax, retained/cycling cards, distinct Jail behavior | Square resolution | Repaired behavior covered atomically |

REVAMP-019 tests cover Start passing/exact landing reward; rent transfer and
self-owner/no-rent; positive-cost tax; money/transport effects and per-game deck
cycling; Jail visiting, Go To Jail, payment, three skipped turns/release; and
frozen order/leave preservation. REVAMP-020 must finish completion trigger,
total assets, both tie-breaks, cleanup, and timer interaction. Integration tests
cover lifecycle/phase snapshots, adapter error
categories, Redis isolation, and durable metadata boundaries without treating
the listed defects as target contracts. REVAMP-021/022 cover subscription
authorization, post-commit versioned events, duplicates/gaps, and snapshot
recovery.

## Security and performance invariants

Each external command uses server-derived actor identity and application-owned
membership/host/active-player/phase/replay/version guards. System timers carry
the targeted turn/version. Subscribers prove membership. Client dice and state
are ignored. These controls address forged identity, cross-game access,
non-host/non-active actions, stale options, replay, timer races, and stale UI.

The model uses one coherent transition rather than fragmented commands, bounded
per-game Redis work rather than global locks, no mandatory MariaDB query per
turn, and focused notifications rather than full-state broadcasts.
