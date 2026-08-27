# ADR-0005: Flyway owns MariaDB schema evolution

- Status: Accepted
- Date: 2026-08-26
- Decision scope: MariaDB schema and stable reference-data lifecycle

## Context

Sindopoly previously combined a Docker-entrypoint `MariaDB/init.sql`, Hibernate
`ddl-auto=update`, and recurring startup compatibility services. Entrypoint SQL
ran only for a new container data directory, Hibernate changes had no reviewed
version history, and compatibility mutations competed with both. That model
could not prove a clean installation, safely upgrade an existing volume, or
coordinate schema ownership across backend instances.

## Decision

Flyway is the sole forward MariaDB schema-evolution mechanism. Versioned SQL
migrations live at `classpath:db/migration`; V1 is
`V1__create_sindopoly_schema.sql`. MariaDB application and integration profiles
use Hibernate `validate`. Fast H2 tests keep `create-drop` with Flyway disabled
and are not migration evidence.

Fresh databases migrate from zero. A temporary `LegacyDatabaseBootstrapService`
runs through `SindopolyFlywayMigrationStrategy` before Flyway migration only
when the database is non-empty and has no `flyway_schema_history`. It recognizes
the historical Sindopoly schema, serializes bootstrap with the existing
`sindopoly:database-compatibility` MariaDB named lock, performs only the accepted
Stats, `game_finalization`, and Pay-20 repairs, validates V1 equivalence, and
baselines at version 1. Unknown or ambiguous schemas fail closed. Additional
legitimate Players, Stats, and historical data are preserved.

After history exists, Flyway alone validates and applies pending migrations.
The compatibility lock is released before normal migration and is not a second
permanent Flyway lock. V1 is immutable after release; future schema or required
Card/Square changes use V2 or later.

`MariaDB/init.sql` is no longer mounted by Compose or treated as current schema
truth. It is retained temporarily as a historical pre-Flyway fixture for upgrade
tests. V1 owns the production schema, Stats trigger, and stable Card/Square data;
demo Players are not production migration data.

## Alternatives considered

- Hibernate `update`: rejected because it lacks reviewed history and predictable
  upgrade/rollback operations.
- Docker-entrypoint `init.sql`: rejected as schema owner because it runs only on
  initial database-directory creation.
- A custom compatibility-only migrator: rejected because it would recreate
  versioning, checksum, validation, and migration locking concerns.
- Flyway: selected for Spring Boot integration, ordered/checksummed migrations,
  validation, MariaDB support, and established migration locking.

## Failure, rollback, and concurrency

Migration or validation failure blocks application startup and leaves Flyway
history available for diagnosis. MariaDB DDL is not assumed transactional.
There are no automatic down migrations, destructive resets, or volume deletion;
rollback uses backup/restore or a reviewed forward corrective migration.

For an unversioned legacy database, concurrent instances serialize on the
temporary named lock and recheck history after acquiring it. Once one instance
baselines, later instances skip compatibility work and use Flyway normally.

## Consequences

- Schema/JPA drift now fails startup instead of being silently altered.
- Clean and persistent-volume paths are explicit and integration-tested against
  MariaDB 10.11.
- Startup performs bounded migration work; gameplay request, scheduler, Redis,
  REST, and STOMP paths gain no migration queries.
- The legacy bridge remains removable debt once all supported databases contain
  valid Flyway history at version 1 or later.
