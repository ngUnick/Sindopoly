package com.example.Sindopoly_Java.service.transition;

import java.util.Locale;
import java.util.UUID;

/** Retry identity and optimistic concurrency precondition for one command intent. */
public record CommandMetadata(String commandId, long expectedStateVersion) {

    public static final String COMMAND_ID_HEADER = "X-Sindopoly-Command-Id";
    public static final String EXPECTED_VERSION_HEADER = "X-Sindopoly-Expected-Version";
    public static final long MAX_EXPECTED_STATE_VERSION = 9_007_199_254_740_990L;

    public CommandMetadata {
        if (commandId == null || commandId.length() != 36) {
            throw new IllegalArgumentException("Command ID must be a canonical UUID");
        }
        String normalized = commandId.toLowerCase(Locale.ROOT);
        try {
            if (!UUID.fromString(normalized).toString().equals(normalized)) {
                throw new IllegalArgumentException("Command ID must be a canonical UUID");
            }
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("Command ID must be a canonical UUID", exception);
        }
        commandId = normalized;
        if (expectedStateVersion < -1 || expectedStateVersion > MAX_EXPECTED_STATE_VERSION) {
            throw new IllegalArgumentException("Expected state version is out of range");
        }
    }

    public void requireExistingGame() {
        if (expectedStateVersion < 0) {
            throw new IllegalArgumentException("Existing-game commands require a non-negative expected version");
        }
    }

    public void requireCreate() {
        if (expectedStateVersion != -1) {
            throw new IllegalArgumentException("Game creation requires expected version -1");
        }
    }
}
