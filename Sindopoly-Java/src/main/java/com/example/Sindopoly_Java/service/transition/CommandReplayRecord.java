package com.example.Sindopoly_Java.service.transition;

import com.fasterxml.jackson.databind.JsonNode;

/** Durable-enough retry result stored with the active Redis game lifecycle. */
public record CommandReplayRecord(
        String fingerprint,
        long stateVersion,
        JsonNode result,
        String resultJson) {

    /** Reads both the legacy object form and the exact-JSON form used for new commands. */
    JsonNode semanticResult(com.fasterxml.jackson.databind.ObjectMapper mapper) {
        if (resultJson != null) {
            try {
                return mapper.readTree(resultJson);
            } catch (com.fasterxml.jackson.core.JsonProcessingException exception) {
                throw new IllegalStateException("Stored command replay result JSON is malformed", exception);
            }
        }
        if (result == null) throw new IllegalStateException("Stored command replay result is missing");
        return result;
    }
}
