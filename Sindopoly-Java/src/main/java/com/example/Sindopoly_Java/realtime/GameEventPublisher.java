package com.example.Sindopoly_Java.realtime;

public interface GameEventPublisher {
    void publish(int gameId, long stateVersion, GameEventType eventType, GameEventPayload payload);

    default void publish(int gameId, long stateVersion, GameEventType eventType, GameEventReason reason) {
        publish(gameId, stateVersion, eventType, new GameEventPayload(reason));
    }
}
