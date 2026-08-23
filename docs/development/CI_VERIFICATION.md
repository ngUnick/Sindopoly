# CI verification

The baseline workflow is [`.github/workflows/verification.yml`](../../.github/workflows/verification.yml).
It runs on pull requests and pushes to `dev` or `main`, with read-only
repository contents permission.

## Required jobs

| Job | GitHub command | Local equivalent | Scope |
| --- | --- | --- | --- |
| Backend fast verification | `mvn clean verify` | `Sindopoly-Java`; `mvn clean verify` | Compile, package, and the fast 27-test tier on Java 21. |
| Backend integration verification | `mvn verify -Pintegration-tests` | `Sindopoly-Java`; same command | Fast tier plus Testcontainers Redis/MariaDB and the three-test REST integration tier. |
| Frontend build verification | `npm ci`, `npm run build` | `sindopoly-front`; same commands | Clean lockfile installation and Vite production build on Node 20. |

The integration job deliberately uses no Actions service containers. Testcontainers
creates disposable `redis:7.0-alpine`, `mariadb:10.11`, and Ryuk resources with
dynamic ports, synthetic credentials, the current `MariaDB/init.sql`, and normal
test cleanup. It does not use developer or production Redis/MariaDB values.

## Failure policy and current exclusions

Every listed command is required: a backend fast/integration or frontend build
failure fails CI. The workflow has no `continue-on-error`, suppressed exit code,
or secret-based infrastructure configuration. Docker/Testcontainers failures are
CI failures until diagnosed; they are not skipped.

Frontend lint is intentionally not a baseline job because the documented
repository lint baseline has real failures. It is not hidden with a passing or
allowed-to-fail step; a future approved lint repair should add it as a required
command. The frontend has no test script, so CI does not invent one. Dedicated
WebSocket coverage remains REVAMP-022.

The Windows Docker Desktop 29.4.3 `-Dapi.version=1.44` Testcontainers discovery
workaround is local troubleshooting evidence only. Linux GitHub runners use the
normal integration command unless a workflow run establishes the same need.
