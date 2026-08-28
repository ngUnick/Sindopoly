# Sindopoly local verification contract

This is the canonical local verification matrix for the revamp. It records the
current baseline without hiding failures and distinguishes current results from
the target gate. It does not add scripts, tests, CI, dependencies, or runtime
fixes.

## Status vocabulary

- `PASS`: command/check completed and met its current contract.
- `KNOWN_FAIL`: command ran and the project currently fails it.
- `NOT_AVAILABLE`: the repository has no such command/framework.
- `ENVIRONMENT_BLOCKED`: the check was prevented by local permissions, missing
  services, or unavailable tooling.
- `UNVERIFIED`: the command/behavior exists or is intended, but was not safely
  executed in the current baseline.

## Verification matrix

| ID / owner | Working directory and exact command/check | Prerequisites / purpose | Current baseline | Target gate | Backlog |
| --- | --- | --- | --- | --- | --- |
| V-01 Backend build / backend | `Sindopoly-Java`; `mvn clean verify` | System Maven and dependency access; compile/package backend | `PASS`. Maven 3.9.16/Java 21 compiled 43 sources with release 17 and built the JAR. Annotation-processing warning remains. | Build and package pass reproducibly on the supported Windows path. | REVAMP-007, REVAMP-030 |
| V-02 Backend wrapper / backend | `Sindopoly-Java`; `.\mvnw.cmd clean verify` | Writable Maven wrapper cache | `ENVIRONMENT_BLOCKED` in the audit environment: cannot create `C:\Users\USER\.m2\wrapper\dists`. | Wrapper or documented system-Maven fallback works on a clean Windows checkout. | REVAMP-006, REVAMP-030 |
| V-03 Backend fast tests / backend | `Sindopoly-Java`; `mvn test` | Unit and characterization test sources; no Docker requirement | `PASS` for REVAMP-026: 100 fast tests passed, including explicit production-profile, origin, CORS, cookie, header, and safe-error checks. | Required fast tests execute and pass without the container tier. | REVAMP-009, REVAMP-010, REVAMP-011, REVAMP-018, REVAMP-019, REVAMP-021, REVAMP-022, REVAMP-024, REVAMP-025, REVAMP-026 |
| V-18 Backend integration tests / backend | `Sindopoly-Java`; `mvn verify -Pintegration-tests` (PowerShell compatibility form: `.\mvnw.cmd --% -Dapi.version=1.44 verify -Pintegration-tests`) | Docker Desktop daemon/image access; isolated Testcontainers Redis and MariaDB | `PASS` for REVAMP-026 on the normal Windows host: 100 fast tests and 47 integration tests passed with zero failures, errors, or skips against Docker Engine 29.4.3, Redis 7, and MariaDB 10.11. The real disallowed-WebSocket-origin case received the expected HTTP 403 upgrade refusal. Codex's named-pipe failure was environment-blocked, not a project defect. | Failsafe executes all `*IT` tests, including empty Flyway V1, legacy baseline/repair/fail-closed/concurrency, Hibernate validation, real session/CSRF HTTP, SockJS-over-WebSocket STOMP, recovery, game flow, Redis versions, and MariaDB finalization. | REVAMP-011, REVAMP-018, REVAMP-019, REVAMP-021, REVAMP-022, REVAMP-024, REVAMP-025, REVAMP-026, REVAMP-030 |
| V-04 Frontend install / frontend | `sindopoly-front`; `npm.cmd ci` | Node/npm, writable npm cache and install tree | `ENVIRONMENT_BLOCKED` in Codex: npm reports the lockfile package but does not leave a usable `node_modules/.bin/vite` shim. This is not evidence that a clean GitHub runner cannot install. | Clean lockfile install succeeds without changing the lockfile. | REVAMP-007, REVAMP-030 |
| V-05 Frontend dev server / frontend | `sindopoly-front`; `npm.cmd run dev` | Successful dependency install | `UNVERIFIED`; script exists but was not started. | Dev server starts on the documented local address and reaches the selected backend configuration. | REVAMP-007, REVAMP-030 |
| V-06 Frontend build / frontend | `sindopoly-front`; `npm.cmd run build` | Successful dependency install | `PASS` for REVAMP-026 with the existing install: Vite built 2,984 modules with the environment-backed API origin; the known Browserslist, dependency annotation, and large-chunk warnings remain. The restricted-sandbox attempt was environment-blocked; the approved external retry passed. | Build exits successfully from a clean checkout with warnings reviewed. | REVAMP-007, REVAMP-019, REVAMP-021, REVAMP-025, REVAMP-026, REVAMP-030 |
| V-07 Frontend lint / frontend | `sindopoly-front`; `npm.cmd run lint` | Successful dependency install | `KNOWN_FAIL` baseline: earlier audit found 40 problems (34 errors, 6 warnings), including undefined `cardMessage`; this run could not invoke ESLint after install failure. | Lint exits zero with no unreviewed errors/warnings. | REVAMP-007 and later focused fixes |
| V-08 Frontend tests / frontend | `sindopoly-front`; `npm.cmd test` | Node.js built-in test runner | `PASS`: 7 realtime synchronization tests passed for REVAMP-021; CI runs the same command before the frontend build. | Required frontend synchronization tests execute without browser infrastructure. | REVAMP-007, REVAMP-009, REVAMP-021, REVAMP-022 |
| V-09 Compose validation / infrastructure | Repository root; `docker compose config` | Docker CLI/Compose, no daemon required | `PASS` for REVAMP-026; the development-only profiles, environment-backed local values, healthcheck, origins, and frontend build argument normalized successfully. Docker config access warnings were emitted. | Configuration validation passes on a clean Windows checkout without unexplained warnings. | REVAMP-006, REVAMP-007, REVAMP-026 |
| V-10 Docker services / infrastructure | Repository root; `docker compose ps` | Docker Desktop daemon | `ENVIRONMENT_BLOCKED`: Docker daemon pipe was unavailable. No containers were started or changed. | Declared services start with healthchecks and expected dependencies. | REVAMP-006, REVAMP-030 |
| V-11 Redis smoke / infrastructure | Read-only `Test-NetConnection 127.0.0.1 -Port 6379`; later `redis-cli ping` or application connectivity | Redis service available; no key mutation | `ENVIRONMENT_BLOCKED`: TCP check failed because no local Redis service was listening. | Redis is reachable on port 6379 and the application can connect without mutating game keys. | REVAMP-007, REVAMP-011, REVAMP-030 |
| V-12 MariaDB smoke / database | Read-only `Test-NetConnection 127.0.0.1 -Port 3306`; later read-only connection/schema check | MariaDB service available; initialized database | Local fixed-port smoke remains `ENVIRONMENT_BLOCKED` evidence from REVAMP-007; REVAMP-024 separately passed disposable MariaDB 10.11 Flyway migration and Hibernate-validation tests. | MariaDB accepts the documented local connection; Flyway history and schema initialize or upgrade cleanly without volume deletion. | REVAMP-007, REVAMP-011, REVAMP-024, REVAMP-030 |
| V-13 REST smoke / backend | `GET http://127.0.0.1:8080/api/game-state/public-lobby` via read-only HTTP client | Backend running; endpoint is read-only in the current audit | `ENVIRONMENT_BLOCKED`: connection actively refused; no backend was running. | Returns the documented successful read-only response without exposing unsafe internal state. | REVAMP-007, REVAMP-011, REVAMP-015, REVAMP-016 |
| V-14 WebSocket boundary / realtime | `Sindopoly-Java`; `mvn verify -Pintegration-tests` | Docker-backed application on a random TCP port; isolated Redis/MariaDB | `PASS` for REVAMP-022 through the real `/ws` SockJS WebSocket transport and STOMP broker: anonymous/unauthorized access was rejected; authorized delivery, revocation, replay/no-event behavior, reconnect, snapshot recovery, and terminal completion passed. | Anonymous CONNECT, authorized delivery, denied destinations/SEND, revocation, replay/no-event behavior, reconnect, snapshot recovery, and completion all pass repeatably. | REVAMP-007, REVAMP-021, REVAMP-022 |
| V-15 Dependency/security audit / security | `Sindopoly-Java`; Maven build/dependency output; `sindopoly-front`; `npm.cmd audit --audit-level=high` | Dependency metadata and network for npm advisory endpoint | Maven build has no security scanner. npm audit was `ENVIRONMENT_BLOCKED`: registry advisory endpoint failed; earlier audit recorded 21 npm vulnerabilities (1 low, 10 moderate, 10 high). | Available dependency checks run with network results recorded and findings triaged; no new scanner is implied. | REVAMP-007, REVAMP-008, REVAMP-026 |
| V-16 Secret/config baseline / security | Repository root; read-only `rg` review for credential/config patterns, excluding `.git`, `node_modules`, and `target` | Existing repository search tooling | `PASS` for REVAMP-026 as a lightweight check: the former credential literals are absent from runtime/test/Compose configuration; tracked private-key and common provider-token signatures were not found; local-only placeholders and historical audit evidence remain. This is not a dedicated secret scanner. | No real secrets committed; environment-specific values and exposure are reviewed by the security process. | REVAMP-007, REVAMP-026 |
| V-17 Build-size baseline / performance | `sindopoly-front`; existing `npm.cmd run build` output | Successful frontend install/build | `PASS` for REVAMP-019: Vite reported a JavaScript chunk of 1,524.89 kB (456.18 kB gzip), plus chunk/Browserslist/Rollup warnings. No runtime benchmark was run. | Later performance changes compare measured output and do not optimize without evidence. | REVAMP-007, REVAMP-027 |

