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

## Relationships and repositories

- `Stats` has `@OneToOne` to `Player` with `@JoinColumn(name = "player", unique = true)`.
- `StatsRepository#findByPlayer(Player player)` supports stats lookup.
- `SquareRepository#findIdsByColour(SquareType type)` queries square IDs by type.

## Seed data

- `player`: Bob and Alice.
- `stats`: explicit rows for player 1 and 2, while a trigger also inserts a stats row after every player insert.
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

Risk: `trg_player_after_insert` inserts stats rows, then `init.sql` also inserts stats rows for players 1 and 2. Because `stats.player` in raw SQL has no unique constraint, seed may produce duplicate stats rows even though JPA maps the relationship as unique.

## Indexes and constraints

Confirmed:

- Primary keys on all tables.
- Foreign key from `stats.player` to `player.id`.

Missing/questionable:

- No SQL-level unique constraint on `stats.player` in `init.sql`, despite JPA `unique=true`.
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

No explicit `@Transactional` annotations were found in current main source during audit search. JPA repository operations use default repository transactions, but cross-resource Redis + MariaDB updates are not transactional as a unit.
