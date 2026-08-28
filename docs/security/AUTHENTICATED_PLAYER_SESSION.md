# Authenticated player session

## Scope and trust boundary

Sindopoly authenticates its anonymous game participants with a server-managed,
opaque HTTP session. `Player` remains the durable logical identity; it is not a
password account. The browser receives the standard `JSESSIONID` cookie and
never receives a bearer token or session identifier in a response body.

The session contains Spring Security's serialized `PlayerPrincipal`, which
holds only the durable player ID. `AuthenticatedPlayerResolver` verifies that
the referenced MariaDB player still exists once at each actor-owned controller
entry. Domain and application services do not depend on servlet APIs.

## REST contract

| Method | Path | Authentication | Behavior |
| --- | --- | --- | --- |
| `POST` | `/api/player-state/create` | Unauthenticated only | Validates and creates the anonymous `Player`, rotates/establishes the server session, and preserves the legacy numeric-ID response. An existing authenticated session must log out before creating another identity. |
| `GET` | `/api/session/me` | Required | Returns only `{id, nickname}` derived from the authenticated session and MariaDB record. Missing, expired, invalidated, or stale-player sessions return `401`. |
| `GET` | `/api/session/csrf` | Required | Returns Spring Security's CSRF header name and token for the current browser session. The client keeps it in memory. |
| `POST` | `/api/session/logout` | Required, with CSRF | Invalidates server-side session state, clears authentication, deletes the session/CSRF cookies, and returns `204`. It does not delete the durable `Player` or active game state. |

`POST /api/player-state/create`, public-lobby discovery, and API documentation
are the only anonymous API routes. Other `/api/**` routes and the `/ws/**`
handshake require an authenticated player session. REST membership, host,
active-player, phase, and private-read policy is defined in
`GAME_COMMAND_AUTHORIZATION.md`; STOMP subscription policy remains the
responsibility of REVAMP-021.

## Legacy player IDs and compatibility

The frontend still sends `playerId`/`ownerId` in existing paths, queries, and
bodies to avoid a flag-day DTO migration. At actor-owned boundaries these IDs
are consistency checks against the authenticated principal:

- game creation, in-game lookup, join, invite join, start, and self-removal;
- player-state read;
- roll, optional action, and pass; action path/body game and player IDs must
  also agree.

A mismatch returns `403` and never substitutes or impersonates the supplied
player. IDs used only as resource selectors remain selectors pending the
authorization matrix. The host-kick UI uses an explicit lobby-host command
whose target player ID is only a resource selector; the authenticated host
remains the actor.

The browser includes credentials on REST calls, recovers the current player
from `/api/session/me` after reload, and treats local `player_id` only as cached
display/compatibility data. Authentication secrets are not stored in
`localStorage`, `sessionStorage`, Redux, or React state.

## CSRF, CORS, and cookie policy

Cookie authentication enables CSRF protection for unsafe methods. Player
creation is narrowly exempt because no authenticated session or token exists
yet; it cannot mutate an existing identity. The React client fetches a token
from `/api/session/csrf`, stores it only in module memory, and sends the named
header on subsequent unsafe requests. Logout is CSRF-protected.

CORS has one Spring Security configuration owner and uses the shared validated
`WebOriginPolicy` for both REST and WebSocket origins. Development permits only
the documented localhost origins. The `prod` profile requires explicit HTTPS
origins rather than widening the list.

Session defaults:

- `HttpOnly=true` for the session and CSRF repository cookies;
- `SameSite=Lax` by default;
- two-hour inactivity timeout, configurable with `SINDOPOLY_SESSION_TIMEOUT`;
- `Secure=false` only for the documented HTTP localhost workflow;
- the production profile forces `Secure=true`.

The frontend reads the CSRF token response body and keeps it in module memory;
it never needs a script-readable token cookie. The complete secret, cookie,
proxy, TLS, and origin contract is `DEPLOYMENT_SECURITY.md`.

Spring Security rotates the session ID during identity establishment and
standard logout invalidates it. Expired or invalidated sessions become
unauthenticated and cannot silently attach to another player. Session IDs,
cookie values, and CSRF tokens must never be logged.

## Persistence and lifecycle

MariaDB continues to store the existing `Player` row. There is no entity,
table, seed-data, or schema migration. Logout does not delete that durable row.

Sessions use the servlet container's in-memory Spring Security session store.
There is **no Redis schema or key change**, and authentication data does not
enter any active-game key namespace. This store is suitable for the current
single-instance deployment. A multi-instance deployment must deliberately
select a shared Spring Session store and document its namespace, serializer,
TTL, ownership, and cleanup before use.

## Security review and deferred controls

Fixed in REVAMP-015:

- unauthenticated access to protected REST routes and the WebSocket handshake;
- browser-supplied IDs acting as identity at the migrated controller entries;
- action body/path identity disagreement;
- cross-session actor confusion;
- session fixation at establishment, stale-player failure, logout invalidation,
  cookie/CSRF baseline, and generated development-password fallback;
- duplicate conflicting CORS configuration.

Fixed in REVAMP-016:

- REST game membership and private-read authorization;
- lobby-host authorization for start, delete, and explicit host kick;
- active-player plus lifecycle/implicit-turn-phase authorization for roll,
  optional action, and pass;
- deterministic missing-game and lifecycle/phase conflict responses.

Fixed in REVAMP-017:

- removal of arbitrary player-state overwrite/deletion and direct money-grant
  routes;
- removal of client-triggered game deletion and manual completion evaluation;
- stable `404`/`405` responses for removed routing surfaces.

Deferred to REVAMP-021:

- STOMP CONNECT identity mapping details, game-topic subscription membership,
  inbound command policy, reconnect recovery, and WebSocket origin hardening.
  The HTTP handshake already shares the same Spring Security session identity.

## Performance

The session principal is resolved in memory. Actor-owned controller entries
perform one bounded MariaDB existence check per request so deleted/stale player
references fail closed; the current-player response adds one row lookup. No
Redis round trips, global locks, custom cryptography, or repeated service-layer
session lookups are introduced.

## Acceptance verification

The deterministic local gates passed: `mvn clean verify` completed with 36
fast/security tests, and `npm run build` completed successfully. External
Windows/Docker verification completed the same 36-test fast/security tier plus
three Redis/MariaDB/REST integration tests with
`mvn -Dapi.version=1.44 verify -Pintegration-tests` using real
`redis:7.0-alpine` and `mariadb:10.11` containers. Browser smoke verification
confirmed creation, the HttpOnly `JSESSIONID`, refresh recovery through `/me`,
an authenticated CSRF-protected mutation, logout invalidation, and an
unauthenticated post-logout refresh. No session IDs or cookie values are
recorded here.
