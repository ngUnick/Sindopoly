package com.example.Sindopoly_Java.integration;

import com.example.Sindopoly_Java.service.GameLoopScheduler;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.redis.connection.RedisConnection;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.MariaDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.assertj.core.api.Assertions.assertThat;

/** Proves the production Flyway-before-Hibernate path against an empty MariaDB 10.11 database. */
@SpringBootTest
@ActiveProfiles("integration")
@Testcontainers
class FreshDatabaseMigrationIT {

    private static final int REDIS_PORT = 6379;

    @Container
    static final GenericContainer<?> REDIS = new GenericContainer<>("redis:7.0-alpine")
            .withExposedPorts(REDIS_PORT);

    @Container
    static final MariaDBContainer<?> MARIADB = new MariaDBContainer<>("mariadb:10.11")
            .withDatabaseName("sindopoly_fresh")
            .withUsername("sindopoly_test")
            .withPassword("sindopoly_test");

    @DynamicPropertySource
    static void containerProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", MARIADB::getJdbcUrl);
        registry.add("spring.datasource.username", MARIADB::getUsername);
        registry.add("spring.datasource.password", MARIADB::getPassword);
        registry.add("spring.datasource.driver-class-name", MARIADB::getDriverClassName);
        registry.add("spring.data.redis.host", REDIS::getHost);
        registry.add("spring.data.redis.port", () -> REDIS.getMappedPort(REDIS_PORT));
    }

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private Flyway flyway;

    @Autowired
    private StringRedisTemplate redis;

    @MockBean
    private GameLoopScheduler gameLoopScheduler;

    @Test
    void emptyDatabaseRunsSelfContainedV1BeforeHibernateValidation() {
        assertThat(jdbc.queryForObject("""
                SELECT COUNT(*) FROM flyway_schema_history
                WHERE version = '1' AND description = 'create sindopoly schema'
                  AND type = 'SQL' AND success = 1
                """, Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM player", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM stats", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM square", Integer.class)).isEqualTo(40);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM card", Integer.class)).isEqualTo(40);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM game_finalization", Integer.class)).isZero();

        jdbc.update("INSERT INTO player (p_name) VALUES ('FreshTrigger')");
        int playerId = jdbc.queryForObject("SELECT LAST_INSERT_ID()", Integer.class);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM stats WHERE player = ?", Integer.class, playerId))
                .isEqualTo(1);
    }

    @Test
    void repeatedManagedMigrationDoesNotDuplicateSchemaOrReferenceData() {
        int installed = flyway.info().applied().length;
        flyway.migrate();

        assertThat(flyway.info().applied()).hasSize(installed);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM square", Integer.class)).isEqualTo(40);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM card", Integer.class)).isEqualTo(40);
        try (RedisConnection connection = redis.getConnectionFactory().getConnection()) {
            assertThat(connection.serverCommands().dbSize()).isZero();
        }
    }
}
