# REVAMP-029 full regression verification

## Scope and conclusion

REVAMP-029 verified the accepted checkout at
`0bfe5c366d3f5775cb1d466b231da44351875e5f`. Every required release gate
passed; frontend lint also ran and remains the documented non-gating known
failure. No production source, frontend behavior, test, dependency,
configuration, Docker, workflow, Redis schema, MariaDB schema, Flyway, REST,
STOMP, timer, polling, or game-rule change was made.

### Exact-HEAD nickname smoke follow-up

The first exact-HEAD browser check used a 29-hour-old `sindopoly-frontend:latest`
container. That pre-FE29 image still contained the retired ASCII-only login
sanitizer, so Greek characters were discarded by the served production bundle.
The FE29 source at `6756c1417bc484d62aed980e43691dbb34676d96` already used the
canonical Unicode policy and direct `onChange` value. Rebuilding and recreating
the canonical backend/frontend containers served the current Login chunk; live
production typing of `Νίκος` preserved every character, creation succeeded,
the current-player session returned `Νίκος`, Home displayed `Νίκος`, and the
lobby displayed `Νίκος`. A focused source contract test now guards the real
Login input path against reintroducing sanitization or ASCII filters.

REVAMP-030 separately owns proof from a clean Windows/Docker Desktop checkout.
This run used the existing accepted working checkout and caches.

## Environment

| Component | Verified value |
| --- | --- |
| Host | Windows 11, version 10.0, amd64 |
| Project Java | Eclipse Adoptium 21.0.11 through the Maven wrapper |
| Maven wrapper | Apache Maven 3.9.9 |
| Backend bytecode target | Java 17 |
| Node.js / npm | Node 26.2.0 / npm 11.13.0 |
| Docker | Client/Engine 29.4.3; Docker Desktop 4.73.1; `desktop-linux` context |
| Integration Redis | `redis:7.0-alpine` |
| Integration MariaDB | `mariadb:10.11` |

The shell-level `java` executable reported Java 8, but the checked-in wrapper
selected the configured Java 21 runtime and every backend gate compiled and ran
under Java 21. No tool or dependency version was changed.

## Automated regression matrix

| Gate | Command | Result |
| --- | --- | --- |
| Backend fast | `Sindopoly-Java`; `.\mvnw.cmd clean verify` | PASS: 102 tests, 0 failures, 0 errors, 0 skips; build success in 31.453 s. |
| Backend integration | `Sindopoly-Java`; `.\mvnw.cmd "-Dapi.version=1.44" verify -Pintegration-tests` | PASS: 48 integration tests, 0 failures, 0 errors, 0 skips; Redis 7/MariaDB 10.11; build success in 1:21. |
| Frontend synchronization | `sindopoly-front`; `npm.cmd test` | PASS: 7/7 in 169.6005 ms. |
| Frontend production build | `sindopoly-front`; `npm.cmd run build` | PASS: 2,985 modules in 34.03 s; JS 1,591.85 kB / 477.74 kB gzip. |
| Frontend lint | `sindopoly-front`; `npm.cmd run lint` | KNOWN_FAIL/non-release gate: 31 problems (25 errors, 6 warnings), improved from the 40-problem audit baseline. |
| Compose | repository root; `docker compose config --quiet` | PASS; the known Docker configuration-file permission warning remained non-blocking. |
| Documentation links | repository Markdown relative-link validator | PASS after this record: 59 files, 0 broken links, 0 case errors, 0 invalid anchors. |
| Git whitespace/scope | `git diff --check`, staged-scope and status inspection | PASS; documentation-only evidence/status changes. |

The frontend build first encountered the restricted Codex filesystem error from
esbuild while walking an inaccessible parent directory. The identical host-level
retry passed; this is environment-only evidence, not a product regression.

## Integration execution

| Class | Tests | Result |
| --- | ---: | --- |
| `FreshDatabaseMigrationIT` | 2 | PASS |
| `IntegrationInfrastructureIT` | 39 | PASS |
| `LegacyDatabaseMigrationIT` | 7 | PASS |

