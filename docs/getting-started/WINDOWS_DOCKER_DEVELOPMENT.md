# Windows and Docker Desktop development

Status: current development guidance based on the existing audit. This document
distinguishes observed behavior from unverified and target behavior. It does
not fix runtime, Docker, frontend, database, or configuration issues.

## Supported development model

The intended setup is Windows host → VS Code on Windows → Windows PowerShell →
Sindopoly source on the Windows filesystem → Docker Desktop for Redis, MariaDB,
and optionally the application containers.

WSL is not required by the repository's documented commands. Docker Desktop may
use WSL2 internally as its container backend; that does not require the
repository, VS Code, or the development shell to run inside WSL. A WSL-native
Sindopoly checkout/workflow is currently **UNVERIFIED** and is not the canonical
developer path.

## Prerequisites

| Tool | Evidence | Status |
| --- | --- | --- |
| Windows | Audit ran on Windows 11 | Verified in audit environment |
| JDK | Java 21.0.11 installed; Maven compiles with release 17 | Partially verified; minimum local JDK is not formally declared |
| Maven | System Maven 3.9.16 works; wrappers exist | Partially verified; wrapper cache permissions blocked the audited wrapper command |
| Node.js | v26.2.0 installed | Verified in audit environment; no `engines` field exists |
| npm | 11.13.0; PowerShell should use `npm.cmd` | Partially verified; `npm.ps1` was blocked by execution policy |
| Docker Desktop | Docker 29.4.3 detected | Partially verified; Docker config access warned |
| Docker Compose | `docker compose config` passed | Verified for parsing; containers were not started |
| Git / VS Code | Required by the intended workflow | Versions/installations unverified |
| Redis / MariaDB | Compose declares Redis 7.0-alpine and MariaDB 10.11 | Verified as declared dependencies |

## Relevant layout

- Backend: `Sindopoly-Java/` (Spring Boot/Maven).
- Frontend: `sindopoly-front/` (React/Vite).
- Orchestration: root `docker-compose.yml`.
- Container builds: `Sindopoly-Java/Dockerfile` and `sindopoly-front/Dockerfile`.
- MariaDB migrations: `Sindopoly-Java/src/main/resources/db/migration/`.
- Backend configuration: `Sindopoly-Java/src/main/resources/application.properties`.
- Maven wrappers: root and `Sindopoly-Java/` (`mvnw`, `mvnw.cmd`).
- No `.env.example`, `scripts/dev-up.ps1`, or `scripts/verify-dev.ps1` exists today.

## Current startup workflow

From the repository root, `docker compose config` is **VERIFIED**: the audit
normalized the Compose file successfully. `docker compose up --build` is
**UNVERIFIED** because the audit deliberately did not start containers or
create runtime state. `docker compose ps`, `docker compose logs -f backend`,
and `docker compose down` are also unverified in this audit.

The intended native backend command from `Sindopoly-Java` is `mvn clean verify`
or `mvn spring-boot:run`; build verification passed with system Maven after
dependency download permission, while native application startup is
**UNVERIFIED**. The preferred wrapper form `./mvnw.cmd clean verify` is
**KNOWN_BROKEN in the audited environment** because the wrapper could not create
`C:\Users\USER\.m2\wrapper\dists`; the wrapper itself exists.

The intended frontend commands from `sindopoly-front` are `npm.cmd ci`,
`npm.cmd run dev`, `npm.cmd run build`, `npm.cmd run lint`, and `npm.cmd test`.

| Command | Status | Evidence |
| --- | --- | --- |
| `npm.cmd ci` | `VERIFIED` | Installed 456 packages; npm reported 21 vulnerabilities (1 low, 10 moderate, 10 high). |
| `npm.cmd run dev` | `UNVERIFIED` | Script exists; Vite server was not run. |
| `npm.cmd run build` | `PARTIALLY_VERIFIED` | Passed outside the restricted sandbox after install, with warnings; sandbox execution failed on esbuild permissions. |
| `npm.cmd run lint` | `KNOWN_BROKEN` | 40 problems, including undefined `cardMessage` in `Board.jsx`. |
| `npm.cmd test` | `VERIFIED` | REVAMP-021 adds a Node-based synchronization test script; 7 tests pass locally and in CI. |

Do not present any unverified command as a clean startup guarantee.

## Docker Desktop behavior

| Service/container | Image/build | Host port | Role |
| --- | --- | --- | --- |
| `mariadb` / `sindopoly-mariadb` | `mariadb:10.11` | 3306 | Persistent players, cards, squares, stats |
| `redis` / `sindopoly-redis` | `redis:7.0-alpine` | 6379 | Active game state, decks, leaderboard, optional dice entropy |
| `backend` / `sindopoly-backend` | `Sindopoly-Java/Dockerfile` | 8080 | Spring Boot REST/WebSocket backend |
| `frontend` / `sindopoly-frontend` | `sindopoly-front/Dockerfile` | 80 | Nginx-served React build |

