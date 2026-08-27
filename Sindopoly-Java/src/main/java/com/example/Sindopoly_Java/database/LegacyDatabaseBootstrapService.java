package com.example.Sindopoly_Java.database;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Temporary, fail-closed bridge for recognized pre-Flyway Sindopoly schemas.
 * It is never invoked after Flyway history exists.
 */
@Component
public class LegacyDatabaseBootstrapService {

    static final String LOCK_NAME = "sindopoly:database-compatibility";
    static final String HISTORY_TABLE = "flyway_schema_history";
    static final String PAY_TWENTY_DESCRIPTION =
            "Πρέπει να αγοράσεις εξαρτήματα για εργαστήριο ηλεκτρονικής. Πλήρωσε $20.";

    private static final Set<String> REQUIRED_LEGACY_TABLES = Set.of("player", "card", "square", "stats");
    private static final Set<String> RECOGNIZED_TABLES = Set.of(
            "player", "card", "square", "stats", "game_finalization");
    private static final String EXPECTED_CARD_DIGEST =
            "cd84068807ac583bb1d9ab5d893916a218989688c0b4fcc2e0b4b41290e10d76";
    private static final String EXPECTED_SQUARE_DIGEST =
            "06b334f0ca5333677982be33f74fe500d6e33e7ddfd2e9e022aa78f1b881cf87";

    public boolean isMariaDb(Connection connection) throws SQLException {
        return "MariaDB".equalsIgnoreCase(connection.getMetaData().getDatabaseProductName());
    }

    public boolean hasFlywayHistory(Connection connection) throws SQLException {
        return tableNames(connection).contains(HISTORY_TABLE);
    }

    public boolean isEmpty(Connection connection) throws SQLException {
        return tableNames(connection).isEmpty();
    }

    public void withCompatibilityLock(Connection connection, SqlWork work) throws SQLException {
        if (!acquireLock(connection)) {
            throw new IllegalStateException("Timed out coordinating Sindopoly legacy database bootstrap");
        }
        Throwable primaryFailure = null;
        try {
            work.run();
        } catch (SQLException | RuntimeException | Error exception) {
            primaryFailure = exception;
            throw exception;
        } finally {
            try {
                releaseLock(connection);
            } catch (SQLException releaseFailure) {
                if (primaryFailure != null) {
                    primaryFailure.addSuppressed(releaseFailure);
                } else {
                    throw releaseFailure;
                }
            }
        }
    }

    /** Repairs only approved historical states and then proves V1 equivalence. */
    public void prepareAndValidate(Connection connection) throws SQLException {
        recognizeLegacySchema(connection);
        validateCoreStructure(connection, false);
        ensureStatsInvariant(connection);
        ensureFinalizationTable(connection);
        correctKnownPayTwentyAmount(connection);
        validateCoreStructure(connection, true);
        validateReferenceData(connection);
    }

    private void recognizeLegacySchema(Connection connection) throws SQLException {
        Set<String> tables = tableNames(connection);
        if (!tables.containsAll(REQUIRED_LEGACY_TABLES)) {
            throw incompatibleSchema("required Sindopoly tables are missing: " + difference(REQUIRED_LEGACY_TABLES, tables));
        }
        Set<String> unknown = difference(tables, RECOGNIZED_TABLES);
        if (!unknown.isEmpty()) {
            throw incompatibleSchema("unknown tables prevent safe baseline: " + unknown);
        }
    }

