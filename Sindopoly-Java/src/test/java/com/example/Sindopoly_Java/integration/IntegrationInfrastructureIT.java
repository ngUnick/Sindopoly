package com.example.Sindopoly_Java.integration;

import com.jayway.jsonpath.JsonPath;
import com.example.Sindopoly_Java.repository.CardRepository;
import com.example.Sindopoly_Java.repository.PlayerRepository;
import com.example.Sindopoly_Java.repository.SquareRepository;
import com.example.Sindopoly_Java.repository.StatsRepository;
import com.example.Sindopoly_Java.exception.GameTransitionConflictException;
import com.example.Sindopoly_Java.service.transition.CommandMetadata;
import com.example.Sindopoly_Java.service.transition.GameTransitionPlan;
import com.example.Sindopoly_Java.service.transition.GameCommandService;
import com.example.Sindopoly_Java.service.transition.RedisGameTransitionStore;
import com.example.Sindopoly_Java.service.transition.TransitionExecution;
import com.example.Sindopoly_Java.service.transition.TurnCommandService;
import com.example.Sindopoly_Java.service.core.DiceService;
import com.example.Sindopoly_Java.service.transition.FinalizationFailureProbe;
import com.example.Sindopoly_Java.service.transition.GameFinalizationService;
import com.example.Sindopoly_Java.service.transition.GameLifecycleCommandService;
import com.example.Sindopoly_Java.service.transition.GameLifecycleProperties;
import com.example.Sindopoly_Java.service.transition.TerminalGameResult;
import com.example.Sindopoly_Java.service.GameLoopScheduler;
import com.example.Sindopoly_Java.model.dto.ThrowResultDto;
import com.example.Sindopoly_Java.model.dto.ActionResultDto;
import com.example.Sindopoly_Java.realtime.GameEventEnvelope;
import com.example.Sindopoly_Java.realtime.GameEventPublisher;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.data.redis.connection.RedisConnection;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.user.SimpUserRegistry;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.MariaDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.MountableFile;

import java.nio.file.Path;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.WebSocketHandshakeException;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.doReturn;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;