MariaDB and Redis have healthchecks. The backend waits for both services to be
healthy; the frontend depends only on backend service start. Compose no longer
mounts `MariaDB/init.sql`: the backend runs Flyway V1 against an empty database
before Hibernate validation. No persistent named volumes are currently
declared, so `docker compose down` followed by container recreation is not a
durable-data guarantee; back up any important local database before recreating
the MariaDB container.

Compose sets `SPRING_PROFILES_ACTIVE=docker`, datasource variables, and
`SPRING_DATA_REDIS_HOST=redis` / `SPRING_DATA_REDIS_PORT=6379`. The backend and
frontend can be built as containers, but their full startup was not verified.
The frontend contains hard-coded `http://localhost:8080` calls, so browser/API
networking from the Nginx container is unverified. Redis and MariaDB are
published to the host for local use; they should not be exposed beyond the
development machine.

## Backend workflow and configuration

`application.properties` defaults MariaDB to `jdbc:mariadb://mariadb:3306/sindopoly`
with local sample credentials and Redis to `127.0.0.1:6379` through
`SPRING_REDIS_HOST`/`SPRING_REDIS_PORT` placeholders. Compose instead provides
`SPRING_DATA_REDIS_HOST`/`SPRING_DATA_REDIS_PORT`; this naming mismatch requires
runtime verification. A native Windows backend also cannot necessarily resolve
the Docker hostname `mariadb` without an override or host mapping.

The Docker profile is `docker`. The HTTP port is 8080; STOMP/WebSocket is
configured at `/ws`, but active frontend subscription and realtime delivery are
not currently verified. The server broker is Spring's in-memory broker.

## Redis and MariaDB

Redis holds transient authoritative active-game state: game hashes and player
membership, player position/money/jail/properties, decks, leaderboard cache, and
optional dice entropy. MariaDB holds persistent players, squares, cards, and
aggregated stats. Stats are finalized from Redis into MariaDB at game end/leave;
there is no verified cross-resource transaction.

Compose is the expected way to start both services. On a fresh database, backend
startup applies Flyway V1, installs the Stats trigger and Card/Square reference
data, and then Hibernate validates the mappings. Fresh migration is verified by
MariaDB 10.11 Testcontainers coverage; no demo Players are required.

On the first startup against a pre-Flyway database, the temporary legacy bridge
recognizes the historical schema, performs only approved Stats,
`game_finalization`, and Pay-20 repairs, preserves existing Players/Stats, and
baselines Flyway at V1. Later starts use Flyway alone. Unknown or ambiguous
legacy data fails startup rather than being silently blessed. Do not delete the
database merely to obtain Flyway history; diagnose the fail-closed message and
follow `docs/architecture/DATABASE_MIGRATION_OWNERSHIP.md`.

Mixed native-backend/Docker-infrastructure mode remains sensitive to the
MariaDB hostname and Redis variable issues documented above.

## Environment variables and secrets

Compose currently declares `SPRING_PROFILES_ACTIVE`,
`SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`,
`SPRING_DATASOURCE_PASSWORD`, `SPRING_DATA_REDIS_HOST`, and
`SPRING_DATA_REDIS_PORT`. Developers provide them through Compose or explicit
Windows environment overrides; no example environment file or secret-provider
workflow exists.

Never commit real credentials, tokens, or personal environment files. Compose
credentials are local sample values, not production credentials. Do not expose
Redis/MariaDB beyond the local machine without a separate security decision.
Production datasource, Redis, CORS, and WebSocket-origin settings must remain
environment-specific and outside source control.

## Known current blockers

These prevent claiming a clean `clone → configure → start → verify` workflow:

1. Full `docker compose up` has not been verified (REVAMP-007, REVAMP-030).
2. Maven Wrapper cache permissions failed in the audit (REVAMP-007, REVAMP-030).
3. Native datasource hostname and Redis variable names are inconsistent (REVAMP-007).
4. Frontend lint fails with 40 baseline problems (REVAMP-007).
5. Narrow frontend synchronization tests exist; browser-backed WebSocket and
   critical game-flow E2E coverage remain REVAMP-022.
6. Frontend localhost API calls versus container networking are unverified
   (REVAMP-007, REVAMP-021, REVAMP-028).
7. Compose does not yet declare a durable MariaDB named volume; preserve or back
   up local data before container recreation (REVAMP-030 operations verification).
8. Local and CI verification contracts exist; clean-checkout verification remains
   REVAMP-030.

REVAMP-006 documents these blockers; it does not fix them.

## Target developer experience

The following is aspirational and **not currently verified**:

`git clone <repository>` → `cd Sindopoly` → configure documented environment →
`.\scripts\dev-up.ps1` → `.\scripts\verify-dev.ps1`.

Those scripts do not exist today. The eventual workflow should report service
health, backend/frontend reachability, a safe read-only API smoke check, and
applicable build/test/lint results while keeping VS Code, PowerShell, and the
repository on Windows. Docker Desktop may use WSL2 internally, but WSL should
not be a developer prerequisite.

The next execution item is REVAMP-007: turn these classifications into a
repeatable local verification contract. Runtime fixes, tests, CI, and
configuration changes belong to their later backlog items.
