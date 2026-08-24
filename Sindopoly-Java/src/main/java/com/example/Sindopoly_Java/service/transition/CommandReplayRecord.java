package com.example.Sindopoly_Java.service.transition;

import com.fasterxml.jackson.databind.JsonNode;

/** Durable-enough retry result stored with the active Redis game lifecycle. */
public record CommandReplayRecord(
        String fingerprint,
        long stateVersion,
        JsonNode result) {
}
