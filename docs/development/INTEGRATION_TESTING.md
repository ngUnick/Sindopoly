# Integration testing

## Purpose and scope

REVAMP-011 provides a container-backed integration tier for the Spring backend,
and REVAMP-022 extends that same tier across real TCP HTTP and the application's
SockJS-over-WebSocket STOMP transport. It exercises isolated Redis and MariaDB,
opaque HTTP sessions, CSRF, REST commands and snapshots, broker delivery, and
durable finalization. It is not browser-rendering coverage.

## Prerequisites and commands

Docker Desktop must be running and able to pull/run images. From Windows-native
PowerShell, use the backend directory:

```powershell
Set-Location .\Sindopoly-Java
mvn test
mvn verify -Pintegration-tests
```

`mvn test` runs the fast unit/characterization tier. `mvn verify
-Pintegration-tests` runs that tier plus Failsafe tests named `*IT`; it must not
be presented as a passing integration check when Docker is unavailable.

On the verified Windows/Docker Desktop environment, Docker API compatibility
required this invocation instead:

```powershell
mvn -Dapi.version=1.44 verify -Pintegration-tests
```

This is a troubleshooting compatibility flag for that Docker Desktop 29.4.3
environment only. It is not baked into production configuration, and the
Testcontainers version and Docker settings remain unchanged.

## Isolation and initialization

- Redis uses a fresh `redis:7.0-alpine` Testcontainers instance with its mapped
  host/port supplied by Spring's dynamic properties. Test setup and teardown
  issue `FLUSHDB` only through that container connection; no localhost or
  developer Redis is used.
- MariaDB uses a fresh `mariadb:10.11` Testcontainers instance with synthetic
  test-only credentials and dynamic JDBC properties. The test mounts the
  repository's existing `MariaDB/init.sql` into the container initialization
  directory, so the current schema and static player/square/card seed model are
  exercised without changing production schema ownership.
- Containers are owned by the test JVM and are removed at normal test lifecycle
  completion. Tests create no external state and do not rely on test order.

## Current integration and end-to-end scope

The lower-level integration coverage proves Redis wiring/cleanup and atomic
version behavior, MariaDB connectivity/schema/finalization behavior, and Spring
REST command contracts. The REVAMP-022 boundary coverage additionally uses:

- separate HTTP cookie jars for independent player identities;
- real session and CSRF propagation over a random local TCP port;
- the configured `/ws` endpoint through SockJS's WebSocket transport and real
  STOMP CONNECT/SUBSCRIBE frames;
- authorized event delivery and rejection of anonymous or stale-player
  connections, non-member/malformed subscriptions, and client SEND frames;
- membership-revocation delivery checks;
- `create → join → start → roll → optional action → scheduler completion`, with
  snapshots, Redis versions, and MariaDB finalization asserted;
- concurrent identical-command replay, stale-version and command-ID-reuse
  rejection, no-event-on-rejection, disconnect/reconnect, and snapshot recovery.

The deterministic dice spy is test-context-only; the HTTP, security, command,
Redis, broker, snapshot, and MariaDB boundaries remain real. The scheduler
completion test seeds only the terminal cash precondition because completion has
no public client command by design, then invokes the production scheduler-owned
transition and verifies its public event/snapshot and durable stats effects.

## Tier and known exclusions

`mvn test` remains the fast, Docker-free tier. The real transport flow remains in
Failsafe's `*IT` tier, so the existing GitHub Actions backend-integration job runs
it with the other Testcontainers tests without adding another container stack.

The suite does not launch a browser or the JavaScript SockJS client, exercise
SockJS XHR fallbacks, render the frontend, prove cross-instance delivery, or
claim durable event history. It does exercise the server's actual SockJS
protocol endpoint and WebSocket transport with a Java SockJS/STOMP client.
Browser presentation remains covered by manual verification; frontend event
ordering and recovery logic remains covered by the Node suite. The Spring simple
broker is still process-local and best-effort.

## Troubleshooting and security

Docker daemon/image-pull failures are environment blockers, not Sindopoly rule
failures. Do not substitute local Redis/MariaDB or disable the container tests.
The suite uses synthetic container credentials and seed data only; do not add
production credentials, dumps, or secrets.

REVAMP-022 acceptance passed 88 fast and 40 integration tests with zero failures,
errors, or skips on Docker Engine 29.4.3, Java 21.0.11, Redis 7, and MariaDB
10.11. The real transport coverage exposed and now protects a server defect in
which valid outbound STOMP notifications were dropped because broker MESSAGE
frames did not reliably retain the authenticated principal. A non-failing Lettuce
reconnect warning can appear while Testcontainers shuts Redis down after success.