## Current baseline interpretation

“Backend build passes” currently means compilation, packaging, and the 100-test
fast backend tier. The separate 47-test container-backed integration tier is
documented in `INTEGRATION_TESTING.md`; its last complete gate predates
REVAMP-026 and the current external rerun remains pending. It stays distinct
from ordinary fast verification. Likewise, the current frontend production-build pass does not
erase the install/lint/test limitations recorded above.

The Docker, Redis, MariaDB, REST, and WebSocket checks are intentionally
separate. A Compose configuration pass does not prove that the daemon, services,
database schema, application, endpoint, or authorized subscriptions work.

## Later-task exit criteria

- REVAMP-007 establishes this matrix and its explicit current/target distinction.
- REVAMP-008 should mirror stable local checks in CI; it must not conceal known
  failures.
- REVAMP-009/010/011/022 add characterization, domain, infrastructure, REST,
  WebSocket, and end-to-end coverage before risky behavior changes.
- REVAMP-015/016/017 change identity, authorization, and unsafe endpoint results;
  their security checks must remain explicit in this matrix or linked tests.
- REVAMP-021/022 define reproducible WebSocket authorization/recovery checks.
- REVAMP-024 covers database schema/initialization concerns.
- REVAMP-026 covers deployment security hardening.
- REVAMP-027 preserves and extends measured performance baselines.
- REVAMP-030 proves the clean Windows/Docker Desktop checkout path.

## Scripts decision

No verification script was added. The current contract can be expressed with
existing commands and explicit prerequisites; adding `verify-dev.ps1`,
`dev-up.ps1`, or `test-all.ps1` would belong to later approved work and would
currently risk hiding environment-blocked failures.
