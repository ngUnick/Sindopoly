package com.example.Sindopoly_Java.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.util.Set;

@Component
public class GameLoopScheduler {

    @Autowired
    private RedisTemplate<String, String> redisTemplate;

    @Autowired
    private GameStateService gameStateService;

    @Autowired
    private SimpMessagingTemplate broker;

    /**
     * Every 2 seconds, scan all games and end any that meet the end‐of‐game criteria.
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

            boolean ended = gameStateService.checkEndCondition(gameId);
            if (ended) {
                broker.convertAndSend(
                    "/topic/game/" + gameId,
                    java.util.Map.of("event", "gameEnded", "gameId", gameId)
                );
            }
        }
    }
}
