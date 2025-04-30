package com.example.Sindopoly_Java.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.Set;

@Component
public class GameLoopScheduler {

    // private static final String GAME_PREFIX = "game:";

    @Autowired
    private RedisTemplate<String, String> redisTemplate;

    @Autowired
    private GameStateService gameStateService;

    /**
     * Check end conditions for all games every 10 seconds
     */
    @Scheduled(fixedRate = 10000)        // every 10 s
    public void pollTurnTimers() {

        Set<String> keys = redisTemplate.keys("game:*");
        if (keys.isEmpty()) return;

        for (String key : keys) {
            if (key.endsWith(":players")) continue;

            int gameId;
            try { gameId = Integer.parseInt(key.substring(5)); }
            catch (NumberFormatException ex) { continue; }

            // -------- read timer fields ----------
            String ageStr     = (String) redisTemplate.opsForHash().get(key, "turnAge");
            String limitStr   = (String) redisTemplate.opsForHash().get(key, "turnTimeout");

            int age   = ageStr   == null ? 0  : Integer.parseInt(ageStr);
            int limit = limitStr == null ? 60 : Integer.parseInt(limitStr);

            // bump age by scheduler interval (10 s)
            redisTemplate.opsForHash().put(key, "turnAge", String.valueOf(age + 10));

            if (age + 10 < limit) continue;                 // still time left

            // ------------- timeout reached -------------
            String stalled = (String) redisTemplate.opsForHash().get(key, "playerTurn");
            System.out.println("Skipping stalled player " + stalled + " in game " + gameId);

            /* mark player AFK so UI can show it */
            gameStateService.setPlayerField(Integer.parseInt(stalled), "afk", "true");

            // rotate to next player
            gameStateService.forceRotateTurn(gameId, stalled);

            // reset age
            redisTemplate.opsForHash().put(key, "turnAge", "0");
        }
    }

}
