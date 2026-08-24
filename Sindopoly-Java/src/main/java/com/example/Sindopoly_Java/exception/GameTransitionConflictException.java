package com.example.Sindopoly_Java.exception;

/** A bounded optimistic-concurrency or command-identity conflict. */
public class GameTransitionConflictException extends RuntimeException {

    private final String reason;
    private final Long currentStateVersion;

    public GameTransitionConflictException(String reason, String message, Long currentStateVersion) {
        super(message);
        this.reason = reason;
        this.currentStateVersion = currentStateVersion;
    }

    public String getReason() {
        return reason;
    }

    public Long getCurrentStateVersion() {
        return currentStateVersion;
    }
}
