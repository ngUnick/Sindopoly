# Operations runbook

## Supported profiles

| Profile | Purpose | DB/Redis and Flyway | Browser/security contract |
| --- | --- | --- | --- |
| `dev` (default) | Windows-native or Docker Desktop development | MariaDB/Redis localhost defaults or Compose overrides; Flyway then Hibernate validation. | Explicit localhost origins, non-Secure HttpOnly session cookie, local-only fallback credentials, SQL diagnostics. |
| `test` | Fast tests | H2 `create-drop`; Flyway disabled; Redis property points at localhost while tests use configured mock/embedded seams. Not migration evidence. | Explicit test origins; no production secrets; normal session/CSRF behavior where a web test loads it. |
| `integration` | Testcontainers verification | Dynamic synthetic Redis/MariaDB values; Flyway + Hibernate validation; scheduler disabled where tests control time. | Explicit localhost origins, opaque sessions/CSRF, no developer or production secrets. |
| `prod` | Deployment | DB and Redis endpoints/credentials required; Flyway then Hibernate validation; Redis TLS required. | Explicit HTTPS origins, Secure/HttpOnly cookie, SQL detail off, OpenAPI off by default; missing/unsafe values fail startup. |

`docker-compose.yml` explicitly selects `dev`; it is not a production manifest.

## Configuration

| Variable | Meaning |
| --- | --- |
| `SINDOPOLY_DB_URL`, `SINDOPOLY_DB_USERNAME`, `SINDOPOLY_DB_PASSWORD` | MariaDB JDBC connection. Required in production. |
| `SINDOPOLY_REDIS_HOST`, `SINDOPOLY_REDIS_PORT`, `SINDOPOLY_REDIS_PASSWORD` | Redis connection. Host/password required by production policy. |
| `SINDOPOLY_REDIS_SSL_ENABLED` | Must be true in production. |
| `SINDOPOLY_ALLOWED_ORIGINS` | Production credentialed CORS/WebSocket origins; explicit HTTPS only. |
| `SINDOPOLY_DEV_ALLOWED_ORIGINS` | Explicit local development origins. |
| `SINDOPOLY_SESSION_TIMEOUT` | Server session timeout; default `2h`. |
| `SINDOPOLY_SESSION_COOKIE_SAME_SITE` | Deployment-specific session SameSite policy. |
| `SINDOPOLY_FORWARD_HEADERS_STRATEGY` | Forwarded-header handling; default `NONE`. Configure only behind a trusted proxy. |
| `SINDOPOLY_OPENAPI_ENABLED` | OpenAPI exposure; production default is false. |
| `SINDOPOLY_GAME_TURN_TIMEOUT_SECONDS` | Authoritative turn timeout; default 60 seconds. |
| `SINDOPOLY_GAME_TERMINAL_RETENTION_SECONDS` | Completed-state/replay recovery window; default 300 seconds. |
| `VITE_API_BASE_URL` | Public frontend build-time REST/WebSocket origin; never a secret. |

Compose-only local overrides are documented in `.env.example`, including
development database credentials and frontend origin. Keep `.env` untracked:

| Compose override | Maps to |
| --- | --- |
| `SINDOPOLY_DEV_DB_ROOT_PASSWORD` | MariaDB container administration only. |
| `SINDOPOLY_DEV_DB_NAME` | MariaDB database and backend JDBC URL. |
| `SINDOPOLY_DEV_DB_USERNAME`, `SINDOPOLY_DEV_DB_PASSWORD` | MariaDB container user and backend credentials. |
| `SINDOPOLY_DEV_ALLOWED_ORIGINS` | Backend `SINDOPOLY_ALLOWED_ORIGINS` in the dev container. |
| `SINDOPOLY_DEV_API_BASE_URL` | Frontend `VITE_API_BASE_URL` build argument. |

## Development startup and health

```powershell
Copy-Item .env.example .env
docker compose config
docker compose up --build
docker compose ps
docker compose logs -f backend
```

