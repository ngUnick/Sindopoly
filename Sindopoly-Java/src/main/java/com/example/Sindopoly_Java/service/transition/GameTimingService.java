package com.example.Sindopoly_Java.service.transition;

import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;

@Service
public class GameTimingService {
    private final Clock clock;
    private final GameLifecycleProperties properties;

    public GameTimingService(Clock clock, GameLifecycleProperties properties) {
        this.clock = clock;
        this.properties = properties;
    }

    public Instant now() { return clock.instant(); }
    public long nowEpochMs() { return now().toEpochMilli(); }
    public long newTurnDeadlineEpochMs() {
        return now().plusSeconds(properties.getTurnTimeoutSeconds()).toEpochMilli();
    }
    public long terminalRetentionSeconds() { return properties.getTerminalRetentionSeconds(); }
}
