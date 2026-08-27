# Database schema current

## Schema ownership

Flyway is the sole forward MariaDB schema and stable reference-data owner. Its
versioned migrations live in
`Sindopoly-Java/src/main/resources/db/migration`; V1 is
`V1__create_sindopoly_schema.sql`. `flyway_schema_history` records applied or
baselined versions and checksums. Released migrations are immutable; future
changes require a new version.

Hibernate uses `spring.jpa.hibernate.ddl-auto=validate` for MariaDB application
and integration profiles. Fast H2 tests use `create-drop` with Flyway disabled
and are not schema-migration proof. `MariaDB/init.sql` is an inactive historical
pre-Flyway test fixture, not current schema truth or Compose initialization.

See `docs/architecture/DATABASE_MIGRATION_OWNERSHIP.md` and ADR-0005 for startup,
baseline, locking, failure, and rollback policy.

## V1 tables and mappings

| Object | Current shape and invariants | Owner/version | JPA/application relationship |
| --- | --- | --- | --- |
| `player` | `id INT` identity PK; nullable `p_name VARCHAR(255)`; nullable `created_at TIMESTAMP` defaulting to current time | Flyway V1 | `Player` entity |
| `stats` | `id INT` identity PK; `player INT NOT NULL`; counters; FK to `player.id`; `UNIQUE KEY uq_stats_player (player)` | Flyway V1 | `Stats` one-to-one entity and `StatsRepository` |
| `card` | `id SMALLINT` identity PK; title, description, `money`/`transport` enum, signed/destination `FLOAT` amount | Flyway V1 | `Card` entity; immutable gameplay reference rows |
| `square` | `id TINYINT` PK; board-type enum; nullable `SMALLINT` price/rent | Flyway V1 | `Square` entity; immutable gameplay reference rows |
| `game_finalization` | UUID-like `CHAR(36)` PK; game identity, winner, completion fields; unique `(game_id, game_created_at_epoch_ms)` | Flyway V1 | JDBC transaction boundary in `GameFinalizationService` |
| `trg_player_after_insert` | After each Player insert, creates exactly one zero-valued Stats row | Flyway V1 | Database-level Stats initialization owner; not duplicated in application services |
| `flyway_schema_history` | Applied/baselined version, checksum, state, and execution metadata | Flyway | Migration authority; not an application entity |

Constraint names are required only where they are part of the accepted contract:
`uq_stats_player`, `uq_game_finalization_instance`, and
`trg_player_after_insert`. The historical Stats foreign-key name is not treated
as semantic identity; its `stats.player → player.id` relationship is validated.

## Reference and mutable data ownership

V1 installs exactly 40 board Squares and 40 Cards. Card money amounts are signed
server effects; the canonical Pay-20 row is `-20`. Future required Card/Square
changes use a new Flyway migration and application startup does not overwrite
them repeatedly.

Players and accumulated Stats are mutable application data. Fresh V1 installs
no Bob/Alice or other demo Players and no historical demo Stats totals. A
recognized legacy baseline preserves existing Players, Stats, and other
legitimate mutable data, including historical demo rows.

## Existing database compatibility

`SindopolyFlywayMigrationStrategy` runs the temporary
`LegacyDatabaseBootstrapService` only for a non-empty database without Flyway
history. The bridge validates a recognized historical schema and canonical
reference data, performs only approved Stats/`game_finalization`/Pay-20 repairs,
then baselines at V1. Unknown schemas, unexpected required reference metadata,
multiple populated Stats rows, NULL Stats owners, and orphan owners fail startup
without a false history record.

The named lock `sindopoly:database-compatibility` serializes only this one-time
bootstrap. After history exists, Flyway alone validates and migrates. The bridge
can be removed after all supported installations are expected to have valid
history at V1 or later.

## Persistent and transient boundary

MariaDB persists Players, accumulated Stats, board/Card reference data, and
idempotent finalization markers. Redis remains authoritative for active games,
turns, positions, money, ownership, decks, command replay, and terminal snapshots.
Game finalization commits its MariaDB marker and bounded Stats updates in one
transaction after the Redis transition; Redis and MariaDB are not one atomic
resource transaction.

No Redis key, field, TTL, serializer, REST DTO, or STOMP contract changes are
introduced by this schema-ownership decision.
