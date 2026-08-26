package com.example.Sindopoly_Java.service;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.example.Sindopoly_Java.service.transition.GameLifecycleCommandService;
import com.example.Sindopoly_Java.service.transition.TurnCommandService;
import com.example.Sindopoly_Java.service.transition.RedisGameDiscovery;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Component
public class GameLoopScheduler {
    private static final Logger log = LoggerFactory.getLogger(GameLoopScheduler.class);

    private final RedisGameDiscovery discovery;
    private final GameLifecycleCommandService lifecycleCommands;
    private final TurnCommandService turnCommands;

    public GameLoopScheduler(RedisGameDiscovery discovery, GameLifecycleCommandService lifecycleCommands,
                             TurnCommandService turnCommands) {
        this.discovery = discovery;
        this.lifecycleCommands = lifecycleCommands;
        this.turnCommands = turnCommands;
    }

    /**
     * Every 2 seconds, scan all games and end any that meet the end‐of‐game criteria.
     * When a game ends, broadcast a "gameEnded" event on its topic.
     */
    @Scheduled(fixedRate = 2000)
    public void pollEndConditions() {
        for (int gameId : discovery.activeGameIds()) {
            try {
                if (!lifecycleCommands.processScheduledGame(gameId)) turnCommands.timeoutIfDue(gameId);
            } catch (RuntimeException exception) {
                // A concurrent command may win CAS; the next poll observes authoritative state.
                log.warn("Scheduled processing deferred for game {}", gameId, exception);
            }
        }
    }

    // Completed game-scoped state is retained for the configured terminal TTL; Redis cleans it up.
}
