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

            // returns true if we've just marked the game ended
            boolean ended = gameStateService.checkEndCondition(gameId);
            if (ended) {
                // broadcast end‐of‐game to subscribers
                broker.convertAndSend(
                    "/topic/game/" + gameId,
                    java.util.Map.of(
                        "event",  "gameEnded",
                        "gameId", gameId,
                        "winner", redisTemplate.opsForHash().get("game:" + gameId, "winner")
                    )
                );
            }
        }
    }

    @Scheduled(fixedRate = 5000)
    public void cleanupEndedGames() {
        Set<String> keys = redisTemplate.keys("game:*:players");
        if (keys == null) return;

        for (String playersKey : keys) {
            // split "game:123:players" → ["game","123","players"]
            String[] parts = playersKey.split(":");
            int gameId = Integer.parseInt(parts[1]);

            String gameKey = "game:" + gameId;
            String status = (String) redisTemplate.opsForHash().get(gameKey, "status");
            if ("ended".equals(status)) {
                gameStateService.deleteGameAndPlayers(gameId);
            }
        }
    }
}
