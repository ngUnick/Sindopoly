package com.example.Sindopoly_Java.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.Set;

@Component
public class GameLoopScheduler {

    private static final String GAME_PREFIX = "game:";

    @Autowired
    private RedisTemplate<String, String> redisTemplate;

    @Autowired
    private GameStateService gameStateService;

    /**
     * Check end conditions for all games every 10 seconds
     */
    @Scheduled(fixedRate = 10000)
    public void checkEndConditionsForAllGames() {
        Set<String> keys = redisTemplate.keys(GAME_PREFIX + "*");
        if (keys.isEmpty()) return;

        for (String key : keys) {
            if (!key.endsWith(":players")) {
                try {
                    int gameId = Integer.parseInt(key.replace(GAME_PREFIX, ""));
                    gameStateService.checkEndCondition(gameId);
                } catch (NumberFormatException ignored) {
                    // Skip any keys that aren't in the expected format (e.g., "game:global_settings")
                }
            }
        }
    }
}
