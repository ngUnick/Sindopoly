package com.example.Sindopoly_Java.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.Set;
import com.example.Sindopoly_Java.service.transition.GameLifecycleCommandService;
import com.example.Sindopoly_Java.service.transition.TurnCommandService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Component
public class GameLoopScheduler {
    private static final Logger log = LoggerFactory.getLogger(GameLoopScheduler.class);

    @Autowired
    private RedisTemplate<String, String> redisTemplate;

    @Autowired
    private GameLifecycleCommandService lifecycleCommands;

    @Autowired
    private TurnCommandService turnCommands;

    /**
     * Every 2 seconds, scan all games and end any that meet the end‐of‐game criteria.
     * When a game ends, broadcast a "gameEnded" event on its topic.
     */
    @Scheduled(fixedRate = 2000)
    public void pollEndConditions() {
        Set<String> keys = redisTemplate.keys("game:*");
        if (keys == null) return;

        for (String key : keys) {
            int gameId;
            try {
                String suffix = key.substring("game:".length());
                if (!suffix.chars().allMatch(Character::isDigit)) continue;
                gameId = Integer.parseInt(suffix);
            } catch (NumberFormatException ex) {
                continue;
            }
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
