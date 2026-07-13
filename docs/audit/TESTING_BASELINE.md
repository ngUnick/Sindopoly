# Testing baseline

## Inventory

| Test type | Current status | Evidence |
| --- | --- | --- |
| Backend unit tests | Untested | `mvn clean verify` reported `No sources to compile` for test compilation. |
| Backend integration tests | Untested | No `src/test/java` files in `rg --files`; Testcontainers dependencies exist in `pom.xml` but no tests use them. |
| Controller tests | Untested | No test classes found. |
| Redis tests | Untested | Embedded Redis/Testcontainers dependencies exist but no test sources. |
| MariaDB tests | Untested | Testcontainers MariaDB dependency exists but no test sources. |
| WebSocket tests | Untested | No STOMP/WebSocket tests found. |
| Frontend tests | Untested | `npm.cmd test` failed: missing script. |
| End-to-end tests | Untested | No Playwright/Cypress/etc. found in `package.json` or files. |

## Critical flows coverage

| Flow | Coverage | Notes |
| --- | --- | --- |
| Player creation and nickname validation | Untested | `ValidationUtils#validateNickname`, `PlayerStateController#createPlayer`. |
| Lobby create/join/start/remove | Untested | Redis + MariaDB interactions require integration tests. |
| Duplicate join / max players | Untested | Checks split between controller and service. |
| Dice roll by active player | Untested | Core P1 flow. |
| Dice roll by non-active player | Untested | `ValidationUtils#ensurePlayerTurn`. |
| Duplicate/concurrent dice roll | Untested | No idempotency/locking tests. |
| Optional action apply/pass | Untested | Path/body mismatch risk untested. |
| Rent/tax/card/jail actions | Untested | Several likely logic mismatches. |
| Game end and stats finalization | Untested | Scheduler + service duplicate paths. |
| WebSocket delivery | Untested | Frontend subscription commented out. |
| Multi-instance behavior | Untested | No distributed locking/event-broker test. |
| Security/authorization | Untested | No auth currently enforced. |

## Current command results

- Backend `mvn clean verify`: PASS after dependency downloads allowed; no test sources.
- Frontend `npm.cmd run lint`: FAIL with 34 errors, 6 warnings.
- Frontend `npm.cmd run build`: PASS after `npm.cmd ci` and outside sandbox; warnings present.
- Frontend `npm.cmd test`: FAIL, missing script.

## Architecture testability issues

- Rule logic depends on Redis/MariaDB in `SquareActionService`, making pure unit tests difficult.
- Turn flow lacks explicit state machine object; behavior is implicit in Redis fields and service method ordering.
- No abstraction around clock/timeouts; scheduler tests would need controllable time.
- `TurnService` directly constructs `new MovementService()` instead of injecting it, reducing test substitution.

