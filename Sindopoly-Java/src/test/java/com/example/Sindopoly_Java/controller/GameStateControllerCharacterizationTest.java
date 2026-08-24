package com.example.Sindopoly_Java.controller;

import com.example.Sindopoly_Java.dto.GameCreationRequest;
import com.example.Sindopoly_Java.service.GameStateService;
import com.example.Sindopoly_Java.service.PlayerStateService;
import com.example.Sindopoly_Java.security.AuthenticatedPlayerResolver;
import com.example.Sindopoly_Java.security.GameAuthorizationService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class GameStateControllerCharacterizationTest {

    @Mock
    private GameStateService gameStateService;

    @Mock
    private PlayerStateService playerStateService;

    @Mock
    private AuthenticatedPlayerResolver authenticatedPlayerResolver;

    @Mock
    private GameAuthorizationService gameAuthorizationService;

    @Mock
    private Authentication authentication;

    @InjectMocks
    private GameStateController controller;

    @Test
    @DisplayName("[CHARACTERIZATION] create returns the service state plus owner-derived gameId")
    void currentBehavior_createGameAddsOwnerIdAsGameIdToServiceResponse() {
        GameCreationRequest request = new GameCreationRequest();
        request.setOwnerId(17);
        request.setVisibility("public");
        Map<String, String> state = new HashMap<>(Map.of("status", "lobby"));
        when(authenticatedPlayerResolver.requireMatchingPlayerId(17, authentication)).thenReturn(17);
        when(gameStateService.createGame(17, "public")).thenReturn(state);

        Map<String, String> response = controller.createGame(request, authentication);

        assertEquals("lobby", response.get("status"));
        assertEquals("17", response.get("gameId"));
        verify(gameStateService).createGame(17, "public");
        verify(authenticatedPlayerResolver).requireMatchingPlayerId(17, authentication);
    }

    @Test
    @DisplayName("[CHARACTERIZATION] join returns 200 and delegates when player is not already in a game")
    void currentBehavior_joinLobbyReturnsSuccessAfterControllerPrechecks() {
        when(gameStateService.isPlayerInAnyGame(2)).thenReturn(false);
        when(gameStateService.getPlayersInGame(1)).thenReturn(Set.of("1"));

        ResponseEntity<String> response = controller.addPlayer(1, 2, authentication);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals("Player added to game.", response.getBody());
        verify(gameStateService).addPlayerToGame(1, 2);
    }

    @Test
    @DisplayName("[CHARACTERIZATION] duplicate join is rejected by the controller before service add")
    void currentBehavior_duplicateJoinReturnsBadRequest() {
        when(gameStateService.isPlayerInAnyGame(2)).thenReturn(true);

        ResponseEntity<String> response = controller.addPlayer(1, 2, authentication);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertEquals("Player is already in another game.", response.getBody());
        verify(gameStateService, never()).addPlayerToGame(1, 2);
    }

    @Test
    @DisplayName("[CHARACTERIZATION] start with two players delegates the supplied playerId as current owner check input")
    void currentBehavior_startWithTwoPlayersReturnsInProgressSnapshot() {
        when(gameAuthorizationService.requireHostInLobby(1, 1)).thenReturn(access(
                1, 1, Map.of("status", "lobby"), Set.of("1", "2")));

        ResponseEntity<?> response = controller.startGame(1, 1, authentication);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        Map<?, ?> body = assertInstanceOf(Map.class, response.getBody());
        assertEquals("inProgress", body.get("status"));
        assertEquals(1, body.get("gameId"));
        verify(gameStateService).startGame(1, 1);
    }

    @Test
    @DisplayName("remove verifies the requested player against the authenticated actor")
    void removePlayerRequiresMatchingAuthenticatedActor() {
        when(gameAuthorizationService.requireMember(1, 2)).thenReturn(access(
                1, 2, Map.of("status", "lobby"), Set.of("1", "2")));
        String response = controller.removePlayer(1, 2, authentication);

        assertEquals("Player removed from game.", response);
        verify(authenticatedPlayerResolver).requireMatchingPlayerId(2, authentication);
        verify(gameStateService).removePlayerFromGame(1, 2);
    }

    @Test
    @DisplayName("check-end requires the authenticated host while pending REVAMP-017 removal")
    void checkEndRequiresHostAuthorization() {
        when(authenticatedPlayerResolver.requirePlayerId(authentication)).thenReturn(1);
        when(gameAuthorizationService.requireHostInProgress(1, 1)).thenReturn(access(
                1, 1, Map.of("status", "inProgress"), Set.of("1", "2")));
        when(gameStateService.checkEndCondition(1)).thenReturn(true);

        String response = controller.checkGameEnd(1, authentication);

        assertEquals("Game ended due to condition.", response);
        verify(gameStateService).checkEndCondition(1);
    }

    @Test
    @DisplayName("host kick keeps the session actor distinct from the target player")
    void hostKickUsesTargetOnlyAsResourceSelector() {
        var access = access(1, 1, Map.of("status", "lobby"), Set.of("1", "2"));
        when(authenticatedPlayerResolver.requirePlayerId(authentication)).thenReturn(1);
        when(gameAuthorizationService.requireHostInLobby(1, 1)).thenReturn(access);

        String response = controller.kickPlayer(1, 2, authentication);

        assertEquals("Player removed from game.", response);
        verify(gameAuthorizationService).requireTargetMember(access, 2);
        verify(gameStateService).removePlayerFromGame(1, 2);
    }

    private GameAuthorizationService.GameAccess access(
            int gameId,
            int actorId,
            Map<String, String> game,
            Set<String> members) {
        return new GameAuthorizationService.GameAccess(gameId, actorId, game, members);
    }
}
