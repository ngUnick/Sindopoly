package com.example.Sindopoly_Java.realtime;

import java.util.List;
import java.util.Objects;

public record GameEventPayload(
        GameEventReason reason,
        Integer actorPlayerId,
        List<GameEventDetail> details) {
    public GameEventPayload {
        Objects.requireNonNull(reason, "reason");
        details = details == null ? List.of() : List.copyOf(details);
        if (details.size() > 12) throw new IllegalArgumentException("event detail limit exceeded");
        if (actorPlayerId != null && actorPlayerId <= 0) {
            throw new IllegalArgumentException("actorPlayerId must be positive");
        }
    }

    public GameEventPayload(GameEventReason reason) {
        this(reason, null, List.of());
    }
}
