package com.example.Sindopoly_Java.integration;

import com.jayway.jsonpath.JsonPath;
import com.example.Sindopoly_Java.repository.CardRepository;
import com.example.Sindopoly_Java.repository.PlayerRepository;
import com.example.Sindopoly_Java.repository.SquareRepository;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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
                        .session(ownerSession)
                        .with(csrf()))
                .andExpect(status().isConflict());

        mockMvc.perform(post("/api/game-state/add/" + ownerId + "/" + memberId)
                        .session(memberSession)
                        .with(csrf()))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/game-state/" + ownerId + "/start")
                        .session(memberSession)
                        .with(csrf())
                        .param("playerId", String.valueOf(memberId)))
                .andExpect(status().isForbidden());

        mockMvc.perform(post("/api/game-state/" + ownerId + "/players/" + memberId + "/kick")
                        .session(ownerSession)
                        .with(csrf()))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/game-state/" + ownerId).session(memberSession))
                .andExpect(status().isForbidden());

        mockMvc.perform(post("/api/game-state/add/" + ownerId + "/" + memberId)
                        .session(memberSession)
                        .with(csrf()))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/game-state/" + ownerId + "/start")
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
                        .session(hostSession)
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ownerId\":" + hostId + ",\"visibility\":\"private\"}"))
                .andExpect(status().isOk())
                .andReturn();
        String inviteCode = JsonPath.read(
                privateGame.getResponse().getContentAsString(), "$.inviteCode");

        mockMvc.perform(post("/api/game-state/create")
                        .session(otherSession)
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ownerId\":" + otherId + ",\"visibility\":\"public\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/game-state/join-with-invite")
                        .session(otherSession)
                        .with(csrf())
                        .param("inviteCode", inviteCode)
                        .param("playerId", String.valueOf(otherId)))
                .andExpect(status().isConflict());
    }
}
