package com.example.Sindopoly_Java.service.transition;

import com.fasterxml.jackson.databind.JsonNode;

public record TransitionExecution(
        Status status,
        long stateVersion,
        JsonNode semanticResult) {

    public enum Status {
        APPLIED,
        REPLAY,
        NO_OP
    }

    public boolean replayed() {
        return status == Status.REPLAY;
    }

    public boolean shouldPublish() {
        return status == Status.APPLIED;
    }
}
