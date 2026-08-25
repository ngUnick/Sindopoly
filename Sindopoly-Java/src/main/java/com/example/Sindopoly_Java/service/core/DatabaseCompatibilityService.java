package com.example.Sindopoly_Java.service.core;

import org.springframework.boot.autoconfigure.orm.jpa.HibernatePropertiesCustomizer;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Establishes the narrowly approved durable schema invariants before Hibernate schema update. */
@Component
public class DatabaseCompatibilityService implements HibernatePropertiesCustomizer {

    private static final String LOCK_NAME = "sindopoly:database-compatibility";
    private final DataSource dataSource;

    public DatabaseCompatibilityService(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public void customize(Map<String, Object> hibernateProperties) {
        ensureCompatibility();
    }

    public void ensureCompatibility() {
        try (Connection connection = dataSource.getConnection()) {
            if (!"MariaDB".equalsIgnoreCase(connection.getMetaData().getDatabaseProductName())) return;
            if (!acquireLock(connection)) {
                throw new IllegalStateException("Timed out coordinating Sindopoly database compatibility");
            }
            try {
                ensureFinalizationTable(connection);
                ensureStatsInvariant(connection);
            } finally {
                releaseLock(connection);
            }
        } catch (SQLException exception) {
            throw new IllegalStateException("Sindopoly database compatibility failed", exception);
        }
    }

    private boolean acquireLock(Connection connection) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("SELECT GET_LOCK(?, 30)")) {
            statement.setString(1, LOCK_NAME);
            try (ResultSet result = statement.executeQuery()) {
                return result.next() && result.getInt(1) == 1;
            }
        }
    }

    private void releaseLock(Connection connection) {
        try (PreparedStatement statement = connection.prepareStatement("SELECT RELEASE_LOCK(?)")) {
            statement.setString(1, LOCK_NAME);
            statement.executeQuery();
        } catch (SQLException ignored) {
            // The connection close also releases this startup-only advisory lock.
        }
    }

    private void ensureFinalizationTable(Connection connection) throws SQLException {
        try (Statement statement = connection.createStatement()) {
            statement.execute("""
                    CREATE TABLE IF NOT EXISTS game_finalization (
                      finalization_id CHAR(36) NOT NULL,
                      game_id INT NOT NULL,
                      game_created_at_epoch_ms BIGINT NOT NULL,
                      winner_player_id INT NOT NULL,
                      completed_at_epoch_ms BIGINT NOT NULL,
                      PRIMARY KEY (finalization_id),
                      UNIQUE KEY uq_game_finalization_instance (game_id, game_created_at_epoch_ms)
                    )
                    """);
        }
    }

    private void ensureStatsInvariant(Connection connection) throws SQLException {
        ColumnDefinition playerColumn = playerColumn(connection);
        List<Integer> nullOwners = ids(connection,
                "SELECT id FROM stats WHERE player IS NULL ORDER BY id LIMIT 20");
        if (!nullOwners.isEmpty()) {
            throw incompatible("NULL player ownership", nullOwners);
        }
        List<Integer> orphanOwners = ids(connection, """
                SELECT DISTINCT s.player FROM stats s LEFT JOIN player p ON p.id = s.player
                WHERE p.id IS NULL ORDER BY s.player LIMIT 20
                """);
        if (!orphanOwners.isEmpty()) {
            throw incompatible("references to missing players", orphanOwners);
        }

        Map<Integer, List<StatsRow>> duplicates = duplicateRows(connection);
        List<Integer> ambiguous = duplicates.entrySet().stream()
                .filter(entry -> entry.getValue().stream().filter(row -> !row.zero()).count() > 1)
                .map(Map.Entry::getKey).limit(20).toList();
        if (!ambiguous.isEmpty()) {
            // Zero rows are a known historical init artifact; populated rows are durable
            // history, so REVAMP-020 deliberately refuses to merge or choose between them.
            throw incompatible("multiple populated rows; automatic merge refused", ambiguous);
        }

        for (List<StatsRow> rows : duplicates.values()) {
            StatsRow retained = rows.stream().filter(row -> !row.zero()).findFirst().orElse(rows.get(0));
            for (StatsRow row : rows) if (row.id() != retained.id()) deleteStats(connection, row.id());
        }
        if (!ids(connection, "SELECT player FROM stats GROUP BY player HAVING COUNT(*) > 1 LIMIT 20").isEmpty()) {
            throw new IllegalStateException("Stats uniqueness compatibility failed after safe repair");
        }

        if (playerColumn.nullable()) {
            try (Statement statement = connection.createStatement()) {
                statement.execute("ALTER TABLE stats MODIFY COLUMN player " + playerColumn.columnType() + " NOT NULL");
            }
        }
        if (!hasUniquePlayerIndex(connection)) {
            try (Statement statement = connection.createStatement()) {
                statement.execute("ALTER TABLE stats ADD UNIQUE KEY uq_stats_player (player)");
            }
        }
        ColumnDefinition verified = playerColumn(connection);
        if (verified.nullable() || !hasUniquePlayerIndex(connection)) {
            throw new IllegalStateException("Stats uniqueness compatibility did not establish NOT NULL UNIQUE");
        }
    }

    private ColumnDefinition playerColumn(Connection connection) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("""
                SELECT COLUMN_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stats' AND COLUMN_NAME = 'player'
                """)) {
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) throw new IllegalStateException("Stats player column is missing");
                return new ColumnDefinition(result.getString(1), "YES".equalsIgnoreCase(result.getString(2)));
            }
        }
    }

    private boolean hasUniquePlayerIndex(Connection connection) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("""
                SELECT COUNT(*), MIN(COLUMN_NAME), MAX(NON_UNIQUE) FROM INFORMATION_SCHEMA.STATISTICS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stats'
                  AND INDEX_NAME = 'uq_stats_player'
                """)) {
            try (ResultSet result = statement.executeQuery()) {
                result.next();
                return result.getInt(1) == 1 && "player".equalsIgnoreCase(result.getString(2))
                        && result.getInt(3) == 0;
            }
        }
    }

    private Map<Integer, List<StatsRow>> duplicateRows(Connection connection) throws SQLException {
        Map<Integer, List<StatsRow>> result = new LinkedHashMap<>();
        try (Statement statement = connection.createStatement(); ResultSet rows = statement.executeQuery("""
                SELECT id, player, total_wins, total_losses, total_games, total_money, total_time_played
                FROM stats WHERE player IN (SELECT player FROM stats GROUP BY player HAVING COUNT(*) > 1)
                ORDER BY player, id
                """)) {
            while (rows.next()) {
                Integer[] metrics = new Integer[5];
                for (int index = 0; index < metrics.length; index++) {
                    int value = rows.getInt(index + 3);
                    metrics[index] = rows.wasNull() ? null : value;
                }
                StatsRow row = new StatsRow(rows.getInt(1), Arrays.asList(metrics));
                result.computeIfAbsent(rows.getInt(2), ignored -> new ArrayList<>()).add(row);
            }
        }
        return result;
    }

    private List<Integer> ids(Connection connection, String sql) throws SQLException {
        List<Integer> result = new ArrayList<>();
        try (Statement statement = connection.createStatement(); ResultSet rows = statement.executeQuery(sql)) {
            while (rows.next()) result.add(rows.getInt(1));
        }
        return result;
    }

    private void deleteStats(Connection connection, int statsId) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("DELETE FROM stats WHERE id = ?")) {
            statement.setInt(1, statsId);
            statement.executeUpdate();
        }
    }

    private DataIntegrityViolationException incompatible(String reason, List<Integer> playerIds) {
        return new DataIntegrityViolationException(
                "Stats uniqueness compatibility failed: " + reason + "; affected IDs=" + playerIds);
    }

    private record ColumnDefinition(String columnType, boolean nullable) { }

    private record StatsRow(int id, List<Integer> metrics) {
        boolean zero() {
            return metrics.stream().allMatch(value -> value != null && value == 0);
        }
    }
}
