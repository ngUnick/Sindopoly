# Sindopoly rule decisions

Stable IDs in this file are never renumbered. `APPROVED` means supported by
existing project evidence or architecture approval. `PENDING` requires explicit
user approval; current behavior is not the target merely because a test records
it.

### RULE-001 — Server-authoritative dice

- Status: `APPROVED`.
- Current behavior: `DiceService` obtains two server-side die values and returns their sum.
- Target decision: the backend generates dice; clients submit only roll intent.
- Rationale: established implementation, tests, security standards, and ADRs.
- Tests: `DiceServiceRuleTest`, active-roll characterization.
- Migration: individual dice may later be represented for doubles, without accepting client values.
- Follow-up: REVAMP-018/019.

### RULE-002 — Board movement

- Status: `APPROVED`.
- Current behavior: `(position + total) % 40` with wrap detection.
- Target decision: 40-position forward modulo movement from a server dice total.
- Rationale: pure implementation and deterministic coverage agree.
- Tests: `MovementServiceRuleTest`.
- Migration: Start reward semantics remain RULE-004.
- Follow-up: REVAMP-019.

### RULE-003 — Doubles

- Status: `APPROVED`.
- Current behavior: only a total is represented; doubles have no behavior.
- Target decision: doubles have no game-flow meaning in this revamp stage: no extra roll, repeated-doubles jail rule, or individual-die DTO/event requirement. Dice remain server-authoritative; individual values may remain an internal deterministic-generation detail.
- Rationale: the current gameplay contract needs only movement amount; this preserves its scope without inventing classic rules.
- Tests: retain server-generated-total coverage; assert that a roll always completes normally without doubles-specific transition behavior.
- Migration: do not add client-visible individual die values solely for this rule. A future approved feature may introduce doubles.
- Follow-up: REVAMP-019.

### RULE-004 — Passing or landing on Start

- Status: `APPROVED`.
- Current behavior: `current + dice >= 40` grants 200 in `TurnService`, including exact landing on position 0.
- Target decision: passing Start and landing exactly on Start each grant 200 as part of the authoritative movement transition; no separate client command exists.
- Rationale: preserves the implemented reward behavior.
- Tests: distinguish passing from exact landing and assert the 200 reward in both cases.
- Migration: keep reward calculation within the single movement/roll transition.
- Follow-up: REVAMP-019.

### RULE-005 — Property purchase and decline

- Status: `APPROVED`.
- Current behavior: an affordable unowned property exposes a buy offer; accepting deducts price and records ownership; declining ends the option. Auctions are absent.
- Target decision: an affordable unowned property creates a server-owned optional purchase action. Purchase is optional; passing/declining clears the option and ends it without an auction. Mandatory purchase and auctions are out of scope.
- Rationale: smallest supported Sindopoly rule and compatible with the current model.
- Tests: add insufficient-funds, duplicate purchase, decline, ownership, stale-option, and active-player/version checks.
- Migration: replace legacy optional-action shapes with the typed option from RULE-012.
- Follow-up: REVAMP-018/019.

### RULE-006 — Rent transfer

- Status: `APPROVED`.
- Current behavior: `rentDue` carries a negative amount and automatic application debits both payer and owner. This is a confirmed `DEFECT`.
- Target decision: rent is one positive domain amount: payer balance decreases by that amount and owner balance increases by the same amount. A player never pays rent to themselves. Negative balances remain possible because this revamp does not invent bankruptcy, liquidation, partial payment, mortgages, or buildings.
- Rationale: ordinary transfer semantics preserve money between players and remove sign ambiguity.
- Tests: replace the double-debit characterization; add transfer, self-owner/no-rent, atomicity, and established utility/train/color calculation coverage. Unestablished calculation details remain pending implementation evidence.
- Migration: normalize `rentDue`/DTO interpretation consistently rather than applying local sign corrections.
- Follow-up: REVAMP-019.

### RULE-007 — Tax payment sign

- Status: `APPROVED`.
- Current behavior: seed prices and peek events are negative, then automatic application subtracts the negative value and increases money. This is a confirmed `DEFECT`.
- Target decision: tax is a positive domain cost and payment subtracts it exactly once. Receiving money adds a positive amount.
- Rationale: positive costs eliminate the current negative-value ambiguity.
- Tests: replace the current sign characterization and test positive-cost subtraction, including established insufficient-funds behavior.
- Migration: migrate seed/DTO/domain interpretation consistently; do not spread ad-hoc sign corrections through rule layers.
- Follow-up: REVAMP-019.

### RULE-008 — Card scope and deck behavior

