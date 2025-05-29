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
    @Scheduled(fixedRate = 2000)          // every 2 s
    public void pollTurnTimers() {

        Set<String> keys = redisTemplate.keys("game:*");
        if (keys == null || keys.isEmpty()) return;

        for (String key : keys) {
            if (key.endsWith(":players")) continue;        // skip sets

            /* game id ---------------------------------------------------- */
            int gameId;
            try {
                gameId = Integer.parseInt(key.substring(5));   // "game:4"
            } catch (NumberFormatException ex) {
                continue;                                      // malformed key
            }

            /* turnAge ---------------------------------------------------- */
            int age = safeInt((String) redisTemplate.opsForHash().get(key, "turnAge"), 0);

            /* timeout limit --------------------------------------------- */
            int limit = safeInt((String) redisTemplate.opsForHash().get(key, "turnTimeout"), 60);

            /* bump timer by scheduler interval (2 s) --------------------- */
            age += 2;
            redisTemplate.opsForHash().put(key, "turnAge", String.valueOf(age));

            if (age < limit) continue;                         // still time left

            /* player on turn -------------------------------------------- */
            String stalled = (String) redisTemplate.opsForHash().get(key, "playerTurn");
            if (stalled == null || stalled.isBlank()) {        // nothing to rotate
                continue;
            }

            System.out.println("Skipping stalled player " + stalled + " in game " + gameId);

            /* mark AFK safely ------------------------------------------- */
            try {
                gameStateService.setPlayerField(
                    Integer.parseInt(stalled), "afk", "true");
            } catch (NumberFormatException ignored) {
                /* skip bad id */
            }

            /* rotate turn + reset timer ---------------------------------- */
            gameStateService.forceRotateTurn(gameId, stalled);
            redisTemplate.opsForHash().put(key, "turnAge", "0");
        }
    }

    /* helper -------------------------------------------------------------- */
    private int safeInt(String str, int fallback) {
        try { return Integer.parseInt(str); } catch (Exception e) { return fallback; }
    }


}
