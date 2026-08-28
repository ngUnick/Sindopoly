# MariaDB migration and ownership

ADR-0005 defines the durable decision: Flyway owns forward MariaDB schema and
stable reference-data evolution.

## Ownership

- Canonical migrations: `Sindopoly-Java/src/main/resources/db/migration`.
- Current migration: `V1__create_sindopoly_schema.sql`.
- Migration history: `flyway_schema_history` in the application database.
- Hibernate: validates MariaDB mappings; it does not create or update MariaDB.
- Stable Card/Square definitions: versioned Flyway data.
- Mutable Players/Stats: application data, never normalized to fresh-install rows.
- `MariaDB/init.sql`: historical pre-Flyway test evidence only; never mounted by
  Compose and never edited as a second current schema.

Current V1 durable structures are:

| Table | Ownership/purpose |
| --- | --- |
| `player` | Durable anonymous player identity and nickname metadata. |
| `card` | Stable money/transport card reference definitions. |
| `square` | Stable board-square reference definitions. |
| `stats` | Durable per-player aggregate outcomes, protected by trigger/uniqueness rules. |
| `game_finalization` | Idempotency record for one durable finalization per game/time identity. |

Active turn, membership, balances, position, deck order, and command replay are
not MariaDB state; they remain transient authoritative Redis state.

Released migrations are immutable because Flyway validates their checksums.
Future schema or required reference-data changes require V2, V3, and so on.

## Startup paths

### Empty database

`SindopolyFlywayMigrationStrategy` identifies a database with no application
tables and invokes Flyway. Flyway creates its history table, applies V1, and
records a successful SQL migration at version 1. Hibernate then validates the
result before repositories and application services become usable.

### Recognized unversioned database

The strategy acquires `sindopoly:database-compatibility`, then rechecks for
history to handle concurrent startup. `LegacyDatabaseBootstrapService` requires
the recognized Player, Card, Square, and Stats structures; validates primary and
foreign keys, column types/nullability, the Stats trigger, and exact canonical
Card/Square data; and permits additional legitimate Player/Stats rows.

The only automatic repairs are the previously accepted compatibility rules:

- create/validate `game_finalization` when historically absent;
- correct the uniquely identified historical positive Pay-20 card;
- establish `stats.player INT NOT NULL` and `uq_stats_player` after rejecting
  NULL/orphan owners and safely resolving known duplicate artifacts.

One populated Stats row plus zero rows retains the populated row. All-zero
duplicates retain the lowest Stats ID. Multiple populated rows fail closed and
are never merged. After V1 equivalence is proven, Flyway records baseline version
1 with description `Validated legacy Sindopoly schema`. The named lock is then
released and Flyway performs its normal migrate/validate path.

### Flyway-managed database

If `flyway_schema_history` exists, the legacy bridge does not inspect or repair
the schema. Flyway validation and migration are authoritative; checksum,
history, or migration failures block startup.

### Unknown or unsafe database

A non-empty unversioned database that is not a recognized Sindopoly schema, has
unexpected required reference data, or contains ambiguous durable Stats data is
not baselined. Startup fails without blessing or deleting its data.

## Locking and multi-instance behavior

The MariaDB named lock exists only for the one-time unversioned bootstrap. A
waiting instance rechecks history under the lock and skips legacy work if another
instance already completed it. Normal and future migrations use Flyway's own
schema-history locking; the custom lock never wraps those migrations. Release is
verified before the JDBC session returns to the pool; a release failure aborts
the physical session so its session-scoped lock cannot leak through HikariCP.

## Failure and rollback

The migration policy is forward-only. MariaDB DDL may commit implicitly, so an
arbitrary migration is not described as transactionally rollbackable. On
failure, stop application startup, diagnose the recorded state, repair the
cause, and apply a reviewed forward migration or restore a verified backup.
Never automatically drop tables/columns, recreate volumes, or delete failed
history.

## Testing tiers

- Fast H2 tests use `create-drop` with Flyway disabled and provide domain/API
  feedback only.
- MariaDB 10.11 Testcontainers tests prove empty V1 migration, Hibernate
  validation, repeat migration, recognized baseline, safe repairs, fail-closed
  ambiguous/NULL/orphan/unknown states, and concurrent bootstrap.
- Failsafe includes all `*IT` migration tests in the existing backend integration
  CI job.

## Legacy bridge removal

The bridge is temporary. Remove it only through reviewed cleanup after every
supported deployed and developer database is expected to contain valid
`flyway_schema_history` at version 1 or later. Removal must retain explicit
operator guidance for unsupported unversioned databases and requires an
explicit future support-policy decision; no fixed release or date is assumed.
