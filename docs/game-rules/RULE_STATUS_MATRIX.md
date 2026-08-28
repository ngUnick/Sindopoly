# Rule status matrix

This is a concise decision-status map for deterministic rule coverage. Canonical
state-machine context is in `CANONICAL_GAME_STATE_MACHINE.md`; stable approvals
and pending choices are in `RULE_DECISIONS.md`. It does not approve a target
rule merely because current tests characterize it.

| Rule/topic | Current behavior | Target status | Coverage added | Follow-up |
| --- | --- | --- | --- | --- |
| Dice generation | `DiceService` obtains two server-side values and returns their sum. | IMPLEMENTED (`RULE-001`) | Minimum, maximum, injected sequence. | None |
| Doubles | Only a total is represented; no doubles behavior. | IMPLEMENTED_NO_DOUBLES_GAMEPLAY (`RULE-003`) | Equal die values complete one ordinary roll and turn. | None |
| Movement | `(position + dice) % 40`; wrap is detected. | IMPLEMENTED (`RULE-002`) | Forward, wrap, exact landing, normalization. | None |
| Passing start | Passing or exact landing awards 200 in the atomic roll transition. | IMPLEMENTED (`RULE-004`) | Ordinary, passing, and exact-landing cases. | None |
| Rent | A positive amount transfers once from payer to owner; self-owned squares do nothing. | IMPLEMENTED (`RULE-006`) | Transfer, self-owner, replay, and atomic real-Redis coverage. | Calculation expansion only if rules expand |
| Tax | A positive cost is subtracted exactly once. | IMPLEMENTED (`RULE-007`) | Positive-cost subtraction and real-Redis coverage. | None |
| Cards | Money/transport data is retained and each game's used card cycles to its deck tail. | IMPLEMENTED (`RULE-008`) | Signed money, transport, Start crossing, cycling, isolation, replay, terminal cleanup. | None |
| Jail | Jail is visiting; Go To Jail is automatic; payment and three skipped turns use typed options. | IMPLEMENTED (`RULE-009`) | Visiting, Go To Jail, pay/same-turn roll, skip/decrement/release, timeout. | None |
| Turn order | Explicit join order is stored, frozen at start, and preserved across departures. | IMPLEMENTED (`RULE-010`) | First/wrap, unsorted IDs, validation, lobby kick, active/non-active leave. | Legacy migration policy is fail-closed |
| Property purchase | Only an affordable unowned property creates a typed, declinable purchase option. | IMPLEMENTED (`RULE-005`) | Affordable/unaffordable/owned, accept, decline, stale, replay. | None |
| End game | Time/cash completion, asset/cash/order winner selection, frozen terminal result, idempotent finalization, and delayed cleanup use one transition-safe path. | IMPLEMENTED (`RULE-011`) | Boundaries, tie-breaks, retries, concurrency, event/snapshot, and cleanup. | Redis-to-MariaDB crash window remains operationally documented |

`OUT_OF_SCOPE_FOR_THIS_REVAMP_STAGE`: doubles gameplay, mortgages,
houses/hotels, auctions, trading, and the full classic card set. Authentication,
Redis atomicity, timers, transport, and WebSocket delivery are separate
architecture concerns and are linked from the documentation index.
