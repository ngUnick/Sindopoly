package com.example.Sindopoly_Java.controller;

import com.example.Sindopoly_Java.dto.GameCreationRequest;
import com.example.Sindopoly_Java.service.GameStateService;
import com.example.Sindopoly_Java.service.PlayerStateService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

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

    @InjectMocks
    private GameStateController controller;

    @Test
    @DisplayName("[CHARACTERIZATION] create returns the service state plus owner-derived gameId")
    void currentBehavior_createGameAddsOwnerIdAsGameIdToServiceResponse() {
        GameCreationRequest request = new GameCreationRequest();
        request.setOwnerId(17);
        request.setVisibility("public");
        Map<String, String> state = new HashMap<>(Map.of("status", "lobby"));
        when(gameStateService.createGame(17, "public")).thenReturn(state);

        Map<String, String> response = controller.createGame(request);

        assertEquals("lobby", response.get("status"));
        assertEquals("17", response.get("gameId"));
        verify(gameStateService).createGame(17, "public");
    }

    @Test
    @DisplayName("[CHARACTERIZATION] join returns 200 and delegates when player is not already in a game")
    void currentBehavior_joinLobbyReturnsSuccessAfterControllerPrechecks() {
        when(gameStateService.isPlayerInAnyGame(2)).thenReturn(false);
        when(gameStateService.getPlayersInGame(1)).thenReturn(Set.of("1"));

        ResponseEntity<String> response = controller.addPlayer(1, 2);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals("Player added to game.", response.getBody());
        verify(gameStateService).addPlayerToGame(1, 2);
    }

    @Test
    @DisplayName("[CHARACTERIZATION] duplicate join is rejected by the controller before service add")
    void currentBehavior_duplicateJoinReturnsBadRequest() {
        when(gameStateService.isPlayerInAnyGame(2)).thenReturn(true);

        ResponseEntity<String> response = controller.addPlayer(1, 2);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertEquals("Player is already in another game.", response.getBody());
        verify(gameStateService, never()).addPlayerToGame(1, 2);
    }

    @Test
    @DisplayName("[CHARACTERIZATION] start with two players delegates the supplied playerId as current owner check input")
    void currentBehavior_startWithTwoPlayersReturnsInProgressSnapshot() {
        when(gameStateService.getPlayersInGame(1)).thenReturn(Set.of("1", "2"));

        ResponseEntity<?> response = controller.startGame(1, 1);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        Map<?, ?> body = assertInstanceOf(Map.class, response.getBody());
        assertEquals("inProgress", body.get("status"));
        assertEquals(1, body.get("gameId"));
        verify(gameStateService).startGame(1, 1);
    }

    @Test
    @DisplayName("[CHARACTERIZATION][KNOWN SECURITY DEFECT] remove accepts playerId without an authenticated actor")
    void currentBehavior_removePlayerHasNoAuthenticatedActorAtControllerBoundary() {
        // REVAMP-016/017 must replace this current public-controller behavior;
        // this test records it rather than approving it as the target contract.
        String response = controller.removePlayer(1, 2);

        assertEquals("Player removed from game.", response);
        verify(gameStateService).removePlayerFromGame(1, 2);
    }

    @Test
    @DisplayName("[CHARACTERIZATION][KNOWN SECURITY DEFECT] check-end directly exposes mutation-capable service call")
    void currentBehavior_checkEndDirectlyInvokesStateChangingService() {
        when(gameStateService.checkEndCondition(1)).thenReturn(true);

        String response = controller.checkGameEnd(1);

        assertEquals("Game ended due to condition.", response);
        verify(gameStateService).checkEndCondition(1);
    }
}
