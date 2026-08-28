# Deployment security configuration

This is the canonical deployment-security contract for Sindopoly. It separates
the repository's local Windows/Docker workflow from a production deployment and
must be reviewed whenever credentials, origins, cookies, proxying, public ports,
logging, error responses, or browser build configuration change.

## Supported profiles and topology

| Profile | Intended use | Security posture |
| --- | --- | --- |
| `dev` (default) | Native Windows development and the repository Docker Compose stack | Local-only credentials, HTTP browser origins, non-secure session cookie, host-published Redis/MariaDB ports for developer tools. Never deploy this profile publicly. |
| `test` / `integration` | Automated isolated verification | H2 or Testcontainers values supplied by tests; explicit localhost browser origins. |
| `prod` | Internet- or organization-facing deployment | No credential/origin fallback, HTTPS origins only, Secure/HttpOnly session cookies, Redis authentication and TLS, SQL detail logging disabled, OpenAPI disabled by default. Missing or unsafe required values fail startup. |

The repository Compose file is a development convenience, not a production
manifest. A production topology must place the frontend and backend behind an
HTTPS reverse proxy or ingress, keep MariaDB and Redis on private networks, and
publish only the intended browser-facing ports. Do not expose ports 3306 or
6379 to untrusted networks.

## Production environment contract

Start the backend with `SPRING_PROFILES_ACTIVE=prod` and provide these values
through the deployment platform's secret/configuration mechanism, not a tracked
file or command history:

| Variable | Secret | Required production behavior |
| --- | --- | --- |
| `SINDOPOLY_DB_URL` | Possibly; treat as sensitive | MariaDB JDBC URL. Use the provider's verified TLS mode and certificate validation. |
| `SINDOPOLY_DB_USERNAME` | Yes | Least-privilege application/migration account appropriate to the documented Flyway ownership model. |
| `SINDOPOLY_DB_PASSWORD` | Yes | Non-default, deployment-unique value. |
| `SINDOPOLY_REDIS_HOST` | Sensitive configuration | Private Redis endpoint. |
| `SINDOPOLY_REDIS_PORT` | No | Defaults to `6379`; use the provider's TLS port when different. |
| `SINDOPOLY_REDIS_PASSWORD` | Yes | Non-empty, deployment-unique value. |
| `SINDOPOLY_REDIS_SSL_ENABLED` | No | Defaults to `true`; the production guard rejects `false`. |
| `SINDOPOLY_ALLOWED_ORIGINS` | No | Comma-separated, explicit HTTPS origins only. Wildcards, paths, credentials, empty entries, and non-HTTP(S) schemes fail startup. |
| `SINDOPOLY_SESSION_COOKIE_SAME_SITE` | No | Defaults to `lax`. Use `none` only for a genuinely cross-site frontend/backend topology; Secure remains mandatory. |
| `SINDOPOLY_SESSION_TIMEOUT` | No | Defaults to `2h`; choose a bounded value for the deployment risk model. |
| `SINDOPOLY_FORWARD_HEADERS_STRATEGY` | No | Defaults to `NONE`. Use `FRAMEWORK` only behind a trusted proxy that strips client-supplied forwarding headers and writes authoritative values. |
| `SINDOPOLY_OPENAPI_ENABLED` | No | Defaults to `false`. Enable only on a deliberately protected operational surface. |

`VITE_API_BASE_URL` is public build-time frontend configuration. It must contain
the browser-reachable backend origin and must never contain a credential or
token. Rebuild the frontend when it changes. The local default remains
`http://localhost:8080`.

The production profile intentionally has no database, Redis, or browser-origin
fallback. Spring placeholder resolution and `ProductionDeploymentGuard` make
missing credentials, disabled Redis TLS, non-HTTPS origins, or an empty origin
policy startup failures. Do not bypass the guard by selecting the `dev` profile
in a deployed environment.

## Browser, CORS, WebSocket, and cookie policy

`WebOriginPolicy` is the single parser and validator for
`sindopoly.web.allowed-origins`. Spring Security owns REST CORS configuration,
and `/ws` reuses exactly the same validated list. Credentialed REST requests and
SockJS/WebSocket handshakes are allowed only from those origins; wildcard origin
patterns are forbidden. WebSocket authentication and game-topic membership
authorization remain as defined in `AUTHENTICATED_PLAYER_SESSION.md` and
`REALTIME_SYNCHRONIZATION.md`.