Expected local ports: frontend `80`, backend `8080`, MariaDB `3306`, Redis
`6379`. MariaDB and Redis have Compose healthchecks; backend startup waits for
them. Validate the browser, `GET /api/game-state/public-lobby`, authenticated
session creation, and `/ws` using the documented API/realtime flow.

Stop with `docker compose down`. No named MariaDB volume is declared, so do not
assume container recreation preserves local data. Back up important developer
data before destructive Docker operations.

## Database migration

Flyway owns forward MariaDB evolution and stable Card/Square data. Hibernate
validates only. An empty database receives V1. A recognized unversioned legacy
database is locked, strictly validated, receives only approved compatibility
repairs, and is baselined at version 1. Unknown or ambiguous data fails startup.

Never edit an applied migration, mount `MariaDB/init.sql` as current schema,
delete Flyway history, or drop data to bypass a failure. Stop, capture the error
and schema state, back up data, then use a reviewed forward migration or restore.
See `../architecture/DATABASE_MIGRATION_OWNERSHIP.md`.

## Runtime recovery

- REST `401`: create/recover an authenticated player session; do not forge IDs.
- REST `403`: verify actor identity, membership, host role, or active-player
  authority; lifecycle/phase and stale-version conflicts use `409`.
- REST `409`: fetch the member snapshot and reconcile the command UUID/version.
- Missed/gapped STOMP event: fetch the authoritative snapshot; never reconstruct
  state from event history because none exists.
- MariaDB finalization failure: retain terminal Redis state and investigate;
  finalization is idempotent and retried before configured expiry.
- Redis loss: active games and command replay records are transient and are not
  reconstructable from STOMP or MariaDB statistics.
- Multi-instance realtime: unsupported with the current process-local broker;
  route consistently or adopt a separately approved shared-broker architecture.

## Fail-closed startup guide

| Failure | Operator action |
| --- | --- |
| Missing production datasource variable | Verify `SINDOPOLY_DB_URL`, username, and secret-store password; never select `dev` to bypass it. |
| Missing Redis host/password or disabled TLS | Verify private endpoint, credential injection, and `SINDOPOLY_REDIS_SSL_ENABLED=true`. |
| Invalid/empty production origins | Supply explicit comma-separated HTTPS origins without wildcard, path, credentials, or empty entries. |
| Unknown/ambiguous legacy schema | Stop, back up, compare with the migration ownership contract, and prepare a reviewed corrective migration/restore. Do not baseline it manually. |
| Flyway checksum/history/migration failure | Stop startup; preserve logs and database; restore or apply an approved forward migration. Never edit released V1/history. |
| Redis unavailable/auth/TLS failure | Verify the private endpoint, port, password, certificate path, and profile. Do not accept browser/event state as a replacement for Redis authority. |
| MariaDB unavailable/auth failure | Verify the JDBC URL, network, account, and migration privilege. MariaDB does not contain a substitute live game state. |
| Browser origin/WebSocket `403` | Verify the browser Origin is allowed, the HTTP session is valid, and the player remains a game member; these are separate checks. |
| Docker/Testcontainers discovery failure | Confirm Docker Desktop/image access; use the documented local API compatibility flag only when that exact negotiation issue is present. |

## Verification and evidence

Run the commands in `../development/LOCAL_VERIFICATION.md`; CI mirrors the three
required jobs in `../development/CI_VERIFICATION.md`. The integration tier owns
fresh/legacy MariaDB migration, real Redis, HTTP session/CSRF, REST lifecycle,
STOMP authorization/recovery, timeout, completion, and durable finalization.
Performance evidence and retained budgets are in
`../performance/PERFORMANCE_BASELINE.md`.

Do not log secrets, cookies, CSRF tokens, raw credentials, or complete private
game state. Production readiness additionally requires external TLS, secret
management, trusted proxy configuration, monitoring/backups, and the final
REVAMP-029/030 verification evidence.

Application rollback must preserve compatibility with the current Flyway
history and Redis formats. This documentation phase changes neither, so it has
no data rollback. For a future failed migration or deployment, stop writes,
preserve evidence and backups, restore a compatible image/config/database or
apply a reviewed forward migration, and retain the fail-closed security policy.