- Status: `APPROVED`.
- Current behavior: a per-game Redis list is shuffled from MariaDB cards; supported types are `money` and `transport`, but `SquareEventDto.card` currently drops amount. Deck cleanup/reinitialization is incomplete. Losing effect data and exhausted/disappearing decks are target `DEFECT`s.
- Target decision: retain and repair only the implemented money/transport subset. Each game owns an isolated, server-authoritative deck; draws retain required money/destination effect data; used cards cycle back into the playable deck; reconnect recovery is consistent; cleanup removes game-specific deck state. Ordering/shuffle and exact Redis keys remain implementation details.
- Rationale: repairs current intent without introducing a full classic card system.
- Tests: money/transport effects, retained effect data, per-game isolation, exhaustion/cycling, cleanup, missing-card handling, and versioned atomic effects.
- Migration: introduce no new classic card category; align the eventual state-store representation with the Redis ADR.
- Follow-up: REVAMP-019/020.

### RULE-009 — Jail and Go To Jail

- Status: `APPROVED`.
- Current behavior: both `JAIL` and `GOJAIL` expose a fee-50 offer; accepting the option deducts 50 and sets position 10, jailed true, three turns. This is a confirmed `DEFECT`.
- Target decision: landing normally on Jail is just visiting and has no effect. Go To Jail immediately moves the player to position 10, marks them jailed, and establishes three jail turns. Before every jailed turn, a 50-payment optional action is available. Paying subtracts 50 once, clears jailed state/count, and permits a normal roll in that turn. Passing skips that turn, decrements the count, and rotates. After three skipped turns, release automatically and allow the next turn to roll without an extra charge. Doubles and Get Out of Jail Free are out of scope.
- Rationale: coherent minimal semantics using existing jail concepts without importing classic rules.
- Tests: replace current jail characterization; add visiting, immediate Go To Jail, pay-to-exit/same-turn roll, three skips/release, stale payment, and turn-rotation coverage.
- Migration: model payment as the typed server-owned optional action from RULE-012; do not retain the shared legacy Jail/Go To Jail offer.
- Follow-up: REVAMP-019/020.

### RULE-010 — Stable turn order and leaving players

- Status: `APPROVED`.
- Current behavior: Redis membership is a set and rotation sorts numeric player IDs; a controller comment claims join order. Numeric ID sorting is a confirmed legacy `DEFECT`.
- Target decision: freeze join order when the game starts; it is the canonical turn order. Removing/leaving players preserves relative order, and turn advancement selects the next still-active player in that order. Player IDs carry no ordering semantics. Host-departure/disconnect policy remains deferred.
- Rationale: deterministic, explainable, and consistent with the intended join-order expectation.
- Tests: first player, wrap, active/non-active leave, relative-order preservation, and nonnumeric/unsorted-ID cases.
- Migration: REVAMP-018 must introduce and persist explicit ordered turn state; do not rename current keys in this documentation phase.
- Follow-up: REVAMP-018/019/020.

### RULE-011 — Game completion and winner

- Status: `APPROVED`.
- Current behavior: game ends at timer 1200 seconds or when any player reaches money 5000; winner is highest money plus property purchase prices; scheduler and turn path can both finish it.
- Target decision: configurable time limit or configured cash threshold may complete a game. Winner is highest total asset value: current cash plus configured/base value of owned current-model assets. Ties resolve by higher cash, then earlier frozen canonical turn order. Terminal state commits first; winner is stored; MariaDB statistics finalize idempotently; final recoverable snapshot/event follows; active Redis cleanup occurs only after finalization/recovery handling.
- Rationale: retains current completion style while making result and cleanup deterministic; bankruptcy/elimination and unrepresented valuations are out of scope.
- Tests: time boundary, threshold crossing, total-asset calculation, cash tie-break, order tie-break, idempotent finalization, final snapshot/event, and delayed cleanup.
- Migration: route scheduler and turn-path completion through one authoritative transition; current fields/endpoints are approximations, not canonical authority.
- Follow-up: REVAMP-019/020.

### RULE-012 — Typed optional action

- Status: `APPROVED` (architecture-level model; individual action rules above may remain pending).
- Current behavior: incompatible JSON and colon-delimited shapes exist; body identity can override path identity.
- Target decision: one server-created typed option bound to game, active actor, turn/version, action type, allowed choices, typed arguments, and declinability. A choice never supplies authoritative identity/state.
- Rationale: required by the command boundary, security model, and state-version ADRs.
- Tests: stale/mismatched actor/type/version, duplicate choice, decline policy, atomic clear-and-transition.
- Migration: read legacy shapes only during a bounded migration; write one new representation and reject mismatched IDs.
- Follow-up: REVAMP-018/019.

### RULE-013 — Free Parking and unsupported classic mechanics

- Status: `APPROVED` as `NOT_IMPLEMENTED / OUT_OF_SCOPE` for this revamp stage.
- Current behavior: Free Parking is informational; auctions, mortgages, houses/hotels, and trading are absent.
- Target decision: do not invent these mechanics during repair work.
- Follow-up: separate future backlog approval if desired.
