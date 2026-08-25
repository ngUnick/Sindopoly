package com.example.Sindopoly_Java.realtime;

public interface GameEventPublisher {
    void publish(int gameId, long stateVersion, GameEventType eventType, GameEventReason reason);
}
