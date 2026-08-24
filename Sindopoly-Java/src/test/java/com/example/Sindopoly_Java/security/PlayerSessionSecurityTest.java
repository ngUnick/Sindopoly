package com.example.Sindopoly_Java.security;

import com.example.Sindopoly_Java.repository.PlayerRepository;
import com.example.Sindopoly_Java.service.GameLoopScheduler;
import com.example.Sindopoly_Java.service.core.StatsService;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PlayerSessionSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private PlayerRepository playerRepository;

    @MockBean
    private GameLoopScheduler gameLoopScheduler;

    @MockBean
    private StatsService statsService;

    @AfterEach
    void deleteCreatedPlayers() {
        playerRepository.deleteAll();
    }

    @Test
    void creationEstablishesSessionAndCurrentPlayerLookupIsContinuous() throws Exception {
        EstablishedPlayer established = createPlayer("Alice");

        mockMvc.perform(get("/api/session/me").session(established.session()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(established.playerId()))
                .andExpect(jsonPath("$.nickname").value("Alice"));

        mockMvc.perform(get("/api/session/me").session(established.session()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(established.playerId()));
    }

    @Test
    void establishmentRotatesAClientSuppliedPreAuthenticationSessionId() throws Exception {
        MockHttpSession preAuthenticationSession = new MockHttpSession();
        String originalSessionId = preAuthenticationSession.getId();

        MvcResult result = mockMvc.perform(post("/api/player-state/create")
                        .session(preAuthenticationSession)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nickname\":\"Rotated\"}"))
                .andExpect(status().isOk())
                .andReturn();

        MockHttpSession establishedSession =
                (MockHttpSession) result.getRequest().getSession(false);
        assertThat(establishedSession.getId()).isNotEqualTo(originalSessionId);
    }

    @Test
    void authenticatedSessionCannotCreateASecondDurableIdentity() throws Exception {
        EstablishedPlayer established = createPlayer("OnlyIdentity");

        mockMvc.perform(post("/api/player-state/create")
                        .session(established.session())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nickname\":\"Impersonated\"}"))
                .andExpect(status().isForbidden());

        assertThat(playerRepository.count()).isEqualTo(1);
    }

    @Test
    void currentPlayerRejectsRequestWithoutApplicationSession() throws Exception {
        mockMvc.perform(get("/api/session/me"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void independentSessionsCannotResolveOrActAsEachOther() throws Exception {
        EstablishedPlayer first = createPlayer("First");
        EstablishedPlayer second = createPlayer("Second");

        mockMvc.perform(get("/api/session/me").session(first.session()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(first.playerId()));
        mockMvc.perform(get("/api/session/me").session(second.session()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(second.playerId()));

        mockMvc.perform(post("/api/game-state/create")
                        .session(first.session())
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ownerId\":" + second.playerId()
                                + ",\"visibility\":\"public\"}"))
                .andExpect(status().isForbidden());

        mockMvc.perform(post("/api/turn/9/" + second.playerId() + "/throw")
                        .session(first.session())
                        .with(csrf()))
                .andExpect(status().isForbidden());
    }

    @Test
    void actionRejectsBodyIdentityThatConflictsWithAuthenticatedPath() throws Exception {
        EstablishedPlayer player = createPlayer("ActionPlayer");

        mockMvc.perform(post("/api/turn/9/" + player.playerId() + "/action")
                        .session(player.session())
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"gameId\":99,\"playerId\":" + player.playerId()
                                + ",\"squareType\":5,\"yes\":true}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void directStateAndLifecycleMutationAdaptersAreNoLongerRoutable() throws Exception {
        EstablishedPlayer player = createPlayer("ContainedRoutes");

        mockMvc.perform(post("/api/player-state/" + player.playerId())
                        .session(player.session())
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"money\":999999,\"position\":39,\"properties\":\"[1,2]\"}"))
                .andExpect(status().isMethodNotAllowed());

        mockMvc.perform(delete("/api/player-state/" + player.playerId())
                        .session(player.session())
                        .with(csrf()))
                .andExpect(status().isMethodNotAllowed());

        mockMvc.perform(post("/api/player-state/grant-money/" + player.playerId() + "/999999")
                        .session(player.session())
                        .with(csrf()))
                .andExpect(status().isNotFound());

        mockMvc.perform(delete("/api/game-state/123")
                        .session(player.session())
                        .with(csrf()))
                .andExpect(status().isMethodNotAllowed());

        mockMvc.perform(post("/api/game-state/123/check-end")
                        .session(player.session())
                        .with(csrf()))
                .andExpect(status().isNotFound());
    }

    @Test
    void logoutInvalidatesTheServerSession() throws Exception {
        EstablishedPlayer established = createPlayer("LogoutPlayer");

        mockMvc.perform(post("/api/session/logout")
                        .session(established.session())
                        .with(csrf()))
                .andExpect(status().isNoContent());

        assertThat(established.session().isInvalid()).isTrue();
        mockMvc.perform(get("/api/session/me"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void expiredSessionIdCannotRecoverItsFormerActor() throws Exception {
        EstablishedPlayer established = createPlayer("ExpiredPlayer");
        String expiredSessionId = established.session().getId();
        established.session().invalidate();

        mockMvc.perform(get("/api/session/me")
                        .cookie(new Cookie("JSESSIONID", expiredSessionId)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void sessionWhoseDurablePlayerWasRemovedFailsClosed() throws Exception {
        EstablishedPlayer established = createPlayer("StalePlayer");
        playerRepository.deleteById(established.playerId());

        mockMvc.perform(get("/api/session/me").session(established.session()))
                .andExpect(status().isUnauthorized());
    }

    private EstablishedPlayer createPlayer(String nickname) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/player-state/create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nickname\":\"" + nickname + "\"}"))
                .andExpect(status().isOk())
                .andReturn();

        int playerId = Integer.parseInt(result.getResponse().getContentAsString());
        MockHttpSession session = (MockHttpSession) result.getRequest().getSession(false);
        assertThat(session).isNotNull();
        return new EstablishedPlayer(playerId, session);
    }

    private record EstablishedPlayer(int playerId, MockHttpSession session) {
    }
}
