package com.example.Sindopoly_Java.integration;

import com.example.Sindopoly_Java.database.LegacyDatabaseBootstrapService;
import com.example.Sindopoly_Java.database.SindopolyFlywayMigrationStrategy;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationVersion;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.testcontainers.containers.MariaDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Executors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Exercises real historical schemas through the same strategy used by Spring Boot startup. */
@Testcontainers
class LegacyDatabaseMigrationIT {

    private static final String PAY_TWENTY_DESCRIPTION =
            "Πρέπει να αγοράσεις εξαρτήματα για εργαστήριο ηλεκτρονικής. Πλήρωσε $20.";

    @Container
    static final MariaDBContainer<?> MARIADB = new MariaDBContainer<>("mariadb:10.11")
            .withDatabaseName("sindopoly_legacy")
            .withUsername("sindopoly_test")
            .withPassword("sindopoly_test");

    private final LegacyDatabaseBootstrapService bootstrap = new LegacyDatabaseBootstrapService();
    private final SindopolyFlywayMigrationStrategy strategy = new SindopolyFlywayMigrationStrategy(bootstrap);

    @Test
    void currentEquivalentUnversionedSchemaBaselinesWithoutDeletingMutableData() throws Exception {
        resetToHistoricalFixture();
        try (Connection connection = connection()) {
            assertThat(scalar(connection, "SELECT total_wins FROM stats WHERE player = 1")).isEqualTo(10);
            strategy.migrate(flyway());

            assertBaselineHistory(connection);
            assertThat(scalar(connection, "SELECT COUNT(*) FROM player WHERE p_name IN ('Bob', 'Alice')"))
                    .isEqualTo(2);
            assertThat(scalar(connection, "SELECT total_wins FROM stats WHERE player = 1")).isEqualTo(10);
            execute(connection, "INSERT INTO player (p_name) VALUES ('BaselineTrigger')");
            assertThat(scalar(connection, "SELECT COUNT(*) FROM stats WHERE player = LAST_INSERT_ID()"))
                    .isEqualTo(1);
        }
    }

    @Test
    void repairableHistoricalStatesReachV1WithoutMergingStatsHistory() throws Exception {
        resetToHistoricalFixture();
        try (Connection connection = connection()) {
            dropStatsInvariant(connection);
            execute(connection, "INSERT INTO player (p_name) VALUES ('AllZeroLegacy')");
            int allZeroPlayer = scalar(connection, "SELECT LAST_INSERT_ID()");
            execute(connection, "INSERT INTO stats (player) VALUES (" + allZeroPlayer + ")");
            int retainedZeroId = scalar(connection,
                    "SELECT MIN(id) FROM stats WHERE player = " + allZeroPlayer);
            execute(connection, "INSERT INTO stats (player) VALUES (1)");
            execute(connection, "DROP TABLE game_finalization");
            execute(connection, "UPDATE card SET amount = 20 WHERE type = 'money' AND description = '"
                    + escaped(PAY_TWENTY_DESCRIPTION) + "'");

            strategy.migrate(flyway());

            assertBaselineHistory(connection);
            assertThat(scalar(connection, "SELECT COUNT(*) FROM stats WHERE player = 1")).isEqualTo(1);
            assertThat(scalar(connection, "SELECT total_wins FROM stats WHERE player = 1")).isEqualTo(10);
            assertThat(scalar(connection, "SELECT id FROM stats WHERE player = " + allZeroPlayer))
                    .isEqualTo(retainedZeroId);
            assertThat(scalar(connection, "SELECT COUNT(*) FROM game_finalization")).isZero();
            assertThat(scalar(connection, "SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS "
                    + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stats' "
                    + "AND INDEX_NAME = 'uq_stats_player' AND NON_UNIQUE = 0")).isEqualTo(1);
            assertThat(decimal(connection, "SELECT amount FROM card WHERE description = '"
                    + escaped(PAY_TWENTY_DESCRIPTION) + "'"))
                    .isEqualByComparingTo("-20");
        }
    }

