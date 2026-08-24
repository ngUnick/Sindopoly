package com.example.Sindopoly_Java.service.transition;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/** Binds an idempotency key to actor, type, version, game, and normalized intent. */
public final class CommandFingerprint {

    private CommandFingerprint() {
    }

    public static String create(
            int gameId,
            String actor,
            String commandType,
            CommandMetadata metadata,
            String normalizedPayload) {
        String canonical = gameId + "\n" + actor + "\n" + commandType + "\n"
                + metadata.expectedStateVersion() + "\n" + normalizedPayload;
        try {
            return HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(canonical.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is required by the Java runtime", exception);
        }
    }
}
