package com.example.Sindopoly_Java.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.Set;
import com.example.Sindopoly_Java.service.transition.GameLifecycleCommandService;

@Component
public class GameLoopScheduler {

    @Autowired
    private RedisTemplate<String, String> redisTemplate;

    @Autowired
    private GameLifecycleCommandService lifecycleCommands;

    /**
     * Every 2 seconds, scan all games and end any that meet the end‐of‐game criteria.
     * When a game ends, broadcast a "gameEnded" event on its topic.
     */
    @Scheduled(fixedRate = 2000)
    public void pollEndConditions() {
        Set<String> keys = redisTemplate.keys("game:*");
        if (keys == null) return;

        for (String key : keys) {
            // skip the players‐set entries
            if (key.endsWith(":players")) continue;

            int gameId;
            try {
                gameId = Integer.parseInt(key.substring("game:".length()));
            } catch (NumberFormatException ex) {
                continue;
            }

            lifecycleCommands.completeIfTerminal(gameId);
        }
    }

    // Completed state is retained for its 30-second transition TTL; Redis performs cleanup.
}