    @Test
    void ambiguousPopulatedStatsFailsClosedWithoutBaselineOrDataLoss() throws Exception {
        resetToHistoricalFixture();
        try (Connection connection = connection()) {
            dropStatsInvariant(connection);
            execute(connection, "INSERT INTO stats (player, total_losses) VALUES (1, 4)");

            assertThatThrownBy(() -> strategy.migrate(flyway()))
                    .isInstanceOf(DataIntegrityViolationException.class)
                    .hasMessageContaining("multiple populated rows")
                    .hasMessageContaining("1");
            assertThat(scalar(connection, "SELECT COUNT(*) FROM stats WHERE player = 1")).isEqualTo(2);
            assertThat(hasHistory(connection)).isFalse();
        }
    }

    @Test
    void nullAndOrphanStatsOwnersFailClosed() throws Exception {
        resetToHistoricalFixture();
        try (Connection connection = connection()) {
            dropStatsInvariant(connection);
            execute(connection, "INSERT INTO stats (player) VALUES (NULL)");
            assertThatThrownBy(() -> strategy.migrate(flyway()))
                    .isInstanceOf(DataIntegrityViolationException.class)
                    .hasMessageContaining("NULL player ownership");
            assertThat(scalar(connection, "SELECT COUNT(*) FROM stats WHERE player IS NULL")).isEqualTo(1);
            assertThat(hasHistory(connection)).isFalse();
        }

        resetToHistoricalFixture();
        try (Connection connection = connection()) {
            execute(connection, "SET FOREIGN_KEY_CHECKS = 0");
            execute(connection, "INSERT INTO stats (player) VALUES (999999)");
            execute(connection, "SET FOREIGN_KEY_CHECKS = 1");
            assertThatThrownBy(() -> strategy.migrate(flyway()))
                    .isInstanceOf(DataIntegrityViolationException.class)
                    .hasMessageContaining("missing players")
                    .hasMessageContaining("999999");
            assertThat(scalar(connection, "SELECT COUNT(*) FROM stats WHERE player = 999999")).isEqualTo(1);
            assertThat(hasHistory(connection)).isFalse();
        }
    }

    @Test
    void unknownNonEmptySchemaFailsWithoutBeingBlessed() throws Exception {
        resetSchema();
        try (Connection connection = connection()) {
            execute(connection, "CREATE TABLE unrelated (id INT PRIMARY KEY)");
            assertThatThrownBy(() -> strategy.migrate(flyway()))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("required Sindopoly tables are missing");
            assertThat(hasHistory(connection)).isFalse();
        }
    }

    @Test
    void flywayManagedSchemaNeverRunsLegacyRepairAgain() throws Exception {
        resetToHistoricalFixture();
        try (Connection connection = connection()) {
            strategy.migrate(flyway());
            execute(connection, "UPDATE card SET amount = 20 WHERE type = 'money' AND description = '"
                    + escaped(PAY_TWENTY_DESCRIPTION) + "'");

            strategy.migrate(flyway());

            assertThat(decimal(connection, "SELECT amount FROM card WHERE description = '"
                    + escaped(PAY_TWENTY_DESCRIPTION) + "'"))
                    .isEqualByComparingTo("20");
            assertThat(scalar(connection, "SELECT COUNT(*) FROM flyway_schema_history WHERE success = 1"))
                    .isEqualTo(2);
            assertThat(scalar(connection, "SELECT COUNT(*) FROM square WHERE name IS NOT NULL"))
                    .isEqualTo(40);
        }
    }

    @Test
    void concurrentLegacyBootstrapsCreateOneBaselineHistory() throws Exception {
        resetToHistoricalFixture();
        var executor = Executors.newFixedThreadPool(2);
        try {
            var first = executor.submit(() -> strategy.migrate(flyway()));
            var second = executor.submit(() -> strategy.migrate(flyway()));
            first.get();
            second.get();
        } finally {
            executor.shutdownNow();
        }
        try (Connection connection = connection()) {
            assertBaselineHistory(connection);
            assertThat(scalar(connection, "SELECT COUNT(*) FROM flyway_schema_history WHERE success = 1"))
                    .isEqualTo(2);
            assertThat(scalar(connection,
                    "SELECT IS_FREE_LOCK('sindopoly:database-compatibility')")).isEqualTo(1);
        }
    }