    private void validateCoreStructure(Connection connection, boolean requireV1Invariant) throws SQLException {
        validateColumns(connection, "player", Map.of(
                "id", column("int", false, null),
                "p_name", column("varchar", true, 255L),
                "created_at", column("timestamp", true, null)));
        validateColumns(connection, "card", Map.of(
                "id", column("smallint", false, null),
                "title", column("varchar", true, 200L),
                "description", column("varchar", true, 1000L),
                "type", column("enum", true, null),
                "amount", column("float", true, null)));
        validateColumns(connection, "square", Map.of(
                "id", column("tinyint", false, null),
                "s_type", column("enum", true, null),
                "price", column("smallint", true, null),
                "rent", column("smallint", true, null)));
        validateColumns(connection, "stats", Map.of(
                "id", column("int", false, null),
                "player", column("int", requireV1Invariant ? false : null, null),
                "total_wins", column("int", true, null),
                "total_losses", column("int", true, null),
                "total_games", column("int", true, null),
                "total_money", column("int", true, null),
                "total_time_played", column("int", true, null)));

        validatePrimaryKey(connection, "player", List.of("id"));
        validatePrimaryKey(connection, "card", List.of("id"));
        validatePrimaryKey(connection, "square", List.of("id"));
        validatePrimaryKey(connection, "stats", List.of("id"));
        validateStatsForeignKey(connection);
        validateStatsTrigger(connection);

        if (requireV1Invariant) {
            validateFinalizationTable(connection);
            if (!hasUniquePlayerIndex(connection)) {
                throw incompatibleSchema("stats.player is not protected by UNIQUE KEY uq_stats_player");
            }
        }
    }

    private void validateColumns(Connection connection, String table, Map<String, ExpectedColumn> expected)
            throws SQLException {
        Map<String, ActualColumn> actual = new LinkedHashMap<>();
        try (PreparedStatement statement = connection.prepareStatement("""
                SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, CHARACTER_MAXIMUM_LENGTH
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION
                """)) {
            statement.setString(1, table);
            try (ResultSet rows = statement.executeQuery()) {
                while (rows.next()) {
                    Long length = rows.getObject(4) == null ? null : rows.getLong(4);
                    actual.put(rows.getString(1).toLowerCase(Locale.ROOT),
                            new ActualColumn(rows.getString(2).toLowerCase(Locale.ROOT),
                                    "YES".equalsIgnoreCase(rows.getString(3)), length));
                }
            }
        }
        if (!actual.keySet().equals(expected.keySet())) {
            throw incompatibleSchema(table + " columns differ; expected=" + expected.keySet()
                    + ", actual=" + actual.keySet());
        }
        for (Map.Entry<String, ExpectedColumn> entry : expected.entrySet()) {
            ActualColumn column = actual.get(entry.getKey());
            ExpectedColumn requirement = entry.getValue();
            if (!requirement.type().equals(column.type())
                    || requirement.nullable() != null && requirement.nullable() != column.nullable()
                    || requirement.length() != null && !requirement.length().equals(column.length())) {
                throw incompatibleSchema(table + "." + entry.getKey() + " has incompatible definition");
            }
        }
    }

    private void validatePrimaryKey(Connection connection, String table, List<String> expected) throws SQLException {
        List<String> columns = new ArrayList<>();
        try (PreparedStatement statement = connection.prepareStatement("""
                SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY'
                ORDER BY ORDINAL_POSITION
                """)) {
            statement.setString(1, table);
            try (ResultSet rows = statement.executeQuery()) {
                while (rows.next()) columns.add(rows.getString(1).toLowerCase(Locale.ROOT));
            }
        }
        if (!columns.equals(expected)) throw incompatibleSchema(table + " primary key differs: " + columns);
    }

