# Windows and Docker readiness

## Confirmed Windows behavior

| Area | Status | Evidence |
| --- | --- | --- |
| PowerShell npm shim | Problem | `npm -v` failed because `npm.ps1` is blocked by execution policy. `npm.cmd -v` works. |
| Maven Wrapper | Needs writable home cache | `.\mvnw.cmd -version` failed in sandbox creating `C:\Users\USER\.m2\wrapper\dists`. Local `mvn -version` works. |
| Docker CLI | Installed | `docker --version` returned Docker 29.4.3. |
| Docker config access | Warning | Docker commands warn: `open C:\Users\USER\.docker\config.json: Access is denied`. |
| Frontend build sandbox | Environment-specific issue | `npm.cmd run build` crashed esbuild in sandbox but passed outside sandbox. |

## Docker Compose readiness

`docker compose config` passes and resolves:

- MariaDB `10.11`, exposed on `3306`.
- Redis `7.0-alpine`, exposed on `6379`.
- Backend on `8080`, depends on healthy MariaDB/Redis.
- Frontend nginx on `80`, depends on backend service started.

`docker compose up` was intentionally not run because it creates/starts containers and may mutate runtime state.

## Native Windows run caveats

- `application.properties` points the datasource to `mariadb`, a Compose service hostname. A backend run directly from Windows will not resolve that unless the host mapping exists or env var overrides are used.
- Redis property placeholders use `SPRING_REDIS_HOST`/`SPRING_REDIS_PORT`, while Compose sets `SPRING_DATA_REDIS_HOST`/`SPRING_DATA_REDIS_PORT`. Spring externalized configuration may still override `spring.data.redis.host`, but the placeholder names are inconsistent and should be verified in a runtime test.
- Frontend hard-codes `http://localhost:8080`, which works for browser-to-host backend during local dev, but can be wrong from inside nginx/container deployments unless proxied.

## Recommended future readiness tests

1. Document a native PowerShell startup path.
2. Document a Docker Desktop startup path.
3. Add a smoke test for `GET /api/game-state/public-lobby`.
4. Add a WebSocket handshake/subscription smoke test once frontend subscription is re-enabled.

