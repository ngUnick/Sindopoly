# Windows and Docker Desktop development

This is the supported developer workflow: Windows checkout, VS Code on Windows,
Windows PowerShell, and Docker Desktop. Docker Desktop may use WSL2 internally;
WSL is not required and a WSL-native repository workflow is not canonical.

## Prerequisites

- Git and Windows PowerShell
- Docker Desktop with Linux containers and Compose v2
- For native backend work: a JDK capable of producing Java 17 bytecode
- For native frontend work: Node/npm; CI uses Node 20

The backend uses Spring Boot 3.3.5. CI runs Java 21 while the backend image builds
and runs with Java 17. The frontend uses React 18/Vite 5; its image builds with
Node 18. These current version differences are documented compatibility facts,
not proof that every future tool version is supported.

PowerShell may resolve `npm.ps1` through an execution policy, so repository
commands use `npm.cmd`. Maven wrappers exist at the root and backend; commands
below use the backend wrapper.

## Full Docker workflow

From the repository root:

```powershell
Copy-Item .env.example .env
docker compose config
docker compose up --build
docker compose ps
```

Open `http://localhost`. Backend REST/OpenAPI development endpoints are on
`http://localhost:8080`; SockJS/STOMP connects at `/ws`. Follow logs with:

```powershell
docker compose logs -f backend
```

Stop with `docker compose down`. MariaDB and Redis healthchecks gate backend
startup. The frontend waits for backend start, not full application health, so
use the logs and smoke checks rather than assuming dependency startup means the
whole application is ready.

| Service | Image/build | Host port | Purpose |
| --- | --- | --- | --- |
| `frontend` | local Node/Nginx build | 80 | Browser client |
| `backend` | local Maven/Java build | 8080 | REST and `/ws` |
| `mariadb` | `mariadb:10.11` | 3306 | Durable/reference data |
| `redis` | `redis:7.0-alpine` | 6379 | Transient authoritative game state |

This is a development topology. Database ports and sample credentials must not
be exposed as production defaults. No named MariaDB volume is declared; back up
important local data before container recreation. `MariaDB/init.sql` is
historical and is not mounted—Flyway V1 owns fresh schema/reference data.

## Native application with Docker infrastructure

Start dependencies:

```powershell
docker compose up -d mariadb redis
Set-Location .\Sindopoly-Java
.\mvnw.cmd spring-boot:run
```

In a second terminal:

```powershell
Set-Location .\sindopoly-front
npm.cmd ci
npm.cmd run dev
```

The default `dev` profile targets Redis/MariaDB on localhost. Compose supplies
the equivalent service hostnames to the backend container. The frontend public
build-time origin is `VITE_API_BASE_URL`, defaulting locally to
`http://localhost:8080`; never place secrets in it.

## Verification

```powershell
Set-Location .\Sindopoly-Java
.\mvnw.cmd clean verify
.\mvnw.cmd verify -Pintegration-tests

Set-Location ..\sindopoly-front
npm.cmd ci
npm.cmd test
npm.cmd run build
```

The container-backed command requires Docker; current tier counts live in
`../development/LOCAL_VERIFICATION.md`. On Docker Desktop 29.4.3, the verified
compatibility form when Testcontainers API negotiation fails is:

```powershell
.\mvnw.cmd "-Dapi.version=1.44" verify -Pintegration-tests
```

This workaround is diagnostic, not a production setting. Frontend lint retains
known baseline failures and is not a required passing gate. See
`../development/LOCAL_VERIFICATION.md`
for authoritative result classifications and `../development/INTEGRATION_TESTING.md`
for test isolation.

## Configuration and troubleshooting

Copy `.env.example` only for local overrides; `.env` is ignored. Canonical
database, Redis, origin, session, timeout, terminal-retention, forwarded-header,
and OpenAPI variables are listed in `../operations/RUNBOOK.md`. Production has
no credential/origin fallback and requires Redis TLS plus HTTPS browser origins.

- Wrapper/cache permission failure: confirm the user Maven cache is writable;
  do not alter repository files or disable verification to bypass it.
- Docker unavailable: start Docker Desktop and confirm `docker info`; classify
  the integration result as environment-blocked rather than a product defect.
- Database startup failure: read backend/Flyway diagnostics. Do not delete data
  or migration history to make startup pass.
- `401`/`403` in a smoke call: use an authenticated session, CSRF for unsafe
  calls, server-derived identity, and the required command/version headers.
- Realtime gap/reconnect: fetch the authoritative member snapshot; notifications
  are not durable state.

The complete operational constraints are in `../operations/CURRENT_LIMITATIONS.md`.
Clean-checkout proof remains REVAMP-030 after the full REVAMP-029 regression.
