# CI verification

The baseline workflow is [`.github/workflows/verification.yml`](../../.github/workflows/verification.yml).
It runs on pull requests and pushes to `dev` or `main`, with read-only
repository contents permission.

## Required jobs

| Job | GitHub command | Local equivalent | Scope |
| --- | --- | --- | --- |
| Backend fast verification | `mvn clean verify` | `Sindopoly-Java`; `.\mvnw.cmd clean verify` | Compile, package, and the current fast tier on Java 21. |
| Backend integration verification | `mvn verify -Pintegration-tests` | `Sindopoly-Java`; `.\mvnw.cmd verify -Pintegration-tests` | Fast tier plus every Testcontainers Redis/MariaDB `*IT`: migration, HTTP/session/CSRF, command/version, STOMP/recovery, game flow, completion, and performance-regression evidence. |
| Frontend build verification | `npm ci`, `npm test`, `npm run build` | `sindopoly-front`; same commands | Clean lockfile installation, the current Node realtime tests, and the Vite production build on Node 20. |

The integration job deliberately uses no Actions service containers. Testcontainers
creates disposable `redis:7.0-alpine`, `mariadb:10.11`, and Ryuk resources with
dynamic ports, synthetic credentials, Flyway V1 or the explicitly historical
legacy fixture as appropriate, and normal test cleanup. It does not use
developer or production Redis/MariaDB values.

## Failure policy and current exclusions

Every listed command is required: a backend fast/integration or frontend build
failure fails CI. The workflow has no `continue-on-error`, suppressed exit code,
or secret-based infrastructure configuration. Docker/Testcontainers failures are
CI failures until diagnosed; they are not skipped.

Frontend lint is intentionally not a baseline job because the documented
repository lint baseline has real failures. It is not hidden with a passing or
allowed-to-fail step; a future approved lint repair should add it as a required
command. The existing backend-integration job automatically enforces the
REVAMP-022 real HTTP/STOMP flow and REVAMP-024 migration matrix because Failsafe
selects every `*IT` test; no separate CI-only schema path is introduced.

The Windows Docker Desktop 29.4.3 `-Dapi.version=1.44` Testcontainers discovery
workaround is local troubleshooting evidence only. Linux GitHub runners use the
normal integration command unless a workflow run establishes the same need.

Accepted changes through REVAMP-027 have passed all three GitHub-hosted jobs.
Linux runners use the normal integration command without the Windows Docker API
override. Exact current counts live in `LOCAL_VERIFICATION.md`; new tests may
increase them without changing the job contract.
