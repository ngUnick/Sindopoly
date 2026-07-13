# Build and run baseline

## Requirements inferred from repository

| Requirement | Current evidence |
| --- | --- |
| JDK | Maven build compiled with `javac [release 17]`; local installed Java is `21.0.11`. Evidence: `Sindopoly-Java/pom.xml`, `mvn -version`, `mvn clean verify` output. |
| Maven | `Sindopoly-Java/mvnw.cmd` exists; local Maven `3.9.16` also exists. |
| Node.js | Local `node -v` returned `v26.2.0`. No `engines` field in `sindopoly-front/package.json`. |
| npm | `npm.cmd -v` returned `11.13.0`. No `engines` field in `sindopoly-front/package.json`. |
| Docker | `docker --version` returned `Docker version 29.4.3, build 055a478`. |
| Docker Compose | `docker compose config` succeeded and normalized the compose file. |
| Redis | `docker-compose.yml` uses `redis:7.0-alpine`, port `6379:6379`. |
| MariaDB | `docker-compose.yml` uses `mariadb:10.11`, port `3306:3306`. |

## Environment variables and ports

| Component | Variables / ports | Evidence |
| --- | --- | --- |
| Backend datasource | `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, `SPRING_DATASOURCE_PASSWORD`; defaults in `application.properties` point to `jdbc:mariadb://mariadb:3306/sindopoly`, `nick`, `nick123`. | `docker-compose.yml`; `Sindopoly-Java/src/main/resources/application.properties` |
| Backend Redis | Compose sets `SPRING_DATA_REDIS_HOST=redis`, `SPRING_DATA_REDIS_PORT=6379`; properties use placeholders `${SPRING_REDIS_HOST:127.0.0.1}` and `${SPRING_REDIS_PORT:6379}`. | Same files |
| Backend profile | Compose sets `SPRING_PROFILES_ACTIVE=docker`; properties set `spring.profiles.active=@activatedProperties@`. | Same files |
| Backend HTTP | `8080:8080`. | `docker-compose.yml` |
| Frontend HTTP | `80:80` through nginx. | `docker-compose.yml`; `sindopoly-front/Dockerfile` |
| Frontend API base | Hard-coded `http://localhost:8080`. | `sindopoly-front/src/apis/apiConfig.jsx`; direct calls in `GameAPI.jsx`, `Lobby.jsx`, `Login.jsx` |

## Commands executed

| Working directory | Command | Result | Relevant output / interpretation |
| --- | --- | --- | --- |
| repo root | `git status --short` | PASS | Clean before audit. |
| repo root | `rg --files` | PASS | Enumerated source tree. |
| `Sindopoly-Java` | `.\mvnw.cmd -version` | FAIL, environment | Wrapper could not create `C:\Users\USER\.m2\wrapper\dists`: access denied in sandbox. |
| `sindopoly-front` | `node -v` | PASS | `v26.2.0`. |
| `sindopoly-front` | `npm -v` | FAIL, Windows PowerShell policy | `npm.ps1` blocked because scripts are disabled. Use `npm.cmd`. |
| `sindopoly-front` | `npm.cmd -v` | PASS | `11.13.0`. |
| repo root | `docker compose config` | PASS with warnings | Compose normalized; warnings: Docker config file access denied at `C:\Users\USER\.docker\config.json`. |
| `Sindopoly-Java` | `mvn -version` | PASS | Maven `3.9.16`; Java `21.0.11`; Windows 11. |
| `Sindopoly-Java` | `mvn clean verify` | FAIL in sandbox | Could not resolve Spring Boot parent because network was denied: `Permission denied: getsockopt`. |
| `Sindopoly-Java` | `mvn clean verify` | PASS when dependency downloads allowed | Compiled 43 source files, no test sources, built `monopoly-backend-1.0.0.jar`. |
| `sindopoly-front` | `npm.cmd run build` before install | FAIL, environment/setup | `vite` not recognized because `node_modules` was absent. |
| `sindopoly-front` | `npm.cmd test` | FAIL, project baseline | Missing `test` script. npm also could not write log file under `C:\Users\USER\AppData\Local\npm-cache\_logs`. |
| `sindopoly-front` | `npm.cmd ci` | PASS | Installed 456 packages; npm reported 21 vulnerabilities: 1 low, 10 moderate, 10 high. |
| `sindopoly-front` | `npm.cmd run lint` | FAIL, project baseline | 40 problems: 34 errors, 6 warnings. Examples: `cardMessage` undefined in `Board.jsx`, unused vars, prop-types. |
| `sindopoly-front` | `npm.cmd run build` in sandbox after install | FAIL, environment | esbuild access denied reading parent directory and crashed. |
| `sindopoly-front` | `npm.cmd run build` outside sandbox | PASS with warnings | Built 2844 modules. Warnings: outdated Browserslist, Rollup comment warning, chunk larger than 500 kB; JS bundle `1,522.72 kB`, gzip `455.23 kB`. |
| repo root | `docker --version` | PASS with warning | Docker version printed; Docker config access warning. |
| repo root | `git status --short` after build commands | PASS | Still clean before audit docs were added. |

## Startup order

Docker Compose order is explicit:

1. MariaDB healthcheck.
2. Redis healthcheck.
3. Backend depends on healthy MariaDB and Redis.
4. Frontend depends on backend service start.

Evidence: `docker-compose.yml`.

`docker compose up` was not run because it would create/start containers and may mutate runtime state/volumes. This audit used `docker compose config` only.

## Windows / PowerShell notes

- Use `npm.cmd`, not `npm`, in PowerShell environments that block `npm.ps1`.
- Maven Wrapper needs write access to `C:\Users\USER\.m2\wrapper\dists`.
- Docker commands may warn if `C:\Users\USER\.docker\config.json` is inaccessible.
- Native backend startup likely requires MariaDB hostname handling: local `application.properties` points to Docker hostname `mariadb`, which works inside Compose but not necessarily from a native Windows process.

