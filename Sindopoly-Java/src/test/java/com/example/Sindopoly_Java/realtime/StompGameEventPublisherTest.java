package com.example.Sindopoly_Java.realtime;

import com.example.Sindopoly_Java.service.transition.GameTimingService;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.time.Instant;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class StompGameEventPublisherTest {
    @Test
    void publishesTypedCommittedVersionEnvelope() throws Exception {
        SimpMessagingTemplate broker = mock(SimpMessagingTemplate.class);
        GameTimingService timing = mock(GameTimingService.class);
        when(timing.now()).thenReturn(Instant.parse("2026-08-25T10:00:00Z"));
        new StompGameEventPublisher(broker, timing).publish(
                7, 12, GameEventType.TURN_UPDATED, GameEventReason.ROLL_COMPLETED);

        var envelope = org.mockito.ArgumentCaptor.forClass(GameEventEnvelope.class);
        verify(broker).convertAndSend(eq("/topic/game/7"), envelope.capture());
        assertEquals(12, envelope.getValue().stateVersion());
        assertEquals(GameEventReason.ROLL_COMPLETED, envelope.getValue().payload().reason());
        String json = new com.fasterxml.jackson.databind.ObjectMapper().findAndRegisterModules()
                .writeValueAsString(envelope.getValue());
        org.assertj.core.api.Assertions.assertThat(json)
                .contains("\"gameId\":7", "\"stateVersion\":12", "\"eventType\":\"TURN_UPDATED\"");
        assertThrows(IllegalArgumentException.class, () -> new GameEventEnvelope(
                UUID.randomUUID(), GameEventType.TURN_UPDATED, 0, 1, Instant.EPOCH,
                new GameEventPayload(GameEventReason.ROLL_COMPLETED)));
    }

    @Test
    void brokerFailureCannotFailTheCommittedCommand() {
        SimpMessagingTemplate broker = mock(SimpMessagingTemplate.class);
        GameTimingService timing = mock(GameTimingService.class);
        when(timing.now()).thenReturn(Instant.EPOCH);
        doThrow(new IllegalStateException("broker unavailable")).when(broker).convertAndSend(any(), any(Object.class));

        assertDoesNotThrow(() -> new StompGameEventPublisher(broker, timing).publish(
                7, 2, GameEventType.LOBBY_UPDATED, GameEventReason.PLAYER_JOINED));
        when(timing.now()).thenThrow(new IllegalStateException("clock unavailable"));
        assertDoesNotThrow(() -> new StompGameEventPublisher(broker, timing).publish(
                7, 2, GameEventType.LOBBY_UPDATED, GameEventReason.PLAYER_JOINED));
    }
}