    private Flyway flyway() {
        return Flyway.configure()
                .dataSource(MARIADB.getJdbcUrl(), MARIADB.getUsername(), MARIADB.getPassword())
                .locations("classpath:db/migration")
                .baselineVersion(MigrationVersion.fromVersion("1"))
                .baselineDescription("Validated legacy Sindopoly schema")
                .baselineOnMigrate(false)
                .validateOnMigrate(true)
                .load();
    }

    private void resetToHistoricalFixture() throws Exception {
        resetSchema();
        Path fixture = Path.of("..", "MariaDB", "init.sql").toAbsolutePath();
        try (Connection connection = connection()) {
            executeScript(connection, Files.readString(fixture, StandardCharsets.UTF_8));
        }
    }

    private void resetSchema() throws Exception {
        try (Connection connection = connection(); Statement statement = connection.createStatement()) {
            statement.execute("SET FOREIGN_KEY_CHECKS = 0");
            List<String> tables = new ArrayList<>();
            try (ResultSet rows = statement.executeQuery("""
                    SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
                    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
                    """)) {
                while (rows.next()) tables.add(rows.getString(1));
            }
            for (String table : tables) statement.execute("DROP TABLE `" + table.replace("`", "``") + "`");
            statement.execute("SET FOREIGN_KEY_CHECKS = 1");
        }
    }

    private void executeScript(Connection connection, String script) throws Exception {
        String delimiter = ";";
        StringBuilder sql = new StringBuilder();
        for (String line : script.split("\\R", -1)) {
            String trimmed = line.trim();
            if (trimmed.toUpperCase().startsWith("DELIMITER ")) {
                delimiter = trimmed.substring("DELIMITER ".length()).trim();
                continue;
            }
            sql.append(line).append('\n');
            if (!trimmed.endsWith(delimiter)) continue;
            int end = sql.lastIndexOf(delimiter);
            String statement = sql.substring(0, end).trim();
            sql.setLength(0);
            if (!statement.isBlank()) execute(connection, statement);
        }
        if (!sql.toString().isBlank()) throw new IllegalStateException("Unterminated historical SQL fixture");
    }

    private void dropStatsInvariant(Connection connection) throws Exception {
        execute(connection, "CREATE INDEX idx_stats_player_legacy ON stats (player)");
        execute(connection, "ALTER TABLE stats DROP INDEX uq_stats_player");
        execute(connection, "ALTER TABLE stats MODIFY COLUMN player INT NULL");
    }

    private void assertBaselineHistory(Connection connection) throws Exception {
        assertThat(scalar(connection, """
                SELECT COUNT(*) FROM flyway_schema_history
                WHERE version = '1' AND description = 'Validated legacy Sindopoly schema'
                  AND type = 'BASELINE' AND success = 1
                """)).isEqualTo(1);
    }

    private boolean hasHistory(Connection connection) throws Exception {
        return scalar(connection, """
                SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'flyway_schema_history'
                """) == 1;
    }

    private Connection connection() throws Exception {
        return DriverManager.getConnection(MARIADB.getJdbcUrl(), MARIADB.getUsername(), MARIADB.getPassword());
    }

    private static void execute(Connection connection, String sql) throws Exception {
        try (Statement statement = connection.createStatement()) {
            statement.execute(sql);
        }
    }

    private static int scalar(Connection connection, String sql) throws Exception {
        try (Statement statement = connection.createStatement(); ResultSet rows = statement.executeQuery(sql)) {
            rows.next();
            return rows.getInt(1);
        }
    }

    private static java.math.BigDecimal decimal(Connection connection, String sql) throws Exception {
        try (Statement statement = connection.createStatement(); ResultSet rows = statement.executeQuery(sql)) {
            rows.next();
            return rows.getBigDecimal(1);
        }
    }

    private static String escaped(String value) {
        return value.replace("'", "''");
    }
}