/**
 * Container-backed infrastructure baseline. The MariaDB container receives the
 * repository's existing initialization SQL, while Redis is emptied only through
 * its container connection before and after each test.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@ActiveProfiles("integration")
@Testcontainers
class IntegrationInfrastructureIT {

    @LocalServerPort
    private int serverPort;

    private static final int REDIS_PORT = 6379;

    @Container
    static final GenericContainer<?> REDIS = new GenericContainer<>("redis:7.0-alpine")
            .withExposedPorts(REDIS_PORT);

    @Container
    static final MariaDBContainer<?> MARIADB = new MariaDBContainer<>("mariadb:10.11")
            .withDatabaseName("sindopoly_test")
            .withUsername("sindopoly_test")
            .withPassword("sindopoly_test")
            .withCopyFileToContainer(
                    MountableFile.forHostPath(
                            Path.of("..", "MariaDB", "init.sql").toAbsolutePath()),
                    "/docker-entrypoint-initdb.d/init.sql");

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
    private StringRedisTemplate redis;

    @Autowired
    private PlayerRepository playerRepository;

    @Autowired
    private SquareRepository squareRepository;

    @Autowired
    private CardRepository cardRepository;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private RedisGameTransitionStore transitions;

    @Autowired
    private com.example.Sindopoly_Java.service.transition.RedisGameDiscovery discovery;

    @Autowired
    private TurnCommandService turnCommands;

    @Autowired
    private GameCommandService gameCommands;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private Flyway flyway;

    @Autowired
    private GameFinalizationService gameFinalization;

    @Autowired
    private GameLifecycleCommandService gameLifecycle;

    @Autowired
    private StatsRepository statsRepository;

    @MockBean
    private FinalizationFailureProbe finalizationFailureProbe;

    @MockBean
    private GameLoopScheduler gameLoopScheduler;

    @SpyBean
    private SimpMessagingTemplate broker;

    @SpyBean
    private DiceService applicationDice;

    @Autowired
    private SimpUserRegistry simpUsers;

    @BeforeEach
    @AfterEach
    void clearDedicatedRedisContainer() {
        reset(applicationDice);
        // Dynamic properties above make this safe: this never targets localhost
        // or a developer/shared Redis instance.
        try (RedisConnection connection = redis.getConnectionFactory().getConnection()) {
            connection.serverCommands().flushDb();
        }
    }

    @Test
    void realWebSocketHandshakeRequiresAnAuthenticatedHttpSession() {
        URI endpoint = URI.create("ws://127.0.0.1:" + serverPort + "/ws/websocket");

        assertThatThrownBy(() -> HttpClient.newHttpClient().newWebSocketBuilder()
                .buildAsync(endpoint, new java.net.http.WebSocket.Listener() { }).join())
                .hasCauseInstanceOf(WebSocketHandshakeException.class);
    }

    @Test
    void realWebSocketHandshakeRejectsAnUnlistedOriginWithAValidSession() throws Exception {
        try (GameBoundaryClient player = GameBoundaryClient.create(
                baseUri(), objectMapper, uniqueName("WsOrigin"))) {
            assertThatThrownBy(() -> player.connect("https://attacker.example"))
                    .isInstanceOf(java.util.concurrent.ExecutionException.class);
        }
    }

    @Test
    void cursorDiscoveryTraversesMultipleBatchesAndRejectsNonCanonicalKeys() {
        java.util.Set<Integer> expected = new java.util.TreeSet<>();
        for (int gameId = 10_000; gameId < 10_512; gameId++) {
            expected.add(gameId);
            redis.opsForHash().put("game:" + gameId, "status", "lobby");
            redis.opsForSet().add("game:" + gameId + ":players", "77");
            redis.opsForHash().put("game:" + gameId + ":commands", "command", "record");
        }
        redis.opsForHash().put("game:0", "status", "lobby");
        redis.opsForHash().put("game:000009", "status", "lobby");
        redis.opsForHash().put("game:not-a-number", "status", "lobby");
        redis.opsForHash().put("game:2147483648", "status", "lobby");
        redis.opsForValue().set("unrelated:key", "value");
        redis.execute((org.springframework.data.redis.core.RedisCallback<Void>) connection -> {
            connection.serverCommands().resetConfigStats();
            return null;
        });

        assertThat(discovery.activeGameIds()).containsExactlyElementsOf(expected);
        assertThat(discovery.isPlayerInAnyGame(77)).isTrue();

        java.util.Properties commandStats = redis.execute(
                (org.springframework.data.redis.core.RedisCallback<java.util.Properties>)
                        connection -> connection.serverCommands().info("commandstats"));
        assertThat(commandStats).doesNotContainKey("cmdstat_keys");
        assertThat(commandCalls(commandStats, "cmdstat_scan")).isGreaterThan(2);
    }

    private long commandCalls(java.util.Properties commandStats, String command) {
        String value = commandStats.getProperty(command);
        if (value == null) return 0;
        for (String field : value.split(",")) {
            if (field.startsWith("calls=")) return Long.parseLong(field.substring("calls=".length()));
        }
        return 0;
    }

    @Test
    void realStompRejectsNonMemberMalformedSubscriptionsAndClientSends() throws Exception {
        URI base = baseUri();
        try (GameBoundaryClient host = GameBoundaryClient.create(base, objectMapper, uniqueName("WsHost"));
             GameBoundaryClient outsider = GameBoundaryClient.create(base, objectMapper, uniqueName("WsOut"));
             GameBoundaryClient stale = GameBoundaryClient.create(base, objectMapper, uniqueName("WsStale"))) {
            assertThat(host.post("/api/game-state/create",
                    "{\"ownerId\":" + host.playerId() + ",\"visibility\":\"public\"}",
                    UUID.randomUUID(), -1).status()).isEqualTo(200);

            try (GameBoundaryClient.RealtimeConnection denied = outsider.connect()) {
                denied.subscribeUnchecked("/topic/game/" + host.playerId());
                assertThat(denied.awaitFailure()).isNotNull();
            }
            for (String destination : List.of(
                    "/topic/game/not-a-number", "/topic/game/7/private", "/topic/game/0")) {
                try (GameBoundaryClient.RealtimeConnection malformed = host.connect()) {
                    malformed.subscribeUnchecked(destination);
                    assertThat(malformed.awaitFailure()).isNotNull();
                }
            }
            try (GameBoundaryClient.RealtimeConnection sender = host.connect()) {
                sender.send("/app/game/" + host.playerId());
                assertThat(sender.awaitFailure()).isNotNull();
            }

            jdbc.update("DELETE FROM stats WHERE player = ?", stale.playerId());
            jdbc.update("DELETE FROM player WHERE id = ?", stale.playerId());
            assertThatThrownBy(stale::connect)
                    .isInstanceOf(java.util.concurrent.ExecutionException.class);
        }
    }

    @Test
    void revokedMembershipStopsOutboundDeliveryAndSnapshotAccess() throws Exception {
        URI base = baseUri();
        try (GameBoundaryClient host = GameBoundaryClient.create(base, objectMapper, uniqueName("RevokeHost"));
             GameBoundaryClient member = GameBoundaryClient.create(base, objectMapper, uniqueName("RevokeMember"))) {
            int gameId = host.playerId();
            assertThat(host.post("/api/game-state/create",
                    "{\"ownerId\":" + gameId + ",\"visibility\":\"public\"}",
                    UUID.randomUUID(), -1).status()).isEqualTo(200);
            assertThat(member.post("/api/game-state/add/" + gameId + "/" + member.playerId(), null,
                    UUID.randomUUID(), 0).status()).isEqualTo(200);

            try (GameBoundaryClient.RealtimeConnection hostEvents = host.connect();
                 GameBoundaryClient.RealtimeConnection memberEvents = member.connect()) {
                hostEvents.subscribe("/topic/game/" + gameId);
                awaitSubscriptions("/topic/game/" + gameId, 1);
                memberEvents.subscribe("/topic/game/" + gameId);
                awaitSubscriptions("/topic/game/" + gameId, 2);
                hostEvents.clearEvents();
                memberEvents.clearEvents();

                assertThat(member.post("/api/game-state/" + gameId + "/remove-player?playerId="
                        + member.playerId(), null, UUID.randomUUID(), 1).status()).isEqualTo(200);
                assertThat(hostEvents.await(event -> event.stateVersion() == 2
                        && event.payload().reason().name().equals("PLAYER_LEFT"))).isNotNull();
                assertThat(memberEvents.receivesAny(Duration.ofMillis(750))).isFalse();
                assertThat(member.get("/api/game-state/" + gameId + "/snapshot").status()).isEqualTo(403);
            }
        }
    }

    @Test
    void realHttpStompAndStoresCoverCriticalFlowReplayRecoveryAndCompletion() throws Exception {
        URI base = baseUri();
        try (GameBoundaryClient host = GameBoundaryClient.create(base, objectMapper, uniqueName("FlowHost"));
             GameBoundaryClient member = GameBoundaryClient.create(base, objectMapper, uniqueName("FlowMember"));
             GameBoundaryClient outsider = GameBoundaryClient.create(base, objectMapper, uniqueName("FlowOut"))) {
            int gameId = host.playerId();
            var anonymousMutation = HttpClient.newHttpClient().send(
                    HttpRequest.newBuilder(base.resolve("/api/game-state/create"))
                            .header("Content-Type", "application/json")
                            .POST(HttpRequest.BodyPublishers.ofString(
                                    "{\"ownerId\":" + gameId + ",\"visibility\":\"public\"}"))
                            .build(), java.net.http.HttpResponse.BodyHandlers.ofString());
            assertThat(anonymousMutation.statusCode()).isIn(401, 403);
            assertThat(host.post("/api/game-state/create",
                    "{\"ownerId\":" + member.playerId() + ",\"visibility\":\"public\"}",
                    UUID.randomUUID(), -1).status()).isEqualTo(403);

            assertThat(host.post("/api/game-state/create",
                    "{\"ownerId\":" + gameId + ",\"visibility\":\"public\"}",
                    UUID.randomUUID(), -1).status()).isEqualTo(200);
            var anonymousSnapshot = HttpClient.newHttpClient().send(
                    HttpRequest.newBuilder(base.resolve("/api/game-state/" + gameId + "/snapshot"))
                            .GET().build(), java.net.http.HttpResponse.BodyHandlers.ofString());
            assertThat(anonymousSnapshot.statusCode()).isIn(401, 403);
            assertThat(outsider.get("/api/game-state/" + gameId + "/snapshot").status()).isEqualTo(403);

            try (GameBoundaryClient.RealtimeConnection hostEvents = host.connect()) {
                hostEvents.subscribe("/topic/game/" + gameId);
                awaitSubscriptions("/topic/game/" + gameId, 1);
                assertThat(member.post("/api/game-state/add/" + gameId + "/" + member.playerId(), null,
                        UUID.randomUUID(), 0).status()).isEqualTo(200);
                assertThat(hostEvents.await(event -> event.stateVersion() == 1
                        && event.payload().reason().name().equals("PLAYER_JOINED"))).isNotNull();

                try (GameBoundaryClient.RealtimeConnection memberEvents = member.connect()) {
                    memberEvents.subscribe("/topic/game/" + gameId);
                    awaitSubscriptions("/topic/game/" + gameId, 2);
                    hostEvents.clearEvents();
                    memberEvents.clearEvents();

                    assertThat(member.post("/api/game-state/" + gameId + "/start?playerId="
                            + member.playerId(), null, UUID.randomUUID(), 1).status()).isEqualTo(403);
                    assertNoEvents(hostEvents, memberEvents);

                    assertThat(host.post("/api/game-state/" + gameId + "/start?playerId=" + gameId,
                            null, UUID.randomUUID(), 1).status()).isEqualTo(200);
                    assertEventOnBoth(hostEvents, memberEvents, gameId, 2, "GAME_STARTED", "GAME_STARTED");
                    JsonNode started = host.get("/api/game-state/" + gameId + "/snapshot").json();
                    assertThat(started.path("stateVersion").asLong()).isEqualTo(2);
                    assertThat(started.path("status").asText()).isEqualTo("inProgress");
                    assertThat(started.path("playerTurn").asInt()).isEqualTo(gameId);
                    assertThat(started.path("players").get(0).path("playerId").asInt()).isEqualTo(gameId);
                    assertThat(started.path("players").get(1).path("playerId").asInt()).isEqualTo(member.playerId());

                    assertThat(member.post("/api/turn/" + gameId + "/" + member.playerId() + "/throw",
                            null, UUID.randomUUID(), 2).status()).isEqualTo(403);
                    assertNoEvents(hostEvents, memberEvents);

                    doReturn(3).when(applicationDice).roll();
                    UUID rollId = UUID.randomUUID();
                    var executor = Executors.newFixedThreadPool(2);
                    List<GameBoundaryClient.ApiResponse> duplicateRolls;
                    try {
                        var requests = List.<Callable<GameBoundaryClient.ApiResponse>>of(
                                () -> host.post("/api/turn/" + gameId + "/" + gameId + "/throw",
                                        null, rollId, 2),
                                () -> host.post("/api/turn/" + gameId + "/" + gameId + "/throw",
                                        null, rollId, 2));
                        duplicateRolls = executor.invokeAll(requests).stream().map(future -> {
                            try { return future.get(); }
                            catch (Exception exception) { throw new RuntimeException(exception); }
                        }).toList();
                    } finally {
                        executor.shutdownNow();
                    }
                    assertThat(duplicateRolls).allMatch(response -> response.status() == 200);
                    assertThat(duplicateRolls.stream().filter(response -> response.json().path("replayed").asBoolean()).count())
                            .isEqualTo(1);
                    assertEventOnBoth(hostEvents, memberEvents, gameId, 3, "TURN_UPDATED", "ROLL_COMPLETED");
                    JsonNode purchase = host.get("/api/game-state/" + gameId + "/snapshot").json();
                    assertThat(purchase.path("stateVersion").asLong()).isEqualTo(3);
                    assertThat(purchase.path("optionalAction").path("type").asText())
                            .isEqualTo("PURCHASE_PROPERTY");
                    assertThat(purchase.path("optionalAction").path("playerId").asInt()).isEqualTo(gameId);
                    assertNoEvents(hostEvents, memberEvents);

                    assertThat(host.post("/api/turn/" + gameId + "/" + gameId + "/pass",
                            null, UUID.randomUUID(), 2).status()).isEqualTo(409);
                    assertThat(host.post("/api/turn/" + gameId + "/" + gameId + "/pass",
                            null, rollId, 3).status()).isEqualTo(409);
                    assertNoEvents(hostEvents, memberEvents);

                    assertThat(host.post("/api/turn/" + gameId + "/" + gameId + "/pass",
                            null, UUID.randomUUID(), 3).status()).isEqualTo(200);
                    assertEventOnBoth(hostEvents, memberEvents, gameId, 4, "TURN_UPDATED", "ACTION_RESOLVED");
                    JsonNode declined = member.get("/api/game-state/" + gameId + "/snapshot").json();
                    assertThat(declined.path("stateVersion").asLong()).isEqualTo(4);
                    assertThat(declined.path("playerTurn").asInt()).isEqualTo(member.playerId());
                    assertThat(declined.path("optionalAction").isNull()).isTrue();
                    assertThat(declined.path("players").get(0).path("properties").isEmpty()).isTrue();

                    memberEvents.close();
                    awaitSubscriptions("/topic/game/" + gameId, 1);
                    assertThat(member.post("/api/turn/" + gameId + "/" + member.playerId() + "/throw",
                            null, UUID.randomUUID(), 4).status()).isEqualTo(200);
                    assertEvent(hostEvents, gameId, 5, "TURN_UPDATED", "ROLL_COMPLETED");
                    hostEvents.clearEvents();

                    try (GameBoundaryClient.RealtimeConnection recovered = member.connect()) {
                        recovered.subscribe("/topic/game/" + gameId);
                        awaitSubscriptions("/topic/game/" + gameId, 2);
                        assertThat(member.get("/api/game-state/" + gameId + "/snapshot").json()
                                .path("stateVersion").asLong()).isEqualTo(5);
                        hostEvents.clearEvents();
                        recovered.clearEvents();

                        assertThat(member.post("/api/turn/" + gameId + "/" + member.playerId() + "/pass",
                                null, UUID.randomUUID(), 5).status()).isEqualTo(200);
                        assertEventOnBoth(hostEvents, recovered, gameId, 6, "TURN_UPDATED", "ACTION_RESOLVED");

                        // The scheduler is the production end-game trigger; only its threshold precondition is seeded.
                        redis.opsForHash().put("player:" + gameId, "money", "5000");
                        assertThat(gameLifecycle.processScheduledGame(gameId)).isTrue();
                        assertEventOnBoth(hostEvents, recovered, gameId, 7, "GAME_COMPLETED", "GAME_COMPLETED");
                        // Terminal games report handled while retrying durable finalization, but never republish.
                        assertThat(gameLifecycle.processScheduledGame(gameId)).isTrue();
                        assertNoEvents(hostEvents, recovered);
                        JsonNode terminal = host.get("/api/game-state/" + gameId + "/snapshot").json();
                        assertThat(terminal.path("stateVersion").asLong()).isEqualTo(7);
                        assertThat(terminal.path("status").asText()).isEqualTo("ended");
                        assertThat(terminal.path("winner").asInt()).isEqualTo(gameId);
                        assertThat(jdbc.queryForObject(
                                "SELECT COUNT(*) FROM game_finalization WHERE game_id = ?",
                                Integer.class, gameId)).isEqualTo(1);
                        assertThat(jdbc.queryForObject(
                                "SELECT total_games FROM stats WHERE player = ?",
                                Integer.class, gameId)).isEqualTo(1);
                        assertThat(jdbc.queryForObject(
                                "SELECT total_wins FROM stats WHERE player = ?",
                                Integer.class, gameId)).isEqualTo(1);
                        assertThat(jdbc.queryForObject(
                                "SELECT total_losses FROM stats WHERE player = ?",
                                Integer.class, member.playerId())).isEqualTo(1);
                    }
                }
            }
        }
    }

    private URI baseUri() {
        return URI.create("http://127.0.0.1:" + serverPort);
    }

    private String uniqueName(String prefix) {
        String boundedPrefix = prefix.substring(0, Math.min(prefix.length(), 6));
        return boundedPrefix + UUID.randomUUID().toString().replace("-", "").substring(0, 8);
    }

    private void assertEventOnBoth(GameBoundaryClient.RealtimeConnection first,
                                   GameBoundaryClient.RealtimeConnection second,
                                   int gameId, long version, String eventType,
                                   String reason) throws Exception {
        assertEvent(first, gameId, version, eventType, reason);
        assertEvent(second, gameId, version, eventType, reason);
    }

    private void assertEvent(GameBoundaryClient.RealtimeConnection connection, int gameId,
                             long version, String eventType, String reason) throws Exception {
        GameEventEnvelope event = connection.await(candidate -> candidate.stateVersion() == version
                && candidate.payload().reason().name().equals(reason));
        assertThat(event.gameId()).isEqualTo(gameId);
        assertThat(event.eventType().name()).isEqualTo(eventType);
        assertThat(event.eventId()).isNotNull();
        assertThat(event.occurredAt()).isNotNull();
    }

    private void assertNoEvents(GameBoundaryClient.RealtimeConnection... connections) throws Exception {
        for (GameBoundaryClient.RealtimeConnection connection : connections) {
            assertThat(connection.receivesAny(Duration.ofMillis(350))).isFalse();
        }
    }

    private void awaitSubscriptions(String destination, long expected) throws Exception {
        long deadline = System.nanoTime() + Duration.ofSeconds(5).toNanos();
        while (System.nanoTime() < deadline) {
            long current = simpUsers.getUsers().stream()
                    .flatMap(user -> user.getSessions().stream())
                    .flatMap(session -> session.getSubscriptions().stream())
                    .filter(subscription -> destination.equals(subscription.getDestination()))
                    .count();
            if (current == expected) return;
            Thread.sleep(10);
        }
        throw new AssertionError("Expected " + expected + " registered subscriptions for " + destination);
    }

    @Test
    void redisContainerIsWiredAndStartsEachTestWithNoPriorState() {
        assertThat(redis.opsForValue().get("integration:probe")).isNull();

        redis.opsForValue().set("integration:probe", "isolated");

        assertThat(redis.opsForValue().get("integration:probe")).isEqualTo("isolated");
    }

    @Test
    void recognizedLegacyMariaDbPreservesMutableDataAndReferenceData() {
        assertThat(playerRepository.count()).isGreaterThanOrEqualTo(2);
        assertThat(squareRepository.count()).isEqualTo(40);
        assertThat(cardRepository.count()).isEqualTo(40);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM flyway_schema_history WHERE version = '1' AND type = 'BASELINE' AND success = 1",
                Integer.class)).isEqualTo(1);
    }

    @Test
    void recognizedLegacyMariaDbEnforcesSingleTriggerOwnedStatsRow() {
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM stats WHERE player IS NULL", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM (SELECT player FROM stats GROUP BY player HAVING COUNT(*) > 1) d",
                Integer.class)).isZero();
        assertThat(jdbc.queryForObject("""
                SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stats'
                  AND INDEX_NAME = 'uq_stats_player' AND NON_UNIQUE = 0
                """, Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("""
                SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stats' AND COLUMN_NAME = 'player'
                """, String.class)).isEqualTo("NO");
        assertThat(jdbc.queryForObject("SELECT total_wins FROM stats WHERE player = 1", Integer.class)).isEqualTo(10);
        int id = insertPlayer("TriggerOwner");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM stats WHERE player = ?", Integer.class, id)).isEqualTo(1);
    }

    @Test
    void secondFlywayMigrationIsIdempotentForManagedDatabase() {
        int cards = jdbc.queryForObject("SELECT COUNT(*) FROM card", Integer.class);
        int squares = jdbc.queryForObject("SELECT COUNT(*) FROM square", Integer.class);
        int players = jdbc.queryForObject("SELECT COUNT(*) FROM player", Integer.class);

        flyway.migrate();

        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM flyway_schema_history WHERE success = 1", Integer.class))
                .isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM card", Integer.class)).isEqualTo(cards);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM square", Integer.class)).isEqualTo(squares);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM player", Integer.class)).isEqualTo(players);
    }

    @Test
    void finalizationIsExactlyOnceAndRollsBackMarkerWithPartialStats() {
        int first = insertPlayer("FinalizeA");
        int second = insertPlayer("FinalizeB");
        TerminalGameResult terminal = terminal("final-once", 99001, first, second);
        assertThat(gameFinalization.finalizeGame(terminal)).isEqualTo(GameFinalizationService.Outcome.APPLIED);
        assertThat(gameFinalization.finalizeGame(terminal)).isEqualTo(GameFinalizationService.Outcome.ALREADY_FINALIZED);
        assertThat(jdbc.queryForObject("SELECT total_games FROM stats WHERE player = ?", Integer.class, first)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT total_games FROM stats WHERE player = ?", Integer.class, second)).isEqualTo(1);

        int rollbackFirst = insertPlayer("RollbackA");
        int rollbackSecond = insertPlayer("RollbackB");
        TerminalGameResult rollback = terminal("final-rollback", 99002, rollbackFirst, rollbackSecond);
        reset(finalizationFailureProbe);
        doThrow(new IllegalStateException("injected")).when(finalizationFailureProbe).afterPlayerUpdate(1);
        assertThatThrownBy(() -> gameFinalization.finalizeGame(rollback)).hasMessageContaining("injected");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM game_finalization WHERE finalization_id = ?",
                Integer.class, rollback.finalizationId())).isZero();
        assertThat(jdbc.queryForObject("SELECT total_games FROM stats WHERE player = ?", Integer.class, rollbackFirst)).isZero();
        assertThat(jdbc.queryForObject("SELECT total_games FROM stats WHERE player = ?", Integer.class, rollbackSecond)).isZero();
        reset(finalizationFailureProbe);
    }

    @Test
    void concurrentFinalizationUsesDatabaseUniquenessAsRaceBoundary() throws Exception {
        int first = insertPlayer("ConcurrentFinalizeA");
        int second = insertPlayer("ConcurrentFinalizeB");
        TerminalGameResult terminal = terminal("final-concurrent", 99003, first, second);
        CyclicBarrier barrier = new CyclicBarrier(2);
        var executor = Executors.newFixedThreadPool(2);
        try {
            List<Callable<GameFinalizationService.Outcome>> work = List.of(
                    () -> { barrier.await(); return gameFinalization.finalizeGame(terminal); },
                    () -> { barrier.await(); return gameFinalization.finalizeGame(terminal); });
            List<GameFinalizationService.Outcome> outcomes = executor.invokeAll(work).stream().map(future -> {
                try { return future.get(); } catch (Exception exception) { throw new RuntimeException(exception); }
            }).toList();
            assertThat(outcomes).containsExactlyInAnyOrder(
                    GameFinalizationService.Outcome.APPLIED,
                    GameFinalizationService.Outcome.ALREADY_FINALIZED);
            assertThat(jdbc.queryForObject("SELECT total_games FROM stats WHERE player = ?", Integer.class, first)).isEqualTo(1);
            assertThat(jdbc.queryForObject("SELECT total_games FROM stats WHERE player = ?", Integer.class, second)).isEqualTo(1);
        } finally {
            executor.shutdownNow();
        }
    }

    @Test
    void statsRepositoryCardinalityIsDatabaseEnforced() {
        int player = insertPlayer("UniqueStats");
        assertThat(statsRepository.findByPlayer(playerRepository.findById(player).orElseThrow())).isPresent();
        assertThatThrownBy(() -> jdbc.update("INSERT INTO stats (player) VALUES (?)", player))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    }

    @Test
    void dueRollAndOptionalTimeoutsApplyOnceThroughVersionCas() throws Exception {
        int first = 8801;
        int second = 8802;
        seedActiveGame(first, second, 0, "[]", "[]");
        redis.opsForHash().put("game:" + first, "turnDeadlineEpochMs", "0");
        TurnCommandService.TurnTimeoutCandidate roll = turnCommands.dueTimeout(first).orElseThrow();
        assertThat(turnCommands.executeTimeout(roll)).isTrue();
        assertThat(turnCommands.executeTimeout(roll)).isFalse();
        assertThat(redis.opsForHash().get("game:" + first, "playerTurn")).isEqualTo(String.valueOf(second));
        assertThat(redis.opsForHash().get("player:" + first, "position")).isEqualTo("0");

        long version = Long.parseLong((String) redis.opsForHash().get("game:" + first, "stateVersion"));
        redis.opsForHash().put("game:" + first, "playerTurn", String.valueOf(second));
        redis.opsForHash().put("game:" + first, "turnDeadlineEpochMs", "0");
        redis.opsForHash().put("game:" + first, "optionalAction", objectMapper.writeValueAsString(
                new com.example.Sindopoly_Java.service.transition.PendingOptionalAction(
                        com.example.Sindopoly_Java.service.transition.PendingOptionalAction.Type.PURCHASE_PROPERTY,
                        first, second, version, 1, 60, true)));
        assertThat(turnCommands.timeoutIfDue(first)).isTrue();
        assertThat(redis.opsForHash().get("game:" + first, "optionalAction")).isNull();
        assertThat(redis.opsForHash().get("game:" + first, "playerTurn")).isEqualTo(String.valueOf(first));
        assertThat(redis.opsForHash().get("player:" + second, "money")).isEqualTo("1500");
    }

    @Test
    void propertyPassReplayPreservesTypedEmptyAcquiredPropertiesArray() throws Exception {
        int first = 8803;
        int second = 8804;
        seedActiveGame(first, second, 0, "[]", "[]");
        redis.opsForHash().put("game:" + first, "optionalAction", objectMapper.writeValueAsString(
                new com.example.Sindopoly_Java.service.transition.PendingOptionalAction(
                        com.example.Sindopoly_Java.service.transition.PendingOptionalAction.Type.PURCHASE_PROPERTY,
                        first, first, 0, 1, 60, true)));
        CommandMetadata command = metadata(0);

        ActionResultDto applied = turnCommands.pass(first, first, command);
        ActionResultDto replay = turnCommands.pass(first, first, command);

        assertThat(applied.acquiredProperties()).isEmpty();
        assertThat(replay.acquiredProperties()).isEmpty();
        assertThat(replay.replayed()).isTrue();
        assertThat(replay.newBalance()).isEqualTo(applied.newBalance());
        assertThat(replay.nextPlayerId()).isEqualTo(applied.nextPlayerId());
        assertThat(redis.opsForHash().get("game:" + first, "stateVersion")).isEqualTo("1");
    }

    @Test
    void timeoutAndPlayerCommandRaceAllowsOneVersionedResolution() throws Exception {
        int first = 8811;
        int second = 8812;
        seedActiveGame(first, second, 0, "[]", "[]");
        redis.opsForHash().put("game:" + first, "turnDeadlineEpochMs", "0");
        redis.opsForHash().put("game:" + first, "optionalAction", objectMapper.writeValueAsString(
                new com.example.Sindopoly_Java.service.transition.PendingOptionalAction(
                        com.example.Sindopoly_Java.service.transition.PendingOptionalAction.Type.PURCHASE_PROPERTY,
                        first, first, 0, 1, 60, true)));
        TurnCommandService.TurnTimeoutCandidate timeout = turnCommands.dueTimeout(first).orElseThrow();
        CyclicBarrier barrier = new CyclicBarrier(2);
        var executor = Executors.newFixedThreadPool(2);
        try {
            List<Callable<Object>> work = List.of(
                    () -> { barrier.await(); return capture(() -> turnCommands.executeTimeout(timeout)); },
                    () -> { barrier.await(); return capture(() -> turnCommands.pass(first, first, metadata(0))); });
            List<Object> outcomes = executor.invokeAll(work).stream().map(future -> {
                try { return future.get(); } catch (Exception exception) { throw new RuntimeException(exception); }
            }).toList();
            assertThat(outcomes.stream().filter(value -> Boolean.TRUE.equals(value)
                    || value instanceof ActionResultDto).count()).isEqualTo(1);
            assertThat(redis.opsForHash().get("game:" + first, "stateVersion")).isEqualTo("1");
            assertThat(redis.opsForHash().get("game:" + first, "playerTurn")).isEqualTo(String.valueOf(second));
        } finally {
            executor.shutdownNow();
        }
    }

    @Test
    void jailTimeoutUsesCanonicalSkipAndAbandonmentPreservesPlayerHash() throws Exception {
        int jailed = 8821;
        int next = 8822;
        seedActiveGame(jailed, next, 10, "[]", "[]");
        redis.opsForHash().putAll("player:" + jailed, java.util.Map.of("jail", "true", "jailTime", "3"));
        redis.opsForHash().put("game:" + jailed, "turnDeadlineEpochMs", "0");
        redis.opsForHash().put("game:" + jailed, "optionalAction", objectMapper.writeValueAsString(
                new com.example.Sindopoly_Java.service.transition.PendingOptionalAction(
                        com.example.Sindopoly_Java.service.transition.PendingOptionalAction.Type.PAY_JAIL_EXIT,
                        jailed, jailed, 0, null, 50, true)));
        TurnCommandService.TurnTimeoutCandidate jailTimeout = turnCommands.dueTimeout(jailed).orElseThrow();
        assertThat(turnCommands.executeTimeout(jailTimeout)).isTrue();
        assertThat(redis.opsForHash().get("player:" + jailed, "jailTime")).isEqualTo("2");
        assertThat(redis.opsForHash().get("game:" + jailed, "playerTurn")).isEqualTo(String.valueOf(next));
        String timeoutParameters = jailTimeout.playerId() + "|" + jailTimeout.phase() + "|" + jailTimeout.deadlineEpochMs();
        CommandMetadata timeoutMetadata = new CommandMetadata(jailTimeout.commandId(), jailTimeout.expectedVersion());
        String timeoutFingerprint = com.example.Sindopoly_Java.service.transition.CommandFingerprint.create(
                jailed, "SYSTEM", "TURN_TIMEOUT", timeoutMetadata, timeoutParameters);
        TransitionExecution replay = transitions.replayIfPresent(jailed, timeoutMetadata, timeoutFingerprint).orElseThrow();
        ActionResultDto replayResult = objectMapper.treeToValue(replay.semanticResult(), ActionResultDto.class);
        assertThat(replayResult.acquiredProperties()).isEmpty();
        assertThat(turnCommands.executeTimeout(jailTimeout)).isFalse();
        assertThat(redis.opsForHash().get("player:" + jailed, "jailTime")).isEqualTo("2");

        int owner = insertPlayer("AbandonedOwner");
        redis.opsForHash().putAll("game:" + owner, java.util.Map.of(
                "status", "lobby", "stateVersion", "0", "turnOrder", "[" + owner + "]"));
        redis.opsForSet().add("game:" + owner + ":players", String.valueOf(owner));
        redis.opsForHash().put("player:" + owner, "money", "1500");
        gameCommands.leave(owner, owner, metadata(0));
        assertThat(redis.hasKey("game:" + owner)).isFalse();
        assertThat(redis.hasKey("player:" + owner)).isTrue();
    }

    @Test
    void terminalTransitionFreezesRecoveryAndNeverShortensPlayerHashes() {
        int winner = insertPlayer("TerminalWinner");
        int loser = insertPlayer("TerminalLoser");
        seedActiveGame(winner, loser, 0, "[]", "[]");
        redis.opsForHash().putAll("game:" + winner, java.util.Map.of(
                "creationTime", "2026-08-25T10:00:00Z", "startTime", "2026-08-25T10:00:00Z",
                "maxTime", "1200", "maxMoney", "5000", "turnDeadlineEpochMs", "0"));
        redis.opsForHash().put("player:" + winner, "money", "5000");

        long completedVersion = Long.parseLong((String) redis.opsForHash().get("game:" + winner, "stateVersion"));
        long playerTtlBefore = redis.getExpire("player:" + winner);
        assertThat(gameLifecycle.processScheduledGame(winner)).isTrue();
        assertThat(redis.opsForHash().get("game:" + winner, "stateVersion"))
                .isEqualTo(String.valueOf(completedVersion + 1));
        assertThat(redis.opsForHash().get("game:" + winner, "status")).isEqualTo("ended");
        assertThat(redis.opsForHash().get("game:" + winner, "terminalResult")).isNotNull();
        assertThat(redis.opsForHash().get("game:" + winner, "turnDeadlineEpochMs")).isNull();
        assertThat(redis.getExpire("game:" + winner)).isBetween(1L, 300L);
        long playerTtlAfter = redis.getExpire("player:" + winner);
        if (playerTtlBefore < 0) assertThat(playerTtlAfter).isEqualTo(playerTtlBefore);
        else assertThat(playerTtlAfter).isBetween(Math.max(1L, playerTtlBefore - 2), playerTtlBefore);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM game_finalization WHERE game_id = ?",
                Integer.class, winner)).isEqualTo(1);
        assertThat(gameLifecycle.processScheduledGame(winner)).isTrue();
        assertThat(jdbc.queryForObject("SELECT total_games FROM stats WHERE player = ?", Integer.class, winner)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT total_games FROM stats WHERE player = ?", Integer.class, loser)).isEqualTo(1);
    }

    @Test
    void competingCompletionPollsCommitAndPublishExactlyOnce() throws Exception {
        int winner = insertPlayer("ConcurrentEndWinner");
        int loser = insertPlayer("ConcurrentEndLoser");
        seedActiveGame(winner, loser, 0, "[]", "[]");
        redis.opsForHash().putAll("game:" + winner, java.util.Map.of(
                "creationTime", "2026-08-25T10:01:00Z", "startTime", "2026-08-25T10:01:00Z",
                "maxTime", "1200", "maxMoney", "5000", "turnDeadlineEpochMs", "0"));
        redis.opsForHash().put("player:" + winner, "money", "5000");
        clearInvocations(broker);
        CyclicBarrier barrier = new CyclicBarrier(2);
        var executor = Executors.newFixedThreadPool(2);
        try {
            List<Callable<Boolean>> work = List.of(
                    () -> { barrier.await(); return gameLifecycle.processScheduledGame(winner); },
                    () -> { barrier.await(); return gameLifecycle.processScheduledGame(winner); });
            executor.invokeAll(work).forEach(future -> {
                try { assertThat(future.get()).isTrue(); } catch (Exception exception) { throw new RuntimeException(exception); }
            });
            assertThat(redis.opsForHash().get("game:" + winner, "stateVersion")).isEqualTo("1");
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM game_finalization WHERE game_id = ?",
                    Integer.class, winner)).isEqualTo(1);
            verify(broker, times(1)).convertAndSend(
                    org.mockito.ArgumentMatchers.eq("/topic/game/" + winner),
                    org.mockito.ArgumentMatchers.any(GameEventEnvelope.class));
        } finally {
            executor.shutdownNow();
        }
    }

    @Test
    void authenticatedSessionsCreateJoinStartAndReadThroughRealStores() throws Exception {
        MvcResult ownerCreation = mockMvc.perform(post("/api/player-state/create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nickname\":\"OwnerIT\"}"))
                .andExpect(status().isOk())
                .andReturn();
        int ownerId = Integer.parseInt(ownerCreation.getResponse().getContentAsString());
        MockHttpSession ownerSession = (MockHttpSession) ownerCreation.getRequest().getSession(false);

        MvcResult memberCreation = mockMvc.perform(post("/api/player-state/create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nickname\":\"MemberIT\"}"))
                .andExpect(status().isOk())
                .andReturn();
        int memberId = Integer.parseInt(memberCreation.getResponse().getContentAsString());
        MockHttpSession memberSession = (MockHttpSession) memberCreation.getRequest().getSession(false);

        MvcResult outsiderCreation = mockMvc.perform(post("/api/player-state/create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nickname\":\"OutsiderIT\"}"))
                .andExpect(status().isOk())
                .andReturn();
        MockHttpSession outsiderSession =
                (MockHttpSession) outsiderCreation.getRequest().getSession(false);

        mockMvc.perform(post("/api/game-state/create")
                        .header("X-Sindopoly-Command-Id", java.util.UUID.randomUUID())
                        .header("X-Sindopoly-Expected-Version", "-1")
                        .session(ownerSession)
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ownerId\":" + ownerId + ",\"visibility\":\"public\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.gameId").value(String.valueOf(ownerId)))
                .andExpect(jsonPath("$.status").value("lobby"));

        mockMvc.perform(get("/api/game-state/" + ownerId).session(outsiderSession))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/game-state/" + ownerId + "/snapshot"))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(get("/api/game-state/" + ownerId + "/snapshot").session(outsiderSession))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/game-state/999999").session(ownerSession))
                .andExpect(status().isNotFound());

        mockMvc.perform(post("/api/turn/" + ownerId + "/" + ownerId + "/throw")
                        .header("X-Sindopoly-Command-Id", java.util.UUID.randomUUID())
                        .header("X-Sindopoly-Expected-Version", "0")
                        .session(ownerSession)
                        .with(csrf()))
                .andExpect(status().isConflict());

        mockMvc.perform(post("/api/game-state/add/" + ownerId + "/" + memberId)
                        .header("X-Sindopoly-Command-Id", java.util.UUID.randomUUID())
                        .header("X-Sindopoly-Expected-Version", "0")
                        .session(memberSession)
                        .with(csrf()))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/game-state/" + ownerId + "/start")
                        .header("X-Sindopoly-Command-Id", java.util.UUID.randomUUID())
                        .header("X-Sindopoly-Expected-Version", "1")
                        .session(memberSession)
                        .with(csrf())
                        .param("playerId", String.valueOf(memberId)))
                .andExpect(status().isForbidden());

        mockMvc.perform(post("/api/game-state/" + ownerId + "/players/" + memberId + "/kick")
                        .header("X-Sindopoly-Command-Id", java.util.UUID.randomUUID())
                        .header("X-Sindopoly-Expected-Version", "1")
                        .session(ownerSession)
                        .with(csrf()))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/game-state/" + ownerId).session(memberSession))
                .andExpect(status().isForbidden());

        mockMvc.perform(post("/api/game-state/add/" + ownerId + "/" + memberId)
                        .header("X-Sindopoly-Command-Id", java.util.UUID.randomUUID())
                        .header("X-Sindopoly-Expected-Version", "2")
                        .session(memberSession)
                        .with(csrf()))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/game-state/" + ownerId + "/start")
                        .header("X-Sindopoly-Command-Id", java.util.UUID.randomUUID())
                        .header("X-Sindopoly-Expected-Version", "3")
                        .session(ownerSession)
                        .with(csrf())
                        .param("playerId", String.valueOf(ownerId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("inProgress"));

        mockMvc.perform(get("/api/session/me").session(ownerSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(ownerId));

        mockMvc.perform(get("/api/game-state/" + ownerId).session(ownerSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("inProgress"))
                .andExpect(jsonPath("$.playerTurn").value(String.valueOf(ownerId)));

        mockMvc.perform(get("/api/game-state/" + ownerId + "/snapshot").session(memberSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.gameId").value(ownerId))
                .andExpect(jsonPath("$.stateVersion").value(4))
                .andExpect(jsonPath("$.players[0].playerId").value(ownerId))
                .andExpect(jsonPath("$.terminalResult").doesNotExist())
                .andExpect(jsonPath("$.finalizationId").doesNotExist());

        mockMvc.perform(post("/api/turn/" + ownerId + "/" + memberId + "/throw")
                        .header("X-Sindopoly-Command-Id", java.util.UUID.randomUUID())
                        .header("X-Sindopoly-Expected-Version", "4")
                        .session(memberSession)
                        .with(csrf()))
                .andExpect(status().isForbidden());
    }

    @Test
    void turnOrderTracksCreateJoinReplayStaleKickAndStartAtomically() throws Exception {
        PlayerSession host = createPlayer("OrderHost");
        PlayerSession second = createPlayer("OrderSecond");
        PlayerSession third = createPlayer("OrderThird");

        mockMvc.perform(post("/api/game-state/create")
                        .header("X-Sindopoly-Command-Id", UUID.randomUUID())
                        .header("X-Sindopoly-Expected-Version", "-1")
                        .session(host.session()).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ownerId\":" + host.id() + ",\"visibility\":\"public\"}"))
                .andExpect(status().isOk());
        assertThat(redis.opsForHash().get("game:" + host.id(), "turnOrder"))
                .isEqualTo("[" + host.id() + "]");
        mockMvc.perform(get("/api/game-state/public-lobby"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].turnOrder").doesNotExist());

        UUID joinId = UUID.randomUUID();
        var join = post("/api/game-state/add/" + host.id() + "/" + second.id())
                .header("X-Sindopoly-Command-Id", joinId)
                .header("X-Sindopoly-Expected-Version", "0")
                .session(second.session()).with(csrf());
        mockMvc.perform(join).andExpect(status().isOk());
        mockMvc.perform(post("/api/game-state/add/" + host.id() + "/" + second.id())
                        .header("X-Sindopoly-Command-Id", joinId)
                        .header("X-Sindopoly-Expected-Version", "0")
                        .session(second.session()).with(csrf()))
                .andExpect(status().isOk());
        assertThat(redis.opsForHash().get("game:" + host.id(), "turnOrder"))
                .isEqualTo("[" + host.id() + "," + second.id() + "]");
        assertThat(redis.opsForHash().get("game:" + host.id(), "stateVersion")).isEqualTo("1");

        mockMvc.perform(post("/api/game-state/add/" + host.id() + "/" + third.id())
                        .header("X-Sindopoly-Command-Id", UUID.randomUUID())
                        .header("X-Sindopoly-Expected-Version", "0")
                        .session(third.session()).with(csrf()))
                .andExpect(status().isConflict());
        assertThat(redis.opsForSet().isMember("game:" + host.id() + ":players", String.valueOf(third.id()))).isFalse();
        assertThat(redis.opsForHash().get("game:" + host.id(), "turnOrder"))
                .isEqualTo("[" + host.id() + "," + second.id() + "]");

        mockMvc.perform(post("/api/game-state/add/" + host.id() + "/" + third.id())
                        .header("X-Sindopoly-Command-Id", UUID.randomUUID())
                        .header("X-Sindopoly-Expected-Version", "1")
                        .session(third.session()).with(csrf()))
                .andExpect(status().isOk());
        assertThat(redis.opsForHash().get("game:" + host.id(), "turnOrder"))
                .isEqualTo("[" + host.id() + "," + second.id() + "," + third.id() + "]");

        mockMvc.perform(post("/api/game-state/" + host.id() + "/players/" + second.id() + "/kick")
                        .header("X-Sindopoly-Command-Id", UUID.randomUUID())
                        .header("X-Sindopoly-Expected-Version", "2")
                        .session(host.session()).with(csrf()))
                .andExpect(status().isOk());
        assertThat(redis.opsForHash().get("game:" + host.id(), "turnOrder"))
                .isEqualTo("[" + host.id() + "," + third.id() + "]");

        mockMvc.perform(post("/api/game-state/" + host.id() + "/start")
                        .header("X-Sindopoly-Command-Id", UUID.randomUUID())
                        .header("X-Sindopoly-Expected-Version", "3")
                        .session(host.session()).with(csrf())
                        .param("playerId", String.valueOf(host.id())))
                .andExpect(status().isOk());
        assertThat(redis.opsForHash().get("game:" + host.id(), "playerTurn"))
                .isEqualTo(String.valueOf(host.id()));
        assertThat(redis.opsForHash().get("game:" + host.id(), "turnOrder"))
                .isEqualTo("[" + host.id() + "," + third.id() + "]");
    }

    @Test
    void ambiguousLegacyTurnOrderFailsClosedWithoutFabrication() throws Exception {
        PlayerSession host = createPlayer("LegacyHost");
        PlayerSession member = createPlayer("LegacyMember");
        redis.opsForHash().putAll("game:" + host.id(), java.util.Map.of(
                "status", "lobby", "visibility", "public", "stateVersion", "0"));
        redis.opsForSet().add("game:" + host.id() + ":players", String.valueOf(host.id()), String.valueOf(member.id()));

        mockMvc.perform(post("/api/game-state/" + host.id() + "/start")
                        .header("X-Sindopoly-Command-Id", UUID.randomUUID())
                        .header("X-Sindopoly-Expected-Version", "0")
                        .session(host.session()).with(csrf())
                        .param("playerId", String.valueOf(host.id())))
                .andExpect(status().isConflict());

        assertThat(redis.opsForHash().get("game:" + host.id(), "turnOrder")).isNull();
        assertThat(redis.opsForHash().get("game:" + host.id(), "stateVersion")).isEqualTo("0");
    }

    @Test
    void singleHostLegacyLobbySafelyInitializesOrderWhenNextPlayerJoins() throws Exception {
        PlayerSession host = createPlayer("LegacySingleHost");
        PlayerSession member = createPlayer("LegacySingleMember");
        redis.opsForHash().putAll("game:" + host.id(), java.util.Map.of(
                "status", "lobby", "visibility", "public", "stateVersion", "0"));
        redis.opsForSet().add("game:" + host.id() + ":players", String.valueOf(host.id()));

        mockMvc.perform(post("/api/game-state/add/" + host.id() + "/" + member.id())
                        .header("X-Sindopoly-Command-Id", UUID.randomUUID())
                        .header("X-Sindopoly-Expected-Version", "0")
                        .session(member.session()).with(csrf()))
                .andExpect(status().isOk());

        assertThat(redis.opsForHash().get("game:" + host.id(), "turnOrder"))
                .isEqualTo("[" + host.id() + "," + member.id() + "]");
        assertThat(redis.opsForSet().members("game:" + host.id() + ":players"))
                .containsExactlyInAnyOrder(String.valueOf(host.id()), String.valueOf(member.id()));
        assertThat(redis.opsForHash().get("game:" + host.id(), "stateVersion")).isEqualTo("1");
    }

    @Test
    void inProgressDeparturePreservesRelativeOrderAndAdvancesFromDepartingActivePlayer() {
        int gameId = 741;
        int secondId = 707;
        int thirdId = 799;
        redis.opsForHash().putAll("game:" + gameId, java.util.Map.of(
                "status", "inProgress", "playerTurn", String.valueOf(gameId), "stateVersion", "0",
                "turnOrder", "[" + gameId + "," + secondId + "," + thirdId + "]",
                "optionalAction", "{\"type\":\"PURCHASE_PROPERTY\",\"gameId\":" + gameId
                        + ",\"playerId\":" + gameId
                        + ",\"stateVersion\":0,\"squareId\":1,\"cost\":60,\"declinable\":true}"));
        redis.opsForSet().add("game:" + gameId + ":players",
                String.valueOf(gameId), String.valueOf(secondId), String.valueOf(thirdId));
        redis.opsForHash().putAll("player:" + thirdId, java.util.Map.of(
                "position", "10", "money", "1500", "jail", "true", "jailTime", "2",
                "bankrupt", "false", "properties", "[]", "afk", "false"));

        gameCommands.leave(gameId, secondId, metadata(0));
        assertThat(redis.opsForHash().get("game:" + gameId, "turnOrder"))
                .isEqualTo("[" + gameId + "," + thirdId + "]");
        assertThat(redis.opsForHash().get("game:" + gameId, "playerTurn"))
                .isEqualTo(String.valueOf(gameId));
        assertThat(redis.opsForHash().get("game:" + gameId, "optionalAction").toString())
                .contains("PURCHASE_PROPERTY").contains("\"stateVersion\":1");

        gameCommands.leave(gameId, gameId, metadata(1));
        assertThat(redis.opsForHash().get("game:" + gameId, "turnOrder"))
                .isEqualTo("[" + thirdId + "]");
        assertThat(redis.opsForHash().get("game:" + gameId, "playerTurn"))
                .isEqualTo(String.valueOf(thirdId));
        String pending = (String) redis.opsForHash().get("game:" + gameId, "optionalAction");
        assertThat(pending).contains("PAY_JAIL_EXIT").contains("\"playerId\":" + thirdId)
                .contains("\"stateVersion\":2");
    }

    @Test
    void realRedisRollCommitsRentTaxStartAndPurchaseEffectsOnce() {
        int gameId = 720;
        int otherId = 721;

        seedActiveGame(gameId, otherId, 1, "[]", "[3]");
        TurnCommandService rentService = deterministicTurnService(1, 1);
        CommandMetadata rentCommand = metadata(0);
        ThrowResultDto rent = rentService.throwDice(gameId, gameId, rentCommand);
        assertThat(rent.data()).isEqualTo(4);
        assertThat(redis.opsForHash().get("player:720", "money")).isEqualTo("1496");
        assertThat(redis.opsForHash().get("player:721", "money")).isEqualTo("1504");
        ThrowResultDto rentReplay = rentService.throwDice(gameId, gameId, rentCommand);
        assertThat(rentReplay.replayed()).isTrue();
        assertThat(redis.opsForHash().get("player:720", "money")).isEqualTo("1496");
        assertThat(redis.opsForHash().get("game:720", "stateVersion")).isEqualTo("1");

        clearDedicatedRedisContainer();
        seedActiveGame(gameId, otherId, 2, "[]", "[]");
        deterministicTurnService(1, 1).throwDice(gameId, gameId, metadata(0));
        assertThat(redis.opsForHash().get("player:720", "money")).isEqualTo("1300");

        clearDedicatedRedisContainer();
        seedActiveGame(gameId, otherId, 38, "[]", "[]");
        ThrowResultDto start = deterministicTurnService(1, 1).throwDice(gameId, gameId, metadata(0));
        assertThat(start.newPosition()).isZero();
        assertThat(redis.opsForHash().get("player:720", "money")).isEqualTo("1700");

        clearDedicatedRedisContainer();
        seedActiveGame(gameId, otherId, 1, "[]", "[]");
        TurnCommandService purchaseService = deterministicTurnService(1, 1);
        purchaseService.throwDice(gameId, gameId, metadata(0));
        assertThatThrownBy(() -> purchaseService.action(gameId, gameId, true, metadata(0)))
                .isInstanceOf(GameTransitionConflictException.class)
                .extracting("reason").isEqualTo("STALE_STATE");
        assertThat(redis.opsForHash().get("player:720", "money")).isEqualTo("1500");
        assertThat(redis.opsForHash().get("player:720", "properties")).isEqualTo("[]");
        assertThat(redis.opsForHash().get("game:720", "stateVersion")).isEqualTo("1");
        CommandMetadata purchaseCommand = metadata(1);
        ActionResultDto purchase = purchaseService.action(gameId, gameId, true, purchaseCommand);
        assertThat(purchase.newBalance()).isEqualTo(1440);
        assertThat(redis.opsForHash().get("player:720", "properties")).isEqualTo("[3]");
        assertThat(redis.opsForHash().get("game:720", "stateVersion")).isEqualTo("2");
        assertThat(purchaseService.action(gameId, gameId, true, purchaseCommand).replayed()).isTrue();
        assertThat(redis.opsForHash().get("player:720", "money")).isEqualTo("1440");
    }

    @Test
    void cardDeckRotationIsAtomicAndIsolatedPerGame() {
        int firstGame = 760;
        int secondGame = 770;
        seedActiveGame(firstGame);
        seedActiveGame(secondGame);
        List<String> cardIds = cardRepository.findAll().stream().limit(2)
                .map(card -> String.valueOf(card.getId())).toList();
        assertThat(cardIds).hasSize(2);
        redis.opsForList().rightPushAll("game:" + firstGame + ":deck", cardIds);
        redis.opsForList().rightPushAll("game:" + secondGame + ":deck", cardIds);

        deterministicTurnService(1, 1).throwDice(firstGame, firstGame, metadata(0));

        assertThat(redis.opsForList().range("game:" + firstGame + ":deck", 0, -1))
                .containsExactly(cardIds.get(1), cardIds.get(0));
        assertThat(redis.opsForList().range("game:" + secondGame + ":deck", 0, -1))
                .containsExactlyElementsOf(cardIds);
    }

    @Test
    void privateInviteCannotAddAPlayerWhoAlreadyOwnsAnotherGame() throws Exception {
        MvcResult hostCreation = mockMvc.perform(post("/api/player-state/create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nickname\":\"InviteHostIT\"}"))
                .andExpect(status().isOk())
                .andReturn();
        int hostId = Integer.parseInt(hostCreation.getResponse().getContentAsString());
        MockHttpSession hostSession = (MockHttpSession) hostCreation.getRequest().getSession(false);

        MvcResult otherCreation = mockMvc.perform(post("/api/player-state/create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nickname\":\"OtherHostIT\"}"))
                .andExpect(status().isOk())
                .andReturn();
        int otherId = Integer.parseInt(otherCreation.getResponse().getContentAsString());
        MockHttpSession otherSession = (MockHttpSession) otherCreation.getRequest().getSession(false);

        MvcResult privateGame = mockMvc.perform(post("/api/game-state/create")
                        .header("X-Sindopoly-Command-Id", java.util.UUID.randomUUID())
                        .header("X-Sindopoly-Expected-Version", "-1")
                        .session(hostSession)
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ownerId\":" + hostId + ",\"visibility\":\"private\"}"))
                .andExpect(status().isOk())
                .andReturn();
        String inviteCode = JsonPath.read(
                privateGame.getResponse().getContentAsString(), "$.inviteCode");

        mockMvc.perform(post("/api/game-state/create")
                        .header("X-Sindopoly-Command-Id", java.util.UUID.randomUUID())
                        .header("X-Sindopoly-Expected-Version", "-1")
                        .session(otherSession)
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ownerId\":" + otherId + ",\"visibility\":\"public\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/game-state/join-with-invite")
                        .header("X-Sindopoly-Command-Id", java.util.UUID.randomUUID())
                        .header("X-Sindopoly-Expected-Version", "0")
                        .session(otherSession)
                        .with(csrf())
                        .param("inviteCode", inviteCode)
                        .param("playerId", String.valueOf(otherId)))
                .andExpect(status().isConflict());
    }

    @Test
    void removedDirectMutationAdaptersCannotChangeAuthoritativeRedisState() throws Exception {
        MvcResult creation = mockMvc.perform(post("/api/player-state/create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nickname\":\"ContainedIT\"}"))
                .andExpect(status().isOk())
                .andReturn();
        int playerId = Integer.parseInt(creation.getResponse().getContentAsString());
        MockHttpSession session = (MockHttpSession) creation.getRequest().getSession(false);

        redis.opsForHash().put("player:" + playerId, "money", "1500");
        redis.opsForHash().put("player:" + playerId, "position", "0");

        mockMvc.perform(post("/api/player-state/" + playerId)
                        .session(session)
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"money\":999999,\"position\":39}"))
                .andExpect(status().isMethodNotAllowed());

        mockMvc.perform(post("/api/player-state/grant-money/" + playerId + "/999999")
                        .session(session)
                        .with(csrf()))
                .andExpect(status().isNotFound());

        mockMvc.perform(delete("/api/player-state/" + playerId)
                        .session(session)
                        .with(csrf()))
                .andExpect(status().isMethodNotAllowed());

        assertThat(redis.opsForHash().get("player:" + playerId, "money")).isEqualTo("1500");
        assertThat(redis.opsForHash().get("player:" + playerId, "position")).isEqualTo("0");

        mockMvc.perform(post("/api/game-state/create")
                        .header("X-Sindopoly-Command-Id", java.util.UUID.randomUUID())
                        .header("X-Sindopoly-Expected-Version", "-1")
                        .session(session)
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ownerId\":" + playerId + ",\"visibility\":\"public\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(delete("/api/game-state/" + playerId)
                        .session(session)
                        .with(csrf()))
                .andExpect(status().isMethodNotAllowed());

        mockMvc.perform(post("/api/game-state/" + playerId + "/check-end")
                        .session(session)
                        .with(csrf()))
                .andExpect(status().isNotFound());

        assertThat(redis.opsForHash().get("game:" + playerId, "status")).isEqualTo("lobby");
        assertThat(redis.opsForSet().isMember("game:" + playerId + ":players", String.valueOf(playerId)))
                .isTrue();

        mockMvc.perform(post("/api/game-state/" + playerId + "/remove-player")
                        .header("X-Sindopoly-Command-Id", java.util.UUID.randomUUID())
                        .header("X-Sindopoly-Expected-Version", "0")
                        .session(session)
                        .with(csrf())
                        .param("playerId", String.valueOf(playerId)))
                .andExpect(status().isOk());

        assertThat(redis.hasKey("game:" + playerId)).isFalse();
        assertThat(redis.hasKey("game:" + playerId + ":players")).isFalse();

        mockMvc.perform(get("/api/game-state/public-lobby"))
                .andExpect(status().isOk());
    }

    @Test
    void transitionFirstApplyAndExactRetryReturnOneSemanticResult() {
        seedGame(700, 0);
        CommandMetadata metadata = metadata(0);
        var result = objectMapper.valueToTree(java.util.Map.of("answer", 42));
        GameTransitionPlan plan = GameTransitionPlan.transition().putGame("marker", "applied").lifecycleTtl(60);

        TransitionExecution first = transitions.commit(700, metadata, "fingerprint", plan, result);
        TransitionExecution retry = transitions.commit(700, metadata, "fingerprint", plan, result);

        assertThat(first.status()).isEqualTo(TransitionExecution.Status.APPLIED);
        assertThat(retry.status()).isEqualTo(TransitionExecution.Status.REPLAY);
        assertThat(retry.semanticResult()).isEqualTo(first.semanticResult());
        assertThat(redis.opsForHash().get("game:700", "stateVersion")).isEqualTo("1");
    }

    @Test
    void staleDistinctCommandAndCommandIdReuseAreBoundedConflicts() {
        seedGame(701, 3);
        CommandMetadata stale = metadata(2);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> transitions.commit(701, stale, "stale",
                        GameTransitionPlan.transition().putGame("unsafe", "yes"), objectMapper.createObjectNode()))
                .isInstanceOf(GameTransitionConflictException.class)
                .extracting("reason").isEqualTo("STALE_STATE");
        assertThat(redis.opsForHash().get("game:701", "unsafe")).isNull();

        CommandMetadata applied = metadata(3);
        transitions.commit(701, applied, "original", GameTransitionPlan.transition().putGame("safe", "yes"),
                objectMapper.createObjectNode());
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> transitions.commit(701, applied, "changed",
                        GameTransitionPlan.transition().putGame("unsafe", "yes"), objectMapper.createObjectNode()))
                .isInstanceOf(GameTransitionConflictException.class)
                .extracting("reason").isEqualTo("COMMAND_ID_REUSE");
    }

    @Test
    void concurrentCompetingCommandsAllowExactlyOneCommit() throws Exception {
        seedGame(702, 0);
        var executor = Executors.newFixedThreadPool(2);
        CyclicBarrier start = new CyclicBarrier(2);
        try {
            List<Callable<Object>> work = List.of(
                    () -> { start.await(); return attempt(702, metadata(0), "a", "A"); },
                    () -> { start.await(); return attempt(702, metadata(0), "b", "B"); });
            List<Object> outcomes = executor.invokeAll(work).stream().map(future -> {
                try { return future.get(); } catch (Exception exception) { throw new RuntimeException(exception); }
            }).toList();
            assertThat(outcomes.stream().filter(TransitionExecution.class::isInstance)).hasSize(1);
            assertThat(outcomes.stream().filter(GameTransitionConflictException.class::isInstance)).hasSize(1);
        } finally { executor.shutdownNow(); }
        assertThat(redis.opsForHash().get("game:702", "stateVersion")).isEqualTo("1");
    }

    @Test
    void concurrentDuplicateCommandsApplyOnceAndReplayOnce() throws Exception {
        seedGame(703, 0);
        CommandMetadata metadata = metadata(0);
        var executor = Executors.newFixedThreadPool(2);
        CyclicBarrier start = new CyclicBarrier(2);
        try {
            List<Callable<TransitionExecution>> work = List.of(
                    () -> { start.await(); return transitions.commit(703, metadata, "same", GameTransitionPlan.transition().putGame("winner", "same"), objectMapper.valueToTree("ok")); },
                    () -> { start.await(); return transitions.commit(703, metadata, "same", GameTransitionPlan.transition().putGame("winner", "same"), objectMapper.valueToTree("ok")); });
            List<TransitionExecution> results = executor.invokeAll(work).stream().map(future -> {
                try { return future.get(); } catch (Exception exception) { throw new RuntimeException(exception); }
            }).toList();
            assertThat(results).extracting(TransitionExecution::status)
                    .containsExactlyInAnyOrder(TransitionExecution.Status.APPLIED, TransitionExecution.Status.REPLAY);
            assertThat(results).extracting(TransitionExecution::semanticResult).containsOnly(objectMapper.valueToTree("ok"));
            assertThat(results).extracting(TransitionExecution::stateVersion).containsOnly(1L);
        } finally { executor.shutdownNow(); }
        assertThat(redis.opsForHash().get("game:703", "stateVersion")).isEqualTo("1");
    }

    @Test
    void concurrentDuplicateRollReturnsOneCommittedRandomOutcome() throws Exception {
        int gameId = 706;
        seedActiveGame(gameId);
        CommandMetadata metadata = metadata(0);
        CyclicBarrier start = new CyclicBarrier(2);
        var executor = Executors.newFixedThreadPool(2);
        try {
            List<Callable<ThrowResultDto>> work = List.of(
                    () -> { start.await(); return turnCommands.throwDice(gameId, gameId, metadata); },
                    () -> { start.await(); return turnCommands.throwDice(gameId, gameId, metadata); });
            List<ThrowResultDto> results = executor.invokeAll(work).stream().map(future -> {
                try { return future.get(); } catch (Exception exception) { throw new RuntimeException(exception); }
            }).toList();

            assertThat(results).extracting(ThrowResultDto::replayed).containsExactlyInAnyOrder(false, true);
            assertThat(results).extracting(ThrowResultDto::dice).containsOnly(results.get(0).dice());
            assertThat(results).extracting(ThrowResultDto::newPosition).containsOnly(results.get(0).newPosition());
            assertThat(results).extracting(ThrowResultDto::stateVersion).containsOnly(1L);
            assertThat(redis.opsForHash().get("game:706", "stateVersion")).isEqualTo("1");
            assertThat(redis.opsForHash().get("player:706", "position"))
                    .isEqualTo(String.valueOf(results.get(0).newPosition()));
        } finally { executor.shutdownNow(); }
    }

    @Test
    void invalidPlanMakesNoPartialMultiKeyWrite() {
        seedGame(704, 0);
        redis.opsForHash().put("player:704", "money", "1500");
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> transitions.commit(704, metadata(0), "invalid",
                GameTransitionPlan.transition().putGame("marker", "bad")
                        .putPlayer(704, java.util.Map.of("money", "0")).lifecycleTtl(-1),
                objectMapper.createObjectNode())).isInstanceOf(RuntimeException.class);
        assertThat(redis.opsForHash().get("game:704", "marker")).isNull();
        assertThat(redis.opsForHash().get("game:704", "stateVersion")).isEqualTo("0");
        assertThat(redis.opsForHash().get("player:704", "money")).isEqualTo("1500");
        assertThat(redis.hasKey("game:704:commands")).isFalse();
    }

    @Test
    void bootstrapUsesAbsentPreconditionAndCommandTtlTracksGame() {
        CommandMetadata metadata = new CommandMetadata(UUID.randomUUID().toString(), -1);
        transitions.commit(705, metadata, "create", GameTransitionPlan.bootstrap()
                        .putGame("status", "lobby").addMember(705).lifecycleTtl(60),
                objectMapper.valueToTree(java.util.Map.of("gameId", 705)));
        assertThat(redis.opsForHash().get("game:705", "stateVersion")).isEqualTo("0");
        assertThat(redis.getExpire("game:705")).isBetween(1L, 60L);
        assertThat(redis.getExpire("game:705:players")).isBetween(1L, 60L);
        assertThat(redis.getExpire("game:705:commands")).isBetween(1L, 60L);
    }

    @Test
    void bootstrapReplaysExactlyButAnOrphanCommandRecordCannotPretendCreationExists() {
        CommandMetadata metadata = new CommandMetadata(UUID.randomUUID().toString(), -1);
        GameTransitionPlan plan = GameTransitionPlan.bootstrap().putGame("status", "lobby")
                .addMember(707).lifecycleTtl(60);
        var result = objectMapper.valueToTree(java.util.Map.of("gameId", 707));

        TransitionExecution first = transitions.commit(707, metadata, "create", plan, result);
        TransitionExecution replay = transitions.commit(707, metadata, "create", plan, result);
        assertThat(first.status()).isEqualTo(TransitionExecution.Status.APPLIED);
        assertThat(replay.status()).isEqualTo(TransitionExecution.Status.REPLAY);

        redis.delete("game:707");
        org.assertj.core.api.Assertions.assertThatThrownBy(
                () -> transitions.commit(707, metadata, "create", plan, result))
                .isInstanceOf(GameTransitionConflictException.class)
                .extracting("reason").isEqualTo("STALE_STATE");
    }

    @Test
    void missingVersionMigratesLazilyOnFirstAppliedTransition() {
        redis.opsForHash().put("game:708", "status", "lobby");
        redis.opsForSet().add("game:708:players", "708");

        transitions.commit(708, metadata(0), "legacy",
                GameTransitionPlan.transition().putGame("marker", "migrated"), objectMapper.createObjectNode());

        assertThat(redis.opsForHash().get("game:708", "stateVersion")).isEqualTo("1");
    }

    @Test
    void fullCommandHashFailsClosedWithoutEvictingReplayOrCollisionEvidence() {
        seedGame(709, 0);
        CommandMetadata retained = metadata(0);
        String retainedJson = "{\"fingerprint\":\"same\",\"stateVersion\":0,\"result\":{\"status\":\"noop\"}}";
        redis.opsForHash().put("game:709:commands", retained.commandId(), retainedJson);
        for (int index = 1; index < 4096; index++) {
            redis.opsForHash().put("game:709:commands", UUID.randomUUID().toString(), retainedJson);
        }

        TransitionExecution replay = transitions.commit(709, retained, "same",
                GameTransitionPlan.transition().noOp(), objectMapper.createObjectNode());
        assertThat(replay.status()).isEqualTo(TransitionExecution.Status.REPLAY);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> transitions.commit(709, retained, "different",
                        GameTransitionPlan.transition().noOp(), objectMapper.createObjectNode()))
                .isInstanceOf(GameTransitionConflictException.class)
                .extracting("reason").isEqualTo("COMMAND_ID_REUSE");
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> transitions.commit(709, metadata(0), "new",
                        GameTransitionPlan.transition().noOp(), objectMapper.createObjectNode()))
                .isInstanceOf(GameTransitionConflictException.class)
                .extracting("reason").isEqualTo("COMMAND_CAPACITY");
        assertThat(redis.opsForHash().size("game:709:commands")).isEqualTo(4096);
        assertThat(redis.opsForHash().get("game:709", "stateVersion")).isEqualTo("0");
    }

    @Test
    void wrongMembershipTypeFailsBeforeAnyGameWrite() {
        redis.opsForHash().put("game:710", "status", "lobby");
        redis.opsForHash().put("game:710", "stateVersion", "0");
        redis.opsForValue().set("game:710:players", "wrong-type");

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> transitions.commit(710, metadata(0), "wrong-type",
                        GameTransitionPlan.transition().putGame("marker", "unsafe").addMember(710),
                        objectMapper.createObjectNode()))
                .isInstanceOf(RuntimeException.class);
        assertThat(redis.opsForHash().get("game:710", "marker")).isNull();
        assertThat(redis.opsForHash().get("game:710", "stateVersion")).isEqualTo("0");
        assertThat(redis.hasKey("game:710:commands")).isFalse();
    }

    private int insertPlayer(String prefix) {
        jdbc.update("INSERT INTO player (p_name) VALUES (?)", prefix + UUID.randomUUID());
        return jdbc.queryForObject("SELECT LAST_INSERT_ID()", Integer.class);
    }

    private void assertStatsInvariant() {
        assertThat(jdbc.queryForObject("""
                SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stats' AND COLUMN_NAME = 'player'
                """, String.class)).isEqualTo("NO");
        assertThat(jdbc.queryForObject("""
                SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stats'
                  AND INDEX_NAME = 'uq_stats_player' AND NON_UNIQUE = 0
                """, Integer.class)).isEqualTo(1);
    }

    private TerminalGameResult terminal(String identity, int gameId, int winner, int loser) {
        String finalizationId = UUID.nameUUIDFromBytes(identity.getBytes(java.nio.charset.StandardCharsets.UTF_8)).toString();
        return new TerminalGameResult(finalizationId, gameId, 1_000L, 11_000L, 10, winner,
                List.of(new TerminalGameResult.TerminalPlayerResult(winner, 1500, true),
                        new TerminalGameResult.TerminalPlayerResult(loser, 1200, false)));
    }

    private Object capture(Callable<?> work) {
        try { return work.call(); }
        catch (RuntimeException exception) { return exception; }
        catch (Exception exception) { return new RuntimeException(exception); }
    }

    private Object attempt(int gameId, CommandMetadata metadata, String fingerprint, String marker) {
        try {
            return transitions.commit(gameId, metadata, fingerprint,
                    GameTransitionPlan.transition().putGame("winner", marker), objectMapper.valueToTree(marker));
        } catch (GameTransitionConflictException exception) {
            return exception;
        }
    }

    private void seedGame(int gameId, long version) {
        redis.opsForHash().put("game:" + gameId, "status", "lobby");
        redis.opsForHash().put("game:" + gameId, "stateVersion", String.valueOf(version));
        redis.opsForSet().add("game:" + gameId + ":players", String.valueOf(gameId));
    }

    private void seedActiveGame(int gameId) {
        redis.opsForHash().putAll("game:" + gameId, java.util.Map.of(
                "status", "inProgress", "playerTurn", String.valueOf(gameId), "stateVersion", "0",
                "turnOrder", "[" + gameId + "]"));
        redis.opsForSet().add("game:" + gameId + ":players", String.valueOf(gameId));
        redis.opsForHash().putAll("player:" + gameId, java.util.Map.of(
                "position", "0", "money", "1500", "jail", "false", "jailTime", "0",
                "bankrupt", "false", "properties", "[]", "afk", "false"));
    }

    private void seedActiveGame(int gameId, int otherId, int position,
                                String actorProperties, String otherProperties) {
        redis.opsForHash().putAll("game:" + gameId, java.util.Map.of(
                "status", "inProgress", "playerTurn", String.valueOf(gameId), "stateVersion", "0",
                "turnOrder", "[" + gameId + "," + otherId + "]"));
        redis.opsForSet().add("game:" + gameId + ":players", String.valueOf(gameId), String.valueOf(otherId));
        redis.opsForHash().putAll("player:" + gameId, java.util.Map.of(
                "position", String.valueOf(position), "money", "1500", "jail", "false", "jailTime", "0",
                "bankrupt", "false", "properties", actorProperties, "afk", "false"));
        redis.opsForHash().putAll("player:" + otherId, java.util.Map.of(
                "position", "0", "money", "1500", "jail", "false", "jailTime", "0",
                "bankrupt", "false", "properties", otherProperties, "afk", "false"));
    }

    private TurnCommandService deterministicTurnService(int... dieValues) {
        Deque<Integer> values = new ArrayDeque<>();
        for (int value : dieValues) values.add(value);
        return new TurnCommandService(transitions, new DiceService(values::removeFirst), squareRepository,
                cardRepository, objectMapper, mock(GameEventPublisher.class),
                new com.example.Sindopoly_Java.service.transition.GameTimingService(
                        java.time.Clock.systemUTC(), new GameLifecycleProperties()));
    }

    private PlayerSession createPlayer(String prefix) throws Exception {
        String nickname = "P" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        MvcResult result = mockMvc.perform(post("/api/player-state/create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nickname\":\"" + nickname + "\"}"))
                .andExpect(status().isOk()).andReturn();
        return new PlayerSession(Integer.parseInt(result.getResponse().getContentAsString()),
                (MockHttpSession) result.getRequest().getSession(false));
    }

    private CommandMetadata metadata(long version) {
        return new CommandMetadata(UUID.randomUUID().toString(), version);
    }

    private record PlayerSession(int id, MockHttpSession session) { }
}
