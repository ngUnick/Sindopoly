# Database schema current

## Schema source

Primary schema/seed source: `MariaDB/init.sql`.

Runtime JPA schema setting: `spring.jpa.hibernate.ddl-auto=update` in `Sindopoly-Java/src/main/resources/application.properties`.

## Tables and entities

| Table | Entity | Key fields | Evidence |
| --- | --- | --- | --- |
| `player` | `Player` | `id`, `p_name`, `created_at` | `MariaDB/init.sql`; `Player.java` |
| `card` | `Card` | `id`, `title`, `description`, `type`, `amount` | `MariaDB/init.sql`; `Card.java` |
| `square` | `Square` | `id`, `s_type`, `price`, `rent` | `MariaDB/init.sql`; `Square.java` |
| `stats` | `Stats` | `id`, `player`, counters | `MariaDB/init.sql`; `Stats.java` |
| `game_finalization` | JDBC boundary | deterministic finalization/game identity and completion fields | `MariaDB/init.sql`; `GameFinalizationService.java` |

## Relationships and repositories

- `Stats` maps one player; explicit pre-Hibernate compatibility owns SQL enforcement.
- `StatsRepository#findByPlayer(Player player)` supports stats lookup.
- `SquareRepository#findIdsByColour(SquareType type)` queries square IDs by type.

## Seed data

- `player`: Bob and Alice.
- `stats`: the player trigger creates one row; seed history updates those rows.
- `square`: 40 board squares.
- `card`: Chance and Community Chest cards.

`Card.amount` is the canonical server-side effect value: money cards use a
signed delta (positive credit, negative cost), while transport cards use an
absolute board destination. MariaDB entrypoint SQL runs only while initializing
a new container data directory, so changing `init.sql` alone does not repair a
running container that already holds the historical positive `Pay 20` row.
`CardDataCompatibilityService` therefore applies one bounded idempotent startup
update identified by type, title, exact seed description, and old value `20`;
it changes that row to `-20` and is a no-op for fresh or already-corrected data.
No schema migration framework or schema change is introduced.

The former duplicate root cause was trigger creation followed by explicit seed
INSERTs. Fresh SQL now uses UPDATE and enforces `stats.player INT NOT NULL` plus
`UNIQUE KEY uq_stats_player (player)`. The trigger is the sole live creation
owner; services fail if its row is unexpectedly missing.

## Indexes and constraints

Confirmed:

- Primary keys on all tables.
- Foreign key from `stats.player` to `player.id`.
- `stats.player` is `NOT NULL` and uniquely indexed as `uq_stats_player`.
- `game_finalization` has a primary finalization ID and unique game-instance identity.

Missing/questionable:

- No unique constraint on `player.p_name`.
- No indexes visible for leaderboard ordering fields.
- No migration tool (Flyway/Liquibase) found.

## Persistent vs transient data

Persistent MariaDB:

- Players, cards, board squares, accumulated stats.

Transient Redis:

- Active game lifecycle, turn, positions, money, ownership, deck state.

Duplication:

- Player existence/nickname lives in MariaDB; active money/properties/position lives in Redis.
- Stats are finalized from Redis into MariaDB at end/leave.

## Transaction boundaries

`GameFinalizationService` uses one MariaDB transaction for the marker and all
bounded Stats updates. Duplicate markers change no Stats, and failures roll back
the marker and every update. Redis commits first and is not atomic with MariaDB;
retained terminal JSON supports retry. Existing-volume compatibility runs before
Hibernate schema update and fails closed on unsafe durable data.
