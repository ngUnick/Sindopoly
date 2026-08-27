# REVAMP-025 cleanup decisions

Date: 2026-08-27
Status: locally accepted; commit and CI pending

## Decision rule

Items were removed only when repository-wide source, wiring, route, and test
search proved that no supported production path depended on them and the
authoritative replacement was already covered by regression tests. Audit
documents that record the pre-revamp state remain historical evidence; they
were not rewritten to pretend the obsolete path never existed.

## Inventory and disposition

| Candidate | Classification | Evidence | Disposition and replacement coverage |
| --- | --- | --- | --- |
| `TurnService` | Deprecated and production-unwired | No Spring stereotype, `@Bean`, reflection lookup, production constructor call, controller, scheduler, listener, or command-path caller; only `TurnServiceCharacterizationTest` instantiated it. `TurnController` delegates to `TurnCommandService`. | Removed. Authoritative roll/action/pass coverage remains in `TurnCommandServiceTest`, `TurnCommandGameplayRuleTest`, controller characterization, integration, WebSocket, and E2E tiers. |
| `TurnServiceCharacterizationTest` | Obsolete subject-specific characterization | Its three tests exercised only the removed service: legacy direct writes, wrong-player rejection, and legacy action event publication. | Removed with its subject. Authorization and canonical transition behavior remain covered by current controller/security/transition tests. |
| `BankruptcyService` | Production-unwired legacy collaborator | Its only repository callers were `TurnService` and that service's characterization test. No live bean consumed it. | Removed. Canonical bankruptcy/end-game decisions remain in the authoritative transition path and its gameplay/integration tests. |
| Legacy `GameStateService` mutation/orchestration methods | Duplicate infrastructure | Repository-wide call-site search found no live caller after removal of `TurnService`; create/join/start/leave/end and turn mutations are owned by command services plus `RedisGameTransitionStore`. | Removed. `GameStateService` now contains only discovery/authorization reads used by live callers. No Redis key, type, field, serializer, or TTL changed. |
| Legacy `PlayerStateService` mutation helpers | Duplicate infrastructure | Repository-wide call-site search found only `getPlayerState` consumers; initialize, AFK, full-map save, and jail-payment methods had no production or test caller. Player writes are owned by `RedisGameTransitionStore`. | Removed. `PlayerStateService` now exposes only the live read projection. |
| `SquareActionService` and `CardService` | Test-oriented but still valuable | No authoritative command-path caller, but deterministic `SquareActionServiceRuleTest` still exercises isolated rent, tax, card, property, and jail rules. | Retained. Removing useful rule coverage was not necessary for this cleanup. |
| `DiceService` and `MovementService` | Live/tested domain collaborators | Used by the authoritative transition path and deterministic rule tests. | Retained. |
| Commented `TurnController` handlers | Commented legacy implementation | No compiled mapping or caller; active mappings delegate to `TurnCommandService`. | Removed. Public active endpoints are unchanged. |
| Commented `Board.jsx` STOMP implementation | Obsolete duplicate implementation | `useGameRealtime` is the implemented authenticated STOMP-plus-snapshot recovery path. | Removed. Active WebSocket synchronization and bounded recovery polling remain unchanged. |
| `GamePlayAPI.buyProperty`, `payJailFine`, and commented turn wrappers | Stale frontend wrappers | No frontend caller; the buy/pay URLs have no backend mapping; active choices use `TurnAPI` authoritative commands. | Removed. REST routes were not changed. |
| `EndGame.jsx` call to `GamePlayAPI.endGame` | Broken stale consumer | `GamePlayAPI` exposes no `endGame`; client-triggered completion endpoint was removed in REVAMP-017; completion is server-owned. | Removed. End-game rendering/navigation remains. |
| Debug-only frontend `console.log` calls touched by this cleanup | Local diagnostic residue | Values were emitted only to the browser console and did not drive state. | Removed. Error reporting remains. |
| `.vscode/settings.json` | Machine-local editor configuration | Tracked root-only SQLTools/editor settings; no build/runtime reference. | Removed and ignored specifically through root `.gitignore`; future shared `.vscode` tasks, launch profiles, or extension recommendations remain eligible for version control. |
| `hs_err_pid*.log`, `replay_pid*.log` | JVM crash/runtime artifacts | Generated diagnostic files, no source/history reference that makes them build inputs. | Removed and ignored. Historical audit references remain. |
| `dump.rdb` | Local Redis persistence artifact | Small root-local Redis dump; Compose/runtime does not consume the repository file. | Removed and ignored. No live Redis data or schema was migrated. |
| `pom.xml.versionsBackup` | Generated Maven plugin backup | Stale generated copy with no build reference. | Removed and ignored with `*.versionsBackup`. |
| Polling/recovery fallbacks, migration scripts, historical audit snapshots | Supported or evidentiary | Live synchronization/clean-checkout contracts and migration ownership documents require them. | Retained. |

## Contract implications

- Production behavior: removal of a broken end-game client call and unused
  exports/debug output only; supported game commands and UI flow are unchanged.
- Security: no authentication, authorization, subscription guard, validation,
  idempotency, or audit safeguard was removed. Eliminating public raw mutation
  helpers reduces the chance of future bypasses.
- Performance: no performance claim. Active polling cadence, Redis round trips,
  WebSocket payloads, and database access are unchanged.
- Redis: no key/schema/serializer/TTL migration. Only a repository-local
  `dump.rdb` artifact and unreachable legacy mutation code were removed.
- MariaDB: no schema, migration, entity, repository, or seed change.
- REST/WebSocket: no supported route, destination, envelope, authorization, or
  recovery behavior changed. Only nonexistent/unreferenced wrappers and a
  commented duplicate STOMP block were removed.

## Verification expectation

The acceptance gate is repository-wide call-site/wiring search, backend fast
tests, Docker-backed integration tests, frontend tests/build, Compose
validation, and final diff/whitespace review. The fast test count intentionally
drops by three because the deleted tests' sole subject no longer exists.
