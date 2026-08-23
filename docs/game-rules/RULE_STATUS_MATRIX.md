# Rule status matrix

This is a concise decision-status map for deterministic rule coverage. Canonical
state-machine context is in `CANONICAL_GAME_STATE_MACHINE.md`; stable approvals
and pending choices are in `RULE_DECISIONS.md`. It does not approve a target
rule merely because current tests characterize it.

| Rule/topic | Current behavior | Target status | Coverage added | Follow-up |
| --- | --- | --- | --- | --- |
| Dice generation | `DiceService` obtains two server-side values and returns their sum. | CONFIRMED_CURRENT_AND_TARGET (`RULE-001`) | Minimum, maximum, injected sequence. | REVAMP-019 |
| Doubles | Only a total is represented; no doubles behavior. | APPROVED_NO_DOUBLES_GAMEPLAY (`RULE-003`) | Add no-extra-roll/no-jail-interaction coverage. | REVAMP-019 |
| Movement | `(position + dice) % 40`; wrap is detected. | CONFIRMED_CURRENT_AND_TARGET (`RULE-002`) | Forward, wrap, exact landing, normalization. | REVAMP-019 |
| Passing start | Exact landing currently earns the same reward as passing. | APPROVED_CURRENT_AND_TARGET (`RULE-004`) | Add passing and exact-landing reward coverage. | REVAMP-019 |
| Rent | Current automatic effect debits payer and owner. | APPROVED_TARGET / CURRENT_DEFECT (`RULE-006`) | Replace current-effect characterization with transfer/self-owner coverage. | REVAMP-019 |
| Tax | Current sign handling increases money. | APPROVED_TARGET / CURRENT_DEFECT (`RULE-007`) | Replace current-effect characterization with positive-cost subtraction. | REVAMP-019 |
| Cards | Current card event drops amount; selection is Redis-backed. | APPROVED_TARGET / CURRENT_DEFECT (`RULE-008`) | Add effect-data, cycling, isolation, and cleanup coverage. | REVAMP-019/020 |
| Jail | Jail and Go To Jail share a contradictory offer/action. | APPROVED_TARGET / CURRENT_DEFECT (`RULE-009`) | Replace current behavior with visiting, Go To Jail, payment, and release coverage. | REVAMP-019/020 |
| Turn order | Rotation sorts IDs; a comment claims join order. | APPROVED_TARGET / CURRENT_DEFECT (`RULE-010`) | Add frozen-order and leave-preservation coverage. | REVAMP-018/019 |
| Property purchase | Affordable unowned property offers purchase; decline ends option. | APPROVED_TARGET (`RULE-005`) | Add decline, ownership, and stale-option coverage. | REVAMP-018/019 |
| End game | Timer/capital thresholds end game; winner uses total asset value. | APPROVED_TARGET (`RULE-011`) | Add completion, valuation, and tie-break coverage. | REVAMP-019/020 |

`OUT_OF_SCOPE_FOR_THIS_REVAMP_STAGE`: doubles gameplay, mortgages,
houses/hotels, auctions, trading, and the full classic card set. Authentication,
Redis atomicity, timers, transport, and WebSocket delivery remain separate
revamp concerns rather than board-rule decisions.
