# Sindopoly rule decisions

Stable IDs in this file are never renumbered. `APPROVED` means supported by
existing project evidence or architecture approval. `PENDING` requires explicit
user approval; current behavior is not the target merely because a test records
it.

### RULE-001 — Server-authoritative dice

- Status: `APPROVED`.
- Current behavior: `DiceService` obtains two server-side die values and returns their sum through the authoritative roll command.
- Target decision: the backend generates dice; clients submit only roll intent.
- Rationale: established implementation, tests, security standards, and ADRs.
- Tests: `DiceServiceRuleTest`, active-roll characterization.
- Migration: individual dice may later be represented for doubles, without accepting client values.
- Follow-up: implemented by REVAMP-018/019.

### RULE-002 — Board movement

- Status: `APPROVED`.
- Current behavior: `(position + total) % 40` with wrap detection.
- Target decision: 40-position forward modulo movement from a server dice total.
- Rationale: pure implementation and deterministic coverage agree.
- Tests: `MovementServiceRuleTest`.
- Migration: Start reward semantics remain RULE-004.
- Follow-up: implemented by REVAMP-019.

### RULE-003 — Doubles

- Status: `APPROVED`.
- Current behavior: only a total is represented; equal die values have no special behavior and complete one ordinary turn.
- Target decision: doubles have no game-flow meaning in this revamp stage: no extra roll, repeated-doubles jail rule, or individual-die DTO/event requirement. Dice remain server-authoritative; individual values may remain an internal deterministic-generation detail.
- Rationale: the current gameplay contract needs only movement amount; this preserves its scope without inventing classic rules.
- Tests: retain server-generated-total coverage; assert that a roll always completes normally without doubles-specific transition behavior.
- Migration: do not add client-visible individual die values solely for this rule. A future approved feature may introduce doubles.
- Follow-up: implemented by REVAMP-019.

### RULE-004 — Passing or landing on Start

- Status: `APPROVED`.
- Current behavior: the authoritative roll transition grants 200 for passing or landing exactly on Start.
- Target decision: passing Start and landing exactly on Start each grant 200 as part of the authoritative movement transition; no separate client command exists.
- Rationale: preserves the implemented reward behavior.
- Tests: distinguish passing from exact landing and assert the 200 reward in both cases.
- Migration: keep reward calculation within the single movement/roll transition.
- Follow-up: implemented by REVAMP-019.

### RULE-005 — Property purchase and decline

- Status: `APPROVED`.
- Current behavior: an affordable unowned property exposes a buy offer; accepting deducts price and records ownership; declining ends the option. Auctions are absent.
- Target decision: an affordable unowned property creates a server-owned optional purchase action. Purchase is optional; passing/declining clears the option and ends it without an auction. Mandatory purchase and auctions are out of scope.
- Rationale: smallest supported Sindopoly rule and compatible with the current model.
- Tests: add insufficient-funds, duplicate purchase, decline, ownership, stale-option, and active-player/version checks.
- Migration: replace legacy optional-action shapes with the typed option from RULE-012.
- Follow-up: implemented by REVAMP-018/019.

### RULE-006 — Rent transfer

- Status: `APPROVED`.
- Current behavior: the authoritative transition uses one positive rent amount, debits the payer once, credits the owner once, and skips self-rent. The deprecated legacy helper has matching sign behavior.
- Target decision: rent is one positive domain amount: payer balance decreases by that amount and owner balance increases by the same amount. A player never pays rent to themselves. Negative balances remain possible because this revamp does not invent bankruptcy, liquidation, partial payment, mortgages, or buildings.
- Rationale: ordinary transfer semantics preserve money between players and remove sign ambiguity.
- Tests: replace the double-debit characterization; add transfer, self-owner/no-rent, atomicity, and established utility/train/color calculation coverage. Unestablished calculation details remain pending implementation evidence.
- Migration: normalize `rentDue`/DTO interpretation consistently rather than applying local sign corrections.
- Follow-up: implemented by REVAMP-019.

### RULE-007 — Tax payment sign

- Status: `APPROVED`.
- Current behavior: static negative seed values are normalized at the rule boundary to a positive cost and subtracted exactly once.
- Target decision: tax is a positive domain cost and payment subtracts it exactly once. Receiving money adds a positive amount.
- Rationale: positive costs eliminate the current negative-value ambiguity.
- Tests: replace the current sign characterization and test positive-cost subtraction, including established insufficient-funds behavior.
- Migration: migrate seed/DTO/domain interpretation consistently; do not spread ad-hoc sign corrections through rule layers.
- Follow-up: implemented by REVAMP-019.

### RULE-008 — Card scope and deck behavior

