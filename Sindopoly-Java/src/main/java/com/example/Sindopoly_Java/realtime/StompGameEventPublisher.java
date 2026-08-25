package com.example.Sindopoly_Java.realtime;

import com.example.Sindopoly_Java.service.transition.GameTimingService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

import java.util.UUID;

/** Emits best-effort wake-up notifications only after the authoritative Redis commit succeeds. */
@Component
public class StompGameEventPublisher implements GameEventPublisher {
    private static final Logger log = LoggerFactory.getLogger(StompGameEventPublisher.class);
    private final SimpMessagingTemplate broker;
    private final GameTimingService timing;

    public StompGameEventPublisher(SimpMessagingTemplate broker, GameTimingService timing) {
        this.broker = broker;
        this.timing = timing;
    }

    @Override
    public void publish(int gameId, long stateVersion, GameEventType eventType, GameEventReason reason) {
        try {
            GameEventEnvelope envelope = new GameEventEnvelope(UUID.randomUUID(), eventType, gameId,
                    stateVersion, timing.now(), new GameEventPayload(reason));
            broker.convertAndSend("/topic/game/" + gameId, envelope);
        } catch (RuntimeException exception) {
            // Delivery is intentionally non-transactional: snapshot polling/reconnect repairs missed events.
            log.warn("Game notification failed for game {}, type {}, version {}", gameId, eventType, stateVersion);
        }
    }
}
