package com.example.Sindopoly_Java.service.orchestrator;

import com.example.Sindopoly_Java.model.dto.ActionRequestDto;
import com.example.Sindopoly_Java.model.dto.ActionResultDto;
import com.example.Sindopoly_Java.model.dto.SquareEventDto;
import com.example.Sindopoly_Java.model.dto.ThrowResultDto;
import com.example.Sindopoly_Java.repository.PlayerRepository;
import com.example.Sindopoly_Java.service.GameStateService;
import com.example.Sindopoly_Java.service.PlayerStateService;
import com.example.Sindopoly_Java.service.core.BankruptcyService;
import com.example.Sindopoly_Java.service.core.DiceService;
import com.example.Sindopoly_Java.service.core.SquareActionService;
import com.example.Sindopoly_Java.utils.ValidationUtils;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TurnServiceCharacterizationTest {

    @Mock private GameStateService gameStateService;
    @Mock private PlayerStateService playerStateService;
    @Mock private PlayerRepository playerRepository;
    @Mock private DiceService diceService;
    @Mock private BankruptcyService bankruptcyService;
    @Mock private SquareActionService squareActionService;
    @Mock private SimpMessagingTemplate broker;

    private TurnService turnService;

    @BeforeEach
    void setUp() {
        turnService = new TurnService(
            gameStateService,
            playerStateService,
            new ValidationUtils(playerRepository),
            diceService,
            bankruptcyService,
            squareActionService,
            broker
        );
    }

    @Test
    @DisplayName("[CHARACTERIZATION] active player throw writes optional state and does not publish a WebSocket event")
    void currentBehavior_activeThrowMovesPlayerAndDoesNotPublishThrowEvent() {
        Map<String, String> game = new HashMap<>(Map.of("status", "inProgress", "playerTurn", "1"));
        Map<String, Object> player = new HashMap<>(Map.of(
            "position", "0", "money", "1500", "jail", "false", "jailTime", "0"));
        when(playerRepository.existsById(1)).thenReturn(true);
        when(gameStateService.getGame(7)).thenReturn(game);
        when(playerStateService.getPlayerState(1)).thenReturn(player);
        when(bankruptcyService.isBankrupt(1500)).thenReturn(false);
        when(diceService.roll()).thenReturn(4);
        when(squareActionService.peekSquare(1, 4, 7)).thenReturn(SquareEventDto.buyOffer(4, 200));

        ThrowResultDto result = turnService.throwDice(7, 1);

        assertEquals(new ThrowResultDto(4, 4, false, 5, 200), result);
        assertEquals("4", player.get("position"));
        assertEquals("false", player.get("afk"));
        // Current flow persists once after clearing AFK and again after movement.
        verify(playerStateService, times(2)).savePlayerState(1, player);
        verify(gameStateService).setGameField(7, "lastDice", "4");
        ArgumentCaptor<String> optionalJson = ArgumentCaptor.forClass(String.class);
        verify(gameStateService).setGameField(eq(7), eq("optionalAction"), optionalJson.capture());
        assertTrue(optionalJson.getValue().contains("buyOffer"));
        // The current throw path returns HTTP data but does not call the broker.
        verifyNoInteractions(broker);
    }

    @Test
    @DisplayName("[CHARACTERIZATION] wrong-player throw is rejected before player state is read")
    void currentBehavior_wrongPlayerThrowRejectsWithCurrentMessage() {
        Map<String, String> game = Map.of("status", "inProgress", "playerTurn", "1");
        when(playerRepository.existsById(2)).thenReturn(true);
        when(gameStateService.getGame(7)).thenReturn(game);

        IllegalStateException exception = assertThrows(
            IllegalStateException.class,
            () -> turnService.throwDice(7, 2)
        );

        assertEquals("Not your turn.", exception.getMessage());
        verify(playerStateService, never()).getPlayerState(2);
    }

    @Test
    @DisplayName("[CHARACTERIZATION] optional buy action clears state, rotates turn, and publishes actionCompleted")
    void currentBehavior_optionalBuyUsesBodyIdentityAndPublishesActionCompleted() {
        Map<String, String> game = new HashMap<>(Map.of(
            "optionalAction", "{\"type\":\"buyOffer\",\"squareId\":8,\"price\":200}",
            "playerTurn", "1"));
        Map<String, Object> player = new HashMap<>(Map.of("money", "1500"));
        when(gameStateService.getGame(7)).thenReturn(game);
        when(gameStateService.getPlayersInGame(7)).thenReturn(Set.of("1", "2"));
        when(playerStateService.getPlayerState(1)).thenReturn(player);
        doAnswer(invocation -> {
            if ("playerTurn".equals(invocation.getArgument(1))) {
                game.put("playerTurn", invocation.getArgument(2));
            }
            return null;
        }).when(gameStateService).setGameField(eq(7), any(), any());

        ActionResultDto result = turnService.applyAction(new ActionRequestDto(7, 1, 5, true));

        assertEquals(new ActionResultDto(1500, List.of(), 2), result);
        verify(squareActionService).completeOptionalBuy(7, 1, 8);
        verify(gameStateService).clearOptionalAction(7);
        verify(gameStateService).setGameField(7, "playerTurn", "2");
        verify(broker).convertAndSend(eq("/topic/game/7"), any(Map.class));
    }
}
