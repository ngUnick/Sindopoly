package com.example.Sindopoly_Java.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import com.example.Sindopoly_Java.service.orchestrator.TurnService;

import java.util.Set;

@Component
public class GameLoopScheduler {

    @Autowired
    private RedisTemplate<String, String> redisTemplate;

    @Autowired
    private GameStateService gameStateService;

    @Autowired
    private PlayerStateService playerStateService;

    @Autowired
    private TurnService turnService;

    @Autowired
    private SimpMessagingTemplate broker;

    /**
     * Every 2 seconds, bump each game's turnAge,
     * and if it exceeds turnTimeout, mark AFK, skip the turn, etc.
     */
    @Scheduled(fixedRate = 2000)
    public void pollTurnTimers() {
    //     Set<String> keys = redisTemplate.keys("game:*");
    //     if (keys == null || keys.isEmpty()) return;

    //     for (String key : keys) {
    //         if (key.endsWith(":players")) continue;

    //         // parse gameId out of "game:123"
    //         int gameId;
    //         try {
    //             gameId = Integer.parseInt(key.substring(5));
    //         } catch (NumberFormatException ex) {
    //             continue;
    //         }

    //         // bump the per‐turn age
    //         int age   = safeInt((String) redisTemplate.opsForHash().get(key, "turnAge"),    0);
    //         int limit = safeInt((String) redisTemplate.opsForHash().get(key, "turnTimeout"), 60);
    //         age += 2;
    //         redisTemplate.opsForHash().put(key, "turnAge", String.valueOf(age));

    //         if (age < limit) continue;

    //         // time's up: who's on deck?
    //         String stalled = (String) redisTemplate.opsForHash().get(key, "playerTurn");
    //         if (stalled == null || stalled.isBlank()) continue;

    //         int pid;
    //         try {
    //             pid = Integer.parseInt(stalled);
    //         } catch (NumberFormatException ex) {
    //             continue;
    //         }

    //         System.out.println("Skipping stalled player " + pid + " in game " + gameId);

    //         // 1️⃣ mark them AFK
    //         playerStateService.markAfk(pid);

    //         // 2️⃣ clear any pending optional action
    //         gameStateService.clearOptionalAction(gameId);

    //         // 3️⃣ finish & rotate (also resets timers and broadcasts via STOMP)
    //         turnService.finishTurn(gameId);

    //         // 4️⃣ let front-end know we skipped
    //         broker.convertAndSend("/topic/game/" + gameId,
    //                 java.util.Map.of("event", "turnSkipped", "playerId", pid));

    //         // 5️⃣ reset this game's turnAge
    //         redisTemplate.opsForHash().put(key, "turnAge", "0");
    //     }
    // }

    // private int safeInt(String str, int fallback) {
    //     try { return Integer.parseInt(str); }
    //     catch (Exception e) { return fallback; }
    // }
}
}