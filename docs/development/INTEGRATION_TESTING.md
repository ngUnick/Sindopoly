# Integration testing

## Purpose and scope

REVAMP-011 provides a container-backed integration tier for the Spring backend.
It exercises Spring REST adapters through the existing services against isolated
Redis and MariaDB instances. It is not browser E2E coverage and does not test
STOMP/WebSocket delivery, authentication, or target command/version semantics.

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

## Current smoke scope

The baseline proves Redis wiring/cleanup, MariaDB connectivity plus seeded
schema data, and this pre-auth current REST contract:

`create lobby → join → start → read game state`.

The REST test deliberately does not assert dice, rent, tax, cards, jail, or
turn-order behavior. It invokes current body/path player-ID endpoints solely as
integration scaffolding; REVAMP-015 through REVAMP-017 own the future identity
and authorization contract.

## Troubleshooting and security

Docker daemon/image-pull failures are environment blockers, not Sindopoly rule
failures. Do not substitute local Redis/MariaDB or disable the container tests.
The suite uses synthetic container credentials and seed data only; do not add
production credentials, dumps, or secrets. Dedicated WebSocket integration
coverage belongs to REVAMP-022.

External Windows verification completed the tier with Docker Engine 29.4.3,
Java 21.0.11, Testcontainers, Ryuk 0.7.0, `redis:7.0-alpine`, and
`mariadb:10.11`: 27 fast tests and 3 integration tests passed with zero
failures, errors, or skips. The Spring context connected to both dynamically
mapped ephemeral resources, exercised the seeded schema/repositories, and
completed the REST lifecycle smoke. A non-failing Lettuce reconnect warning
appeared during teardown; Failsafe still reported all 3 integration tests
successful. Codex itself may remain unable to reproduce this when Docker is
unavailable, but the external result is the acceptance evidence.
