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
| V-03 Backend fast tests / backend | `Sindopoly-Java`; `mvn test` | Unit and characterization test sources; no Docker requirement | `PASS`: fast unit/characterization tests execute. | Required fast tests execute and pass without the container tier. | REVAMP-009, REVAMP-010, REVAMP-011 |
| V-18 Backend integration tests / backend | `Sindopoly-Java`; `mvn verify -Pintegration-tests` (or verified compatibility form `mvn -Dapi.version=1.44 verify -Pintegration-tests`) | Docker Desktop daemon/image access; isolated Testcontainers Redis and MariaDB | `PASS` by external Windows/Docker verification: 27 fast tests and 3 integration tests passed with zero failures, errors, or skips. Docker Engine 29.4.3 required `-Dapi.version=1.44` for Testcontainers discovery on that machine; the Codex session remains unable to reproduce Docker startup. | Failsafe executes `*IT` tests against disposable Redis/MariaDB; no local services are used. | REVAMP-011, REVAMP-030 |
| V-04 Frontend install / frontend | `sindopoly-front`; `npm.cmd ci` | Node/npm, writable npm cache and install tree | `ENVIRONMENT_BLOCKED` in this run by EPERM access to npm cache/node_modules cleanup. Earlier audit run installed 456 packages. | Clean lockfile install succeeds without changing the lockfile. | REVAMP-007, REVAMP-030 |
| V-05 Frontend dev server / frontend | `sindopoly-front`; `npm.cmd run dev` | Successful dependency install | `UNVERIFIED`; script exists but was not started. | Dev server starts on the documented local address and reaches the selected backend configuration. | REVAMP-007, REVAMP-030 |
| V-06 Frontend build / frontend | `sindopoly-front`; `npm.cmd run build` | Successful dependency install | `ENVIRONMENT_BLOCKED` in this run because Vite was unavailable after the install failure. Earlier audit run passed outside the sandbox with warnings. | Build exits successfully from a clean checkout with warnings reviewed. | REVAMP-007, REVAMP-030 |
| V-07 Frontend lint / frontend | `sindopoly-front`; `npm.cmd run lint` | Successful dependency install | `KNOWN_FAIL` baseline: earlier audit found 40 problems (34 errors, 6 warnings), including undefined `cardMessage`; this run could not invoke ESLint after install failure. | Lint exits zero with no unreviewed errors/warnings. | REVAMP-007 and later focused fixes |
| V-08 Frontend tests / frontend | `sindopoly-front`; `npm.cmd test` | A test script/framework | `NOT_AVAILABLE`: `package.json` has no `test` script and no frontend test suite was found. | An approved frontend test command exists and required tests pass. | REVAMP-007, REVAMP-009, REVAMP-022 |
| V-09 Compose validation / infrastructure | Repository root; `docker compose config` | Docker CLI/Compose, no daemon required | `PASS`; configuration normalized. Docker config access warning was emitted. | Configuration validation passes on a clean Windows checkout without unexplained warnings. | REVAMP-006, REVAMP-007 |
| V-10 Docker services / infrastructure | Repository root; `docker compose ps` | Docker Desktop daemon | `ENVIRONMENT_BLOCKED`: Docker daemon pipe was unavailable. No containers were started or changed. | Declared services start with healthchecks and expected dependencies. | REVAMP-006, REVAMP-030 |
| V-11 Redis smoke / infrastructure | Read-only `Test-NetConnection 127.0.0.1 -Port 6379`; later `redis-cli ping` or application connectivity | Redis service available; no key mutation | `ENVIRONMENT_BLOCKED`: TCP check failed because no local Redis service was listening. | Redis is reachable on port 6379 and the application can connect without mutating game keys. | REVAMP-007, REVAMP-011, REVAMP-030 |
| V-12 MariaDB smoke / database | Read-only `Test-NetConnection 127.0.0.1 -Port 3306`; later read-only connection/schema check | MariaDB service available; initialized database | `ENVIRONMENT_BLOCKED`: TCP check failed because no local MariaDB service was listening. | MariaDB accepts the documented local connection and expected schema initializes cleanly. | REVAMP-007, REVAMP-011, REVAMP-024, REVAMP-030 |
| V-13 REST smoke / backend | `GET http://127.0.0.1:8080/api/game-state/public-lobby` via read-only HTTP client | Backend running; endpoint is read-only in the current audit | `ENVIRONMENT_BLOCKED`: connection actively refused; no backend was running. | Returns the documented successful read-only response without exposing unsafe internal state. | REVAMP-007, REVAMP-011, REVAMP-015, REVAMP-016 |
| V-14 WebSocket baseline / realtime | `/ws` STOMP/SockJS handshake/connect check | Backend running and a reproducible client/check | `UNVERIFIED`; no handshake was attempted because the backend was unavailable. Current broker is Spring in-memory STOMP; no authorization is implied by handshake success. | Handshake/connect and authorized subscription checks are separately reproducible; event recovery remains a later gate. | REVAMP-007, REVAMP-021, REVAMP-022 |
| V-15 Dependency/security audit / security | `Sindopoly-Java`; Maven build/dependency output; `sindopoly-front`; `npm.cmd audit --audit-level=high` | Dependency metadata and network for npm advisory endpoint | Maven build has no security scanner. npm audit was `ENVIRONMENT_BLOCKED`: registry advisory endpoint failed; earlier audit recorded 21 npm vulnerabilities (1 low, 10 moderate, 10 high). | Available dependency checks run with network results recorded and findings triaged; no new scanner is implied. | REVAMP-007, REVAMP-008, REVAMP-026 |
| V-16 Secret/config baseline / security | Repository root; read-only `rg` review for credential/config patterns, excluding `.git`, `node_modules`, and `target` | Existing repository search tooling | `PASS` as a lightweight check: obvious datasource/MariaDB credential patterns are present and documented as local-only; no `secret=` or `token=` matches were found. This is not a secret scanner. | No real secrets committed; environment-specific values and exposure are reviewed by the security process. | REVAMP-007, REVAMP-026 |
| V-17 Build-size baseline / performance | `sindopoly-front`; existing `npm.cmd run build` output | Successful frontend install/build | `PASS` as a preserved historical baseline: Vite reported a JavaScript chunk of about 1,522.72 kB (455.23 kB gzip), plus chunk/Browserslist/Rollup warnings. No runtime benchmark was run. | Later performance changes compare measured output and do not optimize without evidence. | REVAMP-007, REVAMP-027 |

## Current baseline interpretation

“Backend build passes” currently means compilation, packaging, and a successful
Maven lifecycle. It does **not** mean meaningful automated tests pass: zero
backend test sources currently execute. Likewise, a historical frontend build
pass does not erase the current install/lint/test limitations.

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
