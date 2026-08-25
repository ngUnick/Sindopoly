package com.example.Sindopoly_Java.service.transition;

import jakarta.annotation.PostConstruct;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "sindopoly.game")
public class GameLifecycleProperties {
    private long turnTimeoutSeconds = 60;
    private long terminalRetentionSeconds = 300;

    @PostConstruct
    void validate() {
        if (turnTimeoutSeconds <= 0 || terminalRetentionSeconds <= 0) {
            throw new IllegalStateException("Game timeout and retention values must be positive");
        }
    }

    public long getTurnTimeoutSeconds() { return turnTimeoutSeconds; }
    public void setTurnTimeoutSeconds(long value) { turnTimeoutSeconds = value; }
    public long getTerminalRetentionSeconds() { return terminalRetentionSeconds; }
    public void setTerminalRetentionSeconds(long value) { terminalRetentionSeconds = value; }
}