    private void validateStatsForeignKey(Connection connection) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("""
                SELECT COUNT(*) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stats' AND COLUMN_NAME = 'player'
                  AND REFERENCED_TABLE_NAME = 'player' AND REFERENCED_COLUMN_NAME = 'id'
                """); ResultSet result = statement.executeQuery()) {
            result.next();
            if (result.getInt(1) != 1) throw incompatibleSchema("stats.player foreign key is missing or ambiguous");
        }
    }

    private void validateStatsTrigger(Connection connection) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("""
                SELECT COUNT(*) FROM INFORMATION_SCHEMA.TRIGGERS
                WHERE TRIGGER_SCHEMA = DATABASE() AND TRIGGER_NAME = 'trg_player_after_insert'
                  AND EVENT_OBJECT_TABLE = 'player' AND ACTION_TIMING = 'AFTER' AND EVENT_MANIPULATION = 'INSERT'
                """); ResultSet result = statement.executeQuery()) {
            result.next();
            if (result.getInt(1) != 1) throw incompatibleSchema("canonical player-to-stats trigger is missing");
        }
    }

    private void ensureFinalizationTable(Connection connection) throws SQLException {
        if (!tableNames(connection).contains("game_finalization")) {
            try (Statement statement = connection.createStatement()) {
                statement.execute("""
                        CREATE TABLE game_finalization (
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
    }

    private void validateFinalizationTable(Connection connection) throws SQLException {
        validateColumns(connection, "game_finalization", Map.of(
                "finalization_id", column("char", false, 36L),
                "game_id", column("int", false, null),
                "game_created_at_epoch_ms", column("bigint", false, null),
                "winner_player_id", column("int", false, null),
                "completed_at_epoch_ms", column("bigint", false, null)));
        validatePrimaryKey(connection, "game_finalization", List.of("finalization_id"));
        if (!hasExactUniqueIndex(connection, "game_finalization", "uq_game_finalization_instance",
                List.of("game_id", "game_created_at_epoch_ms"))) {
            throw incompatibleSchema("game_finalization game identity uniqueness is missing");
        }
    }

    private void ensureStatsInvariant(Connection connection) throws SQLException {
        ColumnDefinition playerColumn = playerColumn(connection);
        List<Integer> nullOwners = ids(connection, "SELECT id FROM stats WHERE player IS NULL ORDER BY id LIMIT 20");
        if (!nullOwners.isEmpty()) throw incompatibleStats("NULL player ownership", nullOwners);
        List<Integer> orphanOwners = ids(connection, """
                SELECT DISTINCT s.player FROM stats s LEFT JOIN player p ON p.id = s.player
                WHERE s.player IS NOT NULL AND p.id IS NULL ORDER BY s.player LIMIT 20
                """);
        if (!orphanOwners.isEmpty()) throw incompatibleStats("references to missing players", orphanOwners);

        Map<Integer, List<StatsRow>> duplicates = duplicateRows(connection);
        List<Integer> ambiguous = duplicates.entrySet().stream()
                .filter(entry -> entry.getValue().stream().filter(row -> !row.zero()).count() > 1)
                .map(Map.Entry::getKey).limit(20).toList();
        if (!ambiguous.isEmpty()) {
            throw incompatibleStats("multiple populated rows; automatic merge refused", ambiguous);
        }
        for (List<StatsRow> rows : duplicates.values()) {
            StatsRow retained = rows.stream().filter(row -> !row.zero()).findFirst().orElse(rows.get(0));
            for (StatsRow row : rows) if (row.id() != retained.id()) deleteStats(connection, row.id());
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
    }

    private void correctKnownPayTwentyAmount(Connection connection) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("""
                UPDATE card SET amount = -20
                WHERE type = 'money' AND amount = 20 AND title = 'Community Chest' AND description = ?
                """)) {
            statement.setString(1, PAY_TWENTY_DESCRIPTION);
            if (statement.executeUpdate() > 1) throw incompatibleSchema("Pay-20 compatibility row is not unique");
        }
    }

    private void validateReferenceData(Connection connection) throws SQLException {
        String cardDigest = digest(connection,
                "SELECT id, title, description, type, amount FROM card ORDER BY id", 5, true);
        if (!EXPECTED_CARD_DIGEST.equals(cardDigest)) {
            throw incompatibleSchema("card reference data differs from canonical V1");
        }
        String squareDigest = digest(connection,
                "SELECT id, s_type, price, rent FROM square ORDER BY id", 4, false);
        if (!EXPECTED_SQUARE_DIGEST.equals(squareDigest)) {
            throw incompatibleSchema("square reference data differs from canonical V1");
        }
    }

    private String digest(Connection connection, String sql, int columns, boolean decimalLast) throws SQLException {
        StringBuilder canonical = new StringBuilder();
        try (Statement statement = connection.createStatement(); ResultSet rows = statement.executeQuery(sql)) {
            while (rows.next()) {
                for (int column = 1; column <= columns; column++) {
                    if (column > 1) canonical.append((char) 31);
                    Object value = rows.getObject(column);
                    if (value == null) canonical.append("<null>");
                    else if (decimalLast && column == columns) {
                        canonical.append(new BigDecimal(value.toString()).stripTrailingZeros().toPlainString());
                    } else canonical.append(value);
                }
                canonical.append('\n');
            }
        }
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256")
                    .digest(canonical.toString().getBytes(StandardCharsets.UTF_8));
            return java.util.HexFormat.of().formatHex(bytes);
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 is unavailable", impossible);
        }
    }

    private Set<String> tableNames(Connection connection) throws SQLException {
        Set<String> tables = new LinkedHashSet<>();
        try (Statement statement = connection.createStatement(); ResultSet rows = statement.executeQuery("""
                SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
                ORDER BY TABLE_NAME
                """)) {
            while (rows.next()) tables.add(rows.getString(1).toLowerCase(Locale.ROOT));
        }
        return tables;
    }

    private boolean acquireLock(Connection connection) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("SELECT GET_LOCK(?, 30)")) {
            statement.setString(1, LOCK_NAME);
            try (ResultSet result = statement.executeQuery()) {
                return result.next() && result.getInt(1) == 1;
            }
        }
    }

    private void releaseLock(Connection connection) throws SQLException {
        SQLException releaseFailure = null;
        try (PreparedStatement statement = connection.prepareStatement("SELECT RELEASE_LOCK(?)")) {
            statement.setString(1, LOCK_NAME);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next() || result.getObject(1) == null || result.getInt(1) != 1) {
                    releaseFailure = new SQLException("MariaDB did not confirm compatibility-lock release");
                }
            }
        } catch (SQLException exception) {
            releaseFailure = exception;
        }
        if (releaseFailure != null) {
            try {
                // Hikari close returns the session to the pool; abort instead so
                // a failed RELEASE_LOCK cannot leak a session-scoped named lock.
                connection.abort(Runnable::run);
            } catch (SQLException abortFailure) {
                releaseFailure.addSuppressed(abortFailure);
            }
            throw releaseFailure;
        }
    }

    private ColumnDefinition playerColumn(Connection connection) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("""
                SELECT COLUMN_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stats' AND COLUMN_NAME = 'player'
                """); ResultSet result = statement.executeQuery()) {
            if (!result.next()) throw incompatibleSchema("stats.player is missing");
            return new ColumnDefinition(result.getString(1), "YES".equalsIgnoreCase(result.getString(2)));
        }
    }

    private boolean hasUniquePlayerIndex(Connection connection) throws SQLException {
        return hasExactUniqueIndex(connection, "stats", "uq_stats_player", List.of("player"));
    }

    private boolean hasExactUniqueIndex(Connection connection, String table, String index, List<String> expected)
            throws SQLException {
        List<String> columns = new ArrayList<>();
        try (PreparedStatement statement = connection.prepareStatement("""
                SELECT COLUMN_NAME, NON_UNIQUE FROM INFORMATION_SCHEMA.STATISTICS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?
                ORDER BY SEQ_IN_INDEX
                """)) {
            statement.setString(1, table);
            statement.setString(2, index);
            try (ResultSet rows = statement.executeQuery()) {
                while (rows.next()) {
                    if (rows.getInt(2) != 0) return false;
                    columns.add(rows.getString(1).toLowerCase(Locale.ROOT));
                }
            }
        }
        return columns.equals(expected);
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

    private static <T> Set<T> difference(Set<T> left, Set<T> right) {
        Set<T> result = new LinkedHashSet<>(left);
        result.removeAll(right);
        return result;
    }

    private DataIntegrityViolationException incompatibleStats(String reason, List<Integer> playerIds) {
        return new DataIntegrityViolationException(
                "Stats legacy bootstrap failed: " + reason + "; affected player IDs=" + playerIds);
    }

    private IllegalStateException incompatibleSchema(String reason) {
        return new IllegalStateException("Unrecognized or unsafe Sindopoly legacy schema: " + reason);
    }

    private static ExpectedColumn column(String type, Boolean nullable, Long length) {
        return new ExpectedColumn(type, nullable, length);
    }

    @FunctionalInterface
    public interface SqlWork {
        void run() throws SQLException;
    }

    private record ExpectedColumn(String type, Boolean nullable, Long length) { }
    private record ActualColumn(String type, boolean nullable, Long length) { }
    private record ColumnDefinition(String columnType, boolean nullable) { }
    private record StatsRow(int id, List<Integer> metrics) {
        boolean zero() {
            return metrics.stream().allMatch(value -> value != null && value == 0);
        }
    }
}
