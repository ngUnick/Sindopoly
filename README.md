# Sindopoly

Sindopoly is a real-time multiplayer, Monopoly-inspired game themed around the
International Hellenic University. The backend is authoritative: browser clients
submit authenticated intent while Spring Boot validates identity, membership,
host/turn/phase permissions, command replay, and state version before an atomic
Redis transition. MariaDB stores durable player/reference/statistics data, and
STOMP notifications prompt clients to recover the latest REST snapshot.

## Stack

- Spring Boot 3.3.5, Java 17 bytecode, Maven
- Redis 7 for transient authoritative game state and command replay records
- MariaDB 10.11 with Flyway-owned schema and reference data
- React 18 and Vite 5, served by Nginx in the Docker workflow
- SockJS/STOMP at `/ws`, with process-local Spring simple-broker delivery
- JUnit/Mockito plus Redis/MariaDB/Testcontainers HTTP/STOMP integration tests

## Start locally on Windows

The supported development path is Windows PowerShell with Docker Desktop. From
the repository root:

```powershell
Copy-Item .env.example .env
docker compose config
docker compose up --build
docker compose ps
```

Open `http://localhost`. The backend is exposed on `http://localhost:8080` and
OpenAPI UI is available in the development profile at
`http://localhost:8080/swagger-ui/index.html`.

Stop the stack with `docker compose down`. The Compose file is a development
topology. Its sample credentials and exposed database ports are not production
settings, and it currently declares no named MariaDB volume. See the
[Windows and Docker development guide](docs/getting-started/WINDOWS_DOCKER_DEVELOPMENT.md)
before relying on local data persistence.

## Verify changes

```powershell
Set-Location .\Sindopoly-Java
.\mvnw.cmd clean verify
.\mvnw.cmd verify -Pintegration-tests

Set-Location ..\sindopoly-front
npm.cmd ci
npm.cmd test
npm.cmd run build
```

Docker must be running for the integration tier. Frontend lint is not yet a
required gate because the repository retains known baseline lint debt; it must
not be represented as passing. See the exact
[local verification contract](docs/development/LOCAL_VERIFICATION.md).

## Architecture and contracts

- [Documentation index](docs/README.md)
- [Current architecture](docs/architecture/CURRENT_ARCHITECTURE.md)
- [Canonical game state machine](docs/game-rules/CANONICAL_GAME_STATE_MACHINE.md)
- [REST API contract](docs/api/REST_API.md)
- [Realtime synchronization](docs/architecture/REALTIME_SYNCHRONIZATION.md)
- [Redis schema](docs/audit/REDIS_SCHEMA_CURRENT.md)
- [MariaDB migration ownership](docs/architecture/DATABASE_MIGRATION_OWNERSHIP.md)
- [Deployment security](docs/security/DEPLOYMENT_SECURITY.md)
- [Operations runbook](docs/operations/RUNBOOK.md)
- [Current limitations](docs/operations/CURRENT_LIMITATIONS.md)

## Repository layout

| Path | Purpose |
| --- | --- |
| `Sindopoly-Java/` | Spring Boot backend, migrations, and backend tests |
| `sindopoly-front/` | React/Vite browser client and frontend tests |
| `docs/` | Current contracts, standards, decisions, and audit evidence |
| `.github/workflows/verification.yml` | Required CI verification |
| `docker-compose.yml` | Local Docker Desktop development stack |

Read repository instructions before non-trivial work. The controlled revamp
discipline is: understand, characterize, test, change, verify, and document.
`dev` is the integration branch; focused changes normally use a short-lived
`codex/...` branch. Never commit secrets or treat client game outcomes as
authoritative.
