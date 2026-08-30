# REVAMP-030 clean Windows and Docker Desktop verification

## Scope and conclusion

REVAMP-030 verified the Git-native clean checkout of local candidate
`5ea2b96e5f89010cb36bdf3f48b57ec11c596adf`, based on
`62068c293d2f326d1b7b2635ca261d8e42e9d0d0`. The candidate removes only the
four explicit Compose `container_name` declarations. All required startup,
infrastructure, browser, stop/restart, cleanup, and regression gates passed.

The supported application path remains:

```powershell
.\sindopoly.ps1 doctor
.\sindopoly.ps1 start
```

It required Windows, Git, and Docker Desktop. It did not require `.env`, host
Java, host Node/npm, manual database initialization, a Compose override, or a
container rename. Temporary host Node/npm and Playwright Core were used only by
an external acceptance harness and are not Sindopoly startup dependencies.

## Clean-checkout and startup evidence

| Gate | Result |
| --- | --- |
| Git materialization | PASS: separate Git-native checkout at the exact candidate commit; status remained clean. |
| Repository-local artifacts | PASS: `.env`, `target`, `node_modules`, launcher state, PID, log, package, and browser-harness files were absent. |
| `doctor` | PASS from the checkout and from another working directory. |
| First `start` | PASS in 29.46 seconds; MariaDB, Redis, backend, and frontend became ready. |
| Compose isolation | PASS: service containers used project-scoped names such as `sindopoly-revamp-030-clean-candidate-5ea2b96-mariadb-1`; no global `container_name` remained. |
| MariaDB | PASS against 10.11 with a new anonymous data volume; no `init.sql` bind was active. |
| Flyway | PASS: empty schema created history and applied immutable V1; restart validated V1 and reported no migration necessary. |
| Redis | PASS against Redis 7; health/readiness succeeded. |
| Backend | PASS on Temurin Java 17 with HTTP readiness. |
| Frontend | PASS: Docker build, nginx startup, and HTTP readiness. |
| Repeated start and logs | PASS: an already-ready start returned without recreation; log following could be interrupted without stopping the stack. |
| Backend fast regression | PASS: 102 tests, 0 failures, 0 errors, 0 skips; Maven build succeeded. |

Two differently named Compose renderings and a final post-restore rendering
produced distinct project identity with the same service definition. Fixed host
ports still mean two complete stacks cannot run concurrently without explicit
port overrides; project-scoped container naming prevents stopped or differently
named projects from colliding globally.

## Browser and game-flow evidence

A temporary harness outside both Git checkouts used Playwright Core 1.62.1 and
the installed Microsoft Edge executable. It launched two persistent contexts
with different temporary user-data directories and did not disable CORS, CSRF,
or browser security.

| Gate | Result |
| --- | --- |
| Context isolation | PASS: both contexts initially showed login; after host bootstrap the guest remained uninitialized. Player IDs and opaque `JSESSIONID` values were distinct; raw cookie values were not recorded. |
| Player bootstrap | PASS: `RevampHost` and `PlayerTwo` became separate authenticated players. |
| Public game | PASS: the host created game 1 and the guest joined through the normal UI. |
| Lobby convergence | PASS: the host observed `PlayerTwo` without reload and both clients showed the same two-member lobby. |
| Game start | PASS: both clients entered the same in-progress game at state version 2 with player 1 active. |
| Turn | PASS: the active host rolled a server-generated result, moved from 0 to 10, acknowledged the normal Jail-visiting result, and rotated the turn to player 2 at state version 3. |
| Board convergence | PASS: authenticated snapshots from both contexts matched in status, version, active player, positions, balances, and properties. |
| Reload/reconnect | PASS: guest reload retained the correct player and game and recovered state version 3. |
| Security sanity | PASS: no valid-flow CORS, CSRF, WebSocket/STOMP 403, 401/403, identity crossover, backend 5xx, request failure, or fatal page exception occurred. |

The unauthenticated startup probe produced the expected session `401` before
player bootstrap. The current relative Dice GLB load path also produced a
non-fatal JSON/parser console diagnostic when nginx returned the SPA document;
the authoritative roll, rendered result, state transition, convergence, and
reload gates still passed. No asset-path change was included in this
verification-only task.

## Stop, restart, and persistence observations

Routine `stop` returned zero, left all four containers present and exited, and
kept their IDs and MariaDB anonymous volume attached. `status` then returned
non-zero as required. Restart completed in 28.34 seconds and reused every
container and the same MariaDB volume. Flyway reported schema version 1 current.

The same Redis container retained the observed keys across stop/start:
`game:1`, `game:1:commands`, `game:1:players`, `player:1`, `player:2`, and
`stats:leaderboard`. This is an observation about that container restart, not a
general durability guarantee. Restarting the backend invalidated its in-memory
servlet session; the SPA correctly returned the old browser profile to login,
while frontend/backend readiness and Redis game state remained observable.

## Cleanup and compatibility

The clean project was stopped, then only its containers, network, and disposable
anonymous volumes were removed. The external harness, package files,
`node_modules`, and both browser profiles were deleted from the temporary
directory. No broad Docker prune ran.

Historical MariaDB and Redis were stopped and restored directly by ID. MariaDB
retained container `98a333e01eab325c0d4f736295fcc7f09b0f06b88d9e5568267546142b1e33b6`
and volume `8775946f247527dc30128485714be4370d4c5c853c46dec2da941e14912f5cbb`;
Redis retained container
`aecccd36dd37f1f6e8f482467bd85b344f72ffaa2069bf5602d4780bb8163011`.
Creation timestamps were unchanged and both services returned healthy. No
historical SQL, credentials, migration, container, or volume was replaced.

No Java, frontend, Redis schema, MariaDB schema, Flyway, REST, STOMP, gameplay,
security, performance, or CI contract changed. The 48-test integration tier was
not repeated because application source and schema were unchanged, a fresh real
stack and multiplayer browser flow passed, and the accepted integration tier was
already green. Separate frontend unit tests were not repeated because frontend
source/configuration was unchanged and the Docker build plus two-browser smoke
passed.
