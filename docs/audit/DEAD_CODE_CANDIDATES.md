# Dead, redundant, and unused code candidates

Do not delete based on this file alone. Spring, Jackson, JPA, and frontend routing can hide usage. Classifications are candidates with evidence.

| Candidate | Classification | Evidence | Notes |
| --- | --- | --- | --- |
| Commented old turn endpoint in `TurnController` | CONFIRMED_UNUSED | Entire `@PostMapping("/{gameId}/{playerId}")` block commented out. | Safe future cleanup after compatibility decision. |
| Commented duplicate `/action` handler in `TurnController` | CONFIRMED_UNUSED | Commented block under active `doAction`. | Obsolete implementation. |
| `TurnService#createResponse` | PROBABLY_UNUSED | No active references found except method definition; current `throwDice` returns DTO directly. | Verify with IDE call hierarchy before deletion. |
| `TurnService#storeOptionalAction` and inner `OptionalAction` | PROBABLY_UNUSED | Active `throwDice` writes optional JSON directly; method not referenced. | Related to older optional flow. |
| `GameStateService#setOptionalAction` colon-delimited optional format | PROBABLY_UNUSED / DUPLICATE_IMPLEMENTATION | Current `TurnService` stores JSON `SquareEventDto`; `assertOptionalAction` has both JSON and colon parsing variants. | Represents conflicting optional-action formats. |
| `GameStateService#getOwner` | PROBABLY_UNUSED | Private method not referenced in current file. | Owner currently inferred from `gameId`. |
| `PlayerStateController` imports `ActionRequestDto`, `ActionResultDto`, `lombok.val` | CONFIRMED_UNUSED | Lint/inspection by reading file; imports not used. | Java compiler may warn only if configured. |
| `GamePlayAPI.buyProperty` and `payJailFine` | DEPRECATED_BUT_ACTIVE frontend export / backend missing | Frontend exports wrappers; backend has no matching endpoints. | Could be stale API compatibility code. |
| Frontend STOMP subscription block in `Board.jsx` | DEPRECATED_BUT_ACTIVE? | Commented out, not active. | Important design clue, not active runtime. |
| `CorsConfig` and `WebSecurityConfig` both configure CORS | DUPLICATE_IMPLEMENTATION | Two CORS sources with different origins/scopes. | Not dead; redundant/conflicting. |
| `RandomOrgGenerator.web` field | PROBABLY_UNUSED | Constructed but not used in `RandomOrgGenerator`; refill job has its own `WebClient`. | Verify before cleanup. |
| `sendPlayerToJail`, `payJailFee`, `applyCardEvent` in `SquareActionService` | PROBABLY_UNUSED | No active references found in file search. | Could be intended helpers. |
| Root JVM crash logs and Redis dump | UNKNOWN / cleanup candidate | `hs_err_pid*.log`, `dump.rdb`, `replay_pid1674.log` at repo root. | Do not remove in audit; decide whether they are intentional diagnostics. |

