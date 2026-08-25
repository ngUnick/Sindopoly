package com.example.Sindopoly_Java.realtime;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public record GameEventEnvelope(
        UUID eventId,
        GameEventType eventType,
        int gameId,
        long stateVersion,
        Instant occurredAt,
        GameEventPayload payload) {
    public GameEventEnvelope {
        Objects.requireNonNull(eventId, "eventId");
        Objects.requireNonNull(eventType, "eventType");
        Objects.requireNonNull(occurredAt, "occurredAt");
        Objects.requireNonNull(payload, "payload");
        if (gameId <= 0) throw new IllegalArgumentException("gameId must be positive");
        if (stateVersion < 0) throw new IllegalArgumentException("stateVersion must be non-negative");
    }
}
