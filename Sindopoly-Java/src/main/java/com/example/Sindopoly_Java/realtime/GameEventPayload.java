package com.example.Sindopoly_Java.realtime;

import java.util.Objects;

public record GameEventPayload(GameEventReason reason) {
    public GameEventPayload {
        Objects.requireNonNull(reason, "reason");
    }
}
