package com.example.Sindopoly_Java.database;

import org.flywaydb.core.Flyway;
import org.springframework.boot.autoconfigure.flyway.FlywayMigrationStrategy;
import org.springframework.stereotype.Component;

import java.sql.Connection;
import java.sql.SQLException;

/**
 * Orders the one-time legacy bootstrap ahead of Flyway without making the
 * compatibility lock a permanent second migration lock.
 */
@Component
public class SindopolyFlywayMigrationStrategy implements FlywayMigrationStrategy {

    private final LegacyDatabaseBootstrapService legacyBootstrap;

    public SindopolyFlywayMigrationStrategy(LegacyDatabaseBootstrapService legacyBootstrap) {
        this.legacyBootstrap = legacyBootstrap;
    }

    @Override
    public void migrate(Flyway flyway) {
        try (Connection connection = flyway.getConfiguration().getDataSource().getConnection()) {
            if (!legacyBootstrap.isMariaDb(connection)
                    || legacyBootstrap.hasFlywayHistory(connection)
                    || legacyBootstrap.isEmpty(connection)) {
                flyway.migrate();
                return;
            }

            legacyBootstrap.withCompatibilityLock(connection, () -> {
                // Another instance may have completed the baseline while this
                // instance waited for the legacy-only advisory lock.
                if (!legacyBootstrap.hasFlywayHistory(connection)) {
                    legacyBootstrap.prepareAndValidate(connection);
                    flyway.baseline();
                }
            });
            flyway.migrate();
        } catch (SQLException exception) {
            throw new IllegalStateException("Sindopoly Flyway startup failed", exception);
        }
    }
}