The session cookie is always HttpOnly and SameSite-bounded. It is non-Secure
only in `dev` so localhost HTTP remains usable; `prod` forces Secure. The CSRF
repository cookie is also HttpOnly because the frontend obtains the token from
`GET /api/session/csrf`, stores it only in module memory, and sends the returned
header name. Logging cookies, CSRF tokens, session IDs, request bodies, or
authentication headers is prohibited.

The backend emits Spring Security's no-cache, content-type, and frame controls,
plus a strict-origin referrer policy and a permissions policy. The repository
Nginx image emits the same applicable browser headers, does not cache the SPA
entry point, and caches fingerprinted assets. A production reverse proxy must
also set HSTS after HTTPS is verified. A deployment-specific Content Security
Policy is required before public release; it must name the actual API/WebSocket
origin and cannot be safely hard-coded into the reusable local image.

## Errors, logging, and diagnostic surfaces

Expected authentication, authorization, validation, not-found, and game
conflict results retain stable bounded client messages. Internal application
state errors and unexpected failures return generic responses without exception
messages, stack traces, Redis data, SQL, connection strings, or payloads.
Unexpected exception logs contain the exception type only; cache-fallback logs
contain only the constant cache key. Operators should attach a protected
correlation/telemetry system if production stack traces are required rather
than restoring client-visible or unbounded logs.

OpenAPI/Swagger is disabled by default in `prod`; Spring Boot Actuator is not a
project dependency. Vite production builds do not enable source maps. If a
future deployment adds diagnostics, metrics, source maps, or admin endpoints,
they require separate authentication, network restriction, and disclosure
review.

## Abuse and resource limits

The existing nickname and command validation remain in force. WebSocket/STOMP
transport limits are 64 KiB per message, 512 KiB per session send buffer, and
10 seconds per send. These bounds are deliberately above current small command
and snapshot payloads and should be measured before reduction.

No request-rate limiter is introduced in REVAMP-026: the project has no approved
proxy topology, client-IP trust contract, or Redis rate-limit key lifecycle.
Production ingress should apply bounded connection and request limits without
using client-supplied forwarding headers. Application-level rate limiting, if
later justified, needs explicit identity semantics, response contracts, Redis
key/TTL ownership, multi-instance behavior, and tests before implementation.

## Local migration and verification

For local Compose, copy `.env.example` to an untracked `.env` only when defaults
need overriding. Values named `SINDOPOLY_DEV_*` are local-only and are not valid
production secrets. Existing local database containers created with the former
sample credentials may need recreation or equivalent local credential updates;
back up any data first. No MariaDB schema or Redis key migration is part of this
change.

Before release, verify:

1. `docker compose config` resolves only expected local values and labels the
   stack as development-only.
2. Production startup fails with missing required configuration and succeeds
   only with secret-store values, Redis TLS, and explicit HTTPS origins.
3. Allowed/disallowed CORS origins, WebSocket origins, session/CSRF cookies,
   security headers, and generic error bodies match the automated tests.
4. MariaDB/Redis are private; only HTTPS browser endpoints are public.
5. Logs, build output, image history, environment inspection, and frontend
   assets contain no credentials or session/CSRF values.

## Rotation, incident response, and rollback

Rotate database and Redis credentials in the backing services/secret store,
restart application instances so connection pools use the new values, verify
health and game recovery, then revoke the old values. Session compromise is
handled by invalidating server sessions and rotating any platform session-key
material; Sindopoly does not issue bearer tokens. Restrict and preserve relevant
sanitized logs, but never paste environment dumps into issues.

Rollback the application/image and its environment configuration together.
Keep the restrictive origin list and private infrastructure networking during a
rollback. Because REVAMP-026 changes no MariaDB schema or Redis key format, no
data rollback is required. Re-enabling the former committed credentials,
wildcard origins, insecure production cookies, or client-visible exception
details is not an acceptable rollback.

## Residual risks

- The repository does not provide a production ingress/TLS manifest, secret
  manager integration, CSP tailored to a real deployment, or rate limiter.
- The simple STOMP broker remains single-instance; the documented synchronization
  and recovery contract still applies.
- Frontend compatibility identity data remains in browser storage, although it
  is not authentication authority or a secret.
- Dependency/vulnerability scanning depends on external tooling and registry
  availability; CI currently performs builds/tests, not a dedicated scanner.
