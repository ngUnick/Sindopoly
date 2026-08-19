# Rule status matrix

This is a concise decision-status map for deterministic rule coverage. It does
not approve target game rules where the evidence remains incomplete.

| Rule/topic | Current behavior | Target status | Coverage added | Follow-up |
| --- | --- | --- | --- | --- |
| Dice generation | `DiceService` obtains two die values from server-side `RandomIntGenerator` and returns their sum. | CONFIRMED_CURRENT_AND_TARGET | Minimum, maximum, and injected source sequence. | REVAMP-010; ADR 0001 |
| Doubles | Dice result is only a sum; individual dice/doubles are not represented. | TARGET_DECISION_PENDING | No turn-semantics assertion. | REVAMP-014, REVAMP-019 |
| Movement | `(position + dice) % 40`; passing start is `position + dice >= 40`. | CONFIRMED_CURRENT_AND_TARGET | Forward, wrap, exact landing, current normalization. | REVAMP-010 |
| Passing start | Exact landing on 0 currently counts as passing start; reward is applied elsewhere. | CURRENT_BEHAVIOR_ONLY | Exact-landing movement characterization. | REVAMP-014, REVAMP-019 |
| Rent | `rentDue` supplies a negative amount; current automatic application debits both payer and owner. | CURRENT_BEHAVIOR_ONLY | Deterministic current-effect characterization. | REVAMP-014, REVAMP-019 |
| Tax | Peek emits negative price amount; current automatic application subtracts that amount and increases money. | CURRENT_BEHAVIOR_ONLY | Static-square and automatic-effect characterization. | REVAMP-014, REVAMP-019 |
| Cards | Card square maps title/type, but current `SquareEventDto.card` carries amount `0`; card selection remains Redis-backed. | CURRENT_BEHAVIOR_ONLY | Static card metadata characterization. | REVAMP-014, REVAMP-019 |
| Jail | `JAIL` and `GOJAIL` both emit a fee-50 jail offer; optional payment sets position 10, jail true, jailTime 3. | TARGET_DECISION_PENDING | Current event/payment characterization. | REVAMP-014, REVAMP-019 |
| Turn order | Current rotation sorts player IDs rather than preserving a documented join order. | TARGET_DECISION_PENDING | Not covered here; turn orchestration remains outside pure-rule scope. | REVAMP-014, REVAMP-019 |
| Property purchase | Unowned affordable property produces a buy offer; ownership/rent lookup remains Redis-backed. | CURRENT_BEHAVIOR_ONLY | Static affordable-property characterization. | REVAMP-018, REVAMP-019 |

`NOT_IMPLEMENTED`: doubles turn behavior, mortgages, houses/hotels, auctions,
and trading. `OUT_OF_SCOPE`: authentication, Redis atomicity, timers, transport,
and WebSocket delivery.
