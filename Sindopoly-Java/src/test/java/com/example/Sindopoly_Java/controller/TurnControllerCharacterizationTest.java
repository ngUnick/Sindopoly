package com.example.Sindopoly_Java.controller;

import com.example.Sindopoly_Java.model.dto.ActionRequestDto;
import com.example.Sindopoly_Java.model.dto.ActionResultDto;
import com.example.Sindopoly_Java.model.dto.ThrowResultDto;
import com.example.Sindopoly_Java.service.GameStateService;
import com.example.Sindopoly_Java.service.orchestrator.TurnService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TurnControllerCharacterizationTest {

    @Mock
    private TurnService turnService;

    @Mock
    private GameStateService gameStateService;

    @InjectMocks
    private TurnController controller;

    @Test
    @DisplayName("[CHARACTERIZATION] throw forwards path game/player IDs and returns service result")
    void currentBehavior_throwUsesPathIdsForTurnServiceInvocation() {
        ThrowResultDto expected = new ThrowResultDto(7, 12, false, 5, 200);
        when(turnService.throwDice(3, 4)).thenReturn(expected);

        ThrowResultDto response = controller.throwDice(3, 4);

        assertEquals(expected, response);
        verify(turnService).throwDice(3, 4);
    }

    @Test
    @DisplayName("[CHARACTERIZATION][KNOWN SECURITY DEFECT] action ignores mismatched path IDs and forwards body IDs")
    void currentBehavior_actionBodyIdentityWinsOverMismatchedPathIdentity() {
        // REVAMP-017 must reject this mismatch. The current controller passes
        // the body untouched, so TurnService uses its gameId/playerId instead.
        ActionRequestDto body = new ActionRequestDto(99, 77, 5, true);
        ActionResultDto expected = new ActionResultDto(1200, List.of(8), 2);
        when(turnService.applyAction(body)).thenReturn(expected);

        ActionResultDto response = controller.doAction(1, 2, body);

        assertEquals(expected, response);
        verify(turnService).applyAction(body);
    }

    @Test
    @DisplayName("[CHARACTERIZATION] pass clears the pending action, finishes turn, and returns passed")
    void currentBehavior_passClearsOptionalActionAndFinishesTurn() {
        ResponseEntity<?> response = controller.passOptional(3, 4);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(Map.of("status", "passed"), response.getBody());
        verify(gameStateService).assertOptionalAction(3, 4);
        verify(gameStateService).clearOptionalAction(3);
        verify(turnService).finishTurn(3);
    }
}