The integration suite used real disposable Redis and MariaDB containers. It
proved empty-schema V1 migration, repeat startup and Hibernate validation;
recognized legacy repair/baseline, already-managed behavior, concurrent
onboarding, and fail-closed ambiguous/unsafe cases; Redis state/membership,
replay, deck, player hashes, discovery, versioned Lua CAS, and capacity; real
HTTP session/CSRF/CORS/authorization; real SockJS/STOMP authentication,
subscription authorization/revocation, SEND rejection, notification and
snapshot recovery; canonical gameplay, timeouts, departure, completion, and
idempotent transactional finalization.

The SCAN characterization populated 512 canonical games plus malformed and
unrelated keys, traversed more than two cursor batches, returned the exact
canonical set, and observed no Redis `KEYS` command.

## Contract and security regression

- Authentication remains an opaque server session with server-derived player
  identity; CSRF protects mutations except identity bootstrap.
- Public lobby access, member snapshots, host actions, active-player/phase
  commands, non-member denial, and membership revocation remained covered.
- Notification envelopes remain typed and versioned. Only applied transitions
  publish; replay, stale, reuse, and no-op paths do not duplicate events.
- Command replay retains exact-fingerprint replay, collision/stale rejection,
  single version increments, 4,096-entry fail-closed capacity, and no eviction.
- Dice, movement, Start, property/rent/tax, supported cards, jail, turn order,
  timeout, departure, completion, winner/tie-break, cleanup, and recovery rules
  remained green without adding classic Monopoly behavior.
- Production guards still require database/Redis/origin security, Secure
  cookies, Redis TLS, explicit credentialed origins, generic errors, and
  production-disabled OpenAPI by default.
- Frontend source/build output contains no database/Redis credential, private
  key, authentication-token, or server-secret signature. `VITE_API_BASE_URL`
  remains public build configuration.

## Compatibility and schema conclusion

The current Redis contracts are unchanged:

- `game:{gameId}` HASH
- `game:{gameId}:players` SET
- `game:{gameId}:commands` HASH using current `resultJson`, readable legacy
  `result`, maximum 4,096 accepted IDs, no eviction, fail closed at capacity
- `game:{gameId}:deck` LIST
- `player:{playerId}` HASH
- auxiliary `stats:leaderboard` STRING and `dice:entropy` LIST

Discovery remains complete cursor SCAN with canonical ASCII positive-int key
parsing and no production Redis `KEYS`. MariaDB entities/repositories and the
single immutable Flyway V1 migration are unchanged. REST routes/DTOs/command
headers and `/ws` plus `/topic/game/{gameId}` STOMP contracts match the
canonical documentation. No migration or client compatibility action is
required for REVAMP-029.

## Manual gates and warnings

No additional manual API smoke or browser UI gate is required by the frozen
REVAMP-029 contract: the automated integration suite exercises the real HTTP and
SockJS/STOMP boundaries. Clean-machine browser/startup proof belongs to
REVAMP-030.

Pre-existing/non-blocking warnings: multiple SLF4J providers, ByteBuddy dynamic
agent loading, Spring Data repository assignment information, JPA open-in-view,
expected negative-path STOMP/uniqueness logs, Lettuce reconnects during
container teardown, outdated Browserslist data, the dependency annotation
warning, the Vite large-chunk warning, and the known non-gating frontend lint
findings. Environment-only warnings: restricted
esbuild parent-directory access and Docker configuration-file access. No warning
was classified as a regression.

## Residual limitations

The accepted limitations remain those in
[CURRENT_LIMITATIONS.md](../operations/CURRENT_LIMITATIONS.md): process-local/non-durable STOMP,
Redis-to-STOMP crash gap, Redis-loss/finalization window, weakly consistent O(N)
SCAN discovery, no Redis Cluster multi-key support, no in-application rate
limiter, external production TLS/secrets/CSP/monitoring/backups, Compose
persistence limits, frontend bundle size, leaderboard/open-in-view measurement
candidates, and pending clean-checkout proof.
