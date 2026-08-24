package com.example.Sindopoly_Java.service.transition;

import org.springframework.stereotype.Component;

/** Keeps HTTP header parsing out of application/domain services. */
@Component
public class CommandMetadataResolver {

    public CommandMetadata resolve(String commandId, String expectedVersion) {
        if (commandId == null || commandId.isBlank()) {
            throw new IllegalArgumentException("Missing " + CommandMetadata.COMMAND_ID_HEADER);
        }
        if (expectedVersion == null || expectedVersion.isBlank()) {
            throw new IllegalArgumentException("Missing " + CommandMetadata.EXPECTED_VERSION_HEADER);
        }
        try {
            return new CommandMetadata(commandId, Long.parseLong(expectedVersion));
        } catch (NumberFormatException exception) {
            throw new IllegalArgumentException("Expected state version must be an integer", exception);
        }
    }
}
