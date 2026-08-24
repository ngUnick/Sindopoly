package com.example.Sindopoly_Java.integration;

import com.jayway.jsonpath.JsonPath;
import com.example.Sindopoly_Java.repository.CardRepository;
import com.example.Sindopoly_Java.repository.PlayerRepository;
import com.example.Sindopoly_Java.repository.SquareRepository;
import com.example.Sindopoly_Java.exception.GameTransitionConflictException;
import com.example.Sindopoly_Java.service.transition.CommandMetadata;
import com.example.Sindopoly_Java.service.transition.GameTransitionPlan;
import com.example.Sindopoly_Java.service.transition.RedisGameTransitionStore;
import com.example.Sindopoly_Java.service.transition.TransitionExecution;
import com.example.Sindopoly_Java.service.transition.TurnCommandService;
import com.example.Sindopoly_Java.model.dto.ThrowResultDto;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.redis.connection.RedisConnection;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.MariaDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.MountableFile;

import java.nio.file.Path;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;

import static org.assertj.core.api.Assertions.assertThat;
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
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("integration")
@Testcontainers
class IntegrationInfrastructureIT {

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
        // Existing application properties use SPRING_REDIS_* placeholders.
        registry.add("spring.redis.host", REDIS::getHost);
        registry.add("spring.redis.port", () -> REDIS.getMappedPort(REDIS_PORT));
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
    private TurnCommandService turnCommands;

    @Autowired
    private ObjectMapper objectMapper;

    @BeforeEach
    @AfterEach
    void clearDedicatedRedisContainer() {
        // Dynamic properties above make this safe: this never targets localhost
        // or a developer/shared Redis instance.
        try (RedisConnection connection = redis.getConnectionFactory().getConnection()) {
            connection.serverCommands().flushDb();
        }
    }

    @Test
    void redisContainerIsWiredAndStartsEachTestWithNoPriorState() {
        assertThat(redis.opsForValue().get("integration:probe")).isNull();

        redis.opsForValue().set("integration:probe", "isolated");

        assertThat(redis.opsForValue().get("integration:probe")).isEqualTo("isolated");
    }

    @Test
    void mariaDbContainerUsesCurrentSchemaAndSeedData() {
        assertThat(playerRepository.count()).isGreaterThanOrEqualTo(2);
        assertThat(squareRepository.count()).isEqualTo(40);
        assertThat(cardRepository.count()).isGreaterThan(0);
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

        mockMvc.perform(post("/api/turn/" + ownerId + "/" + memberId + "/throw")
                        .header("X-Sindopoly-Command-Id", java.util.UUID.randomUUID())
                        .header("X-Sindopoly-Expected-Version", "4")
                        .session(memberSession)
                        .with(csrf()))
                .andExpect(status().isForbidden());
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
                "status", "inProgress", "playerTurn", String.valueOf(gameId), "stateVersion", "0"));
        redis.opsForSet().add("game:" + gameId + ":players", String.valueOf(gameId));
        redis.opsForHash().putAll("player:" + gameId, java.util.Map.of(
                "position", "0", "money", "1500", "jail", "false", "jailTime", "0",
                "bankrupt", "false", "properties", "[]", "afk", "false"));
    }

    private CommandMetadata metadata(long version) {
        return new CommandMetadata(UUID.randomUUID().toString(), version);
    }
}