- Status: `APPROVED`.
- Current behavior: the authoritative roll path treats money-card amount as signed server data (positive credits, negative costs), preserves transport destination data, and atomically moves each drawn card to the tail of its isolated per-game Redis list. The one positive `Pay 20` seed inconsistency is corrected to `-20`; cleanup ownership remains incomplete.
- Target decision: retain and repair only the implemented money/transport subset. Each game owns an isolated, server-authoritative deck; draws retain required money/destination effect data; used cards cycle back into the playable deck; reconnect recovery is consistent; cleanup removes game-specific deck state. Ordering/shuffle and exact Redis keys remain implementation details.
- Rationale: repairs current intent without introducing a full classic card system.
- Tests: money/transport effects, retained effect data, per-game isolation, exhaustion/cycling, cleanup, missing-card handling, and versioned atomic effects.
- Migration: no new classic card category was introduced; the per-game cycling
  deck and cleanup follow the Redis lifecycle contract.
- Follow-up: implemented by REVAMP-019/020.

### RULE-009 — Jail and Go To Jail

- Status: `APPROVED`.
- Current behavior: Jail is visiting; Go To Jail immediately moves to 10 with three jailed turns; rotation to a jailed player atomically creates the typed pay-or-skip action. Paying clears jail and keeps the player active to submit the ordinary roll in that same turn.
- Target decision: landing normally on Jail is just visiting and has no effect. Go To Jail immediately moves the player to position 10, marks them jailed, and establishes three jail turns. Before every jailed turn, a 50-payment optional action is available. Paying subtracts 50 once, clears jailed state/count, and permits a normal roll in that turn. Passing skips that turn, decrements the count, and rotates. After three skipped turns, release automatically and allow the next turn to roll without an extra charge. Doubles and Get Out of Jail Free are out of scope.
- Rationale: coherent minimal semantics using existing jail concepts without importing classic rules.
- Tests: replace current jail characterization; add visiting, immediate Go To Jail, pay-to-exit/same-turn roll, three skips/release, stale payment, and turn-rotation coverage.
- Migration: model payment as the typed server-owned optional action from RULE-012; do not retain the shared legacy Jail/Go To Jail offer.
- Follow-up: implemented by REVAMP-019/020.

### RULE-010 — Stable turn order and leaving players

- Status: `APPROVED`.
- Current behavior: the game hash persists explicit join order independently of membership; start freezes it and departure preserves relative order.
- Target decision: freeze join order when the game starts; it is the canonical turn order. Removing/leaving players preserves relative order, and turn advancement selects the next still-active player in that order. Player IDs carry no ordering semantics. Lobby host leave removes the lobby; in-progress explicit leave uses the same atomic membership/rotation boundary. Network disconnect alone does not mutate membership.
- Rationale: deterministic, explainable, and consistent with the intended join-order expectation.
- Tests: first player, wrap, active/non-active leave, relative-order preservation, and nonnumeric/unsorted-ID cases.
- Migration: REVAMP-019 adds the `turnOrder` game-hash field with a bounded fail-closed legacy policy; Redis membership remains a set.
- Follow-up: implemented by REVAMP-019/020.

### RULE-011 — Game completion and winner

- Status: `APPROVED`.
- Current behavior: configured elapsed-time or cash-threshold checks use one transition-safe completion path; winner uses total asset value, then cash, then frozen turn order.
- Target decision: configurable time limit or configured cash threshold may complete a game. Winner is highest total asset value: current cash plus configured/base value of owned current-model assets. Ties resolve by higher cash, then earlier frozen canonical turn order. Terminal state commits first; winner is stored; MariaDB statistics finalize idempotently; final recoverable snapshot/event follows; active Redis cleanup occurs only after finalization/recovery handling.
- Rationale: retains current completion style while making result and cleanup deterministic; bankruptcy/elimination and unrepresented valuations are out of scope.
- Tests: time boundary, threshold crossing, total-asset calculation, cash tie-break, order tie-break, idempotent finalization, final snapshot/event, and delayed cleanup.
- Migration: route scheduler and turn-path completion through one authoritative transition; current fields/endpoints are approximations, not canonical authority.
- Follow-up: implemented by REVAMP-019/020.

### RULE-012 — Typed optional action

- Status: `APPROVED` and implemented on the authoritative turn path.
- Current behavior: authoritative purchase/jail choices use one typed JSON value; the incompatible colon-delimited helper was removed, and body identity cannot override session/path identity.
- Target decision: one server-created typed option bound to game, active actor, turn/version, action type, allowed choices, typed arguments, and declinability. A choice never supplies authoritative identity/state.
- Rationale: required by the command boundary, security model, and state-version ADRs.
- Tests: stale/mismatched actor/type/version, duplicate choice, decline policy, atomic clear-and-transition.
- Migration: read legacy shapes only during a bounded migration; write one new representation and reject mismatched IDs.
- Follow-up: implemented by REVAMP-018/019; obsolete helper removal completed in REVAMP-025.

### RULE-013 — Free Parking and unsupported classic mechanics

- Status: `APPROVED` as `NOT_IMPLEMENTED / OUT_OF_SCOPE` for this revamp stage.
- Current behavior: Free Parking is informational; auctions, mortgages, houses/hotels, and trading are absent.
- Target decision: do not invent these mechanics during repair work.
- Follow-up: separate future backlog approval if desired.
