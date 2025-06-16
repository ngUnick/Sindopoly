package com.example.Sindopoly_Java.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import com.example.Sindopoly_Java.utils.ValidationUtils;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class PlayerStateService {
    private static final String PLAYER_PREFIX = "player:";

    private final RedisTemplate<String, String> redisTemplate;
    private final HashOperations<String, String, Object> hashOps;
    private final ValidationUtils validationUtils;

    @Autowired
    public PlayerStateService(RedisTemplate<String, String> redisTemplate,
                              ValidationUtils validationUtils) {
        this.redisTemplate    = redisTemplate;
        this.hashOps          = redisTemplate.opsForHash();
        this.validationUtils  = validationUtils;
    }

    /**
     * Seed a brand-new player state in Redis:
     *   position=0, money=1500, jail=false, jailTime=0,
     *   bankrupt=false, properties=[], afk=false
     * Call this once when a player is created or joins a game.
     */
    public void initializePlayer(int playerId) {
        String key = PLAYER_PREFIX + playerId;

        // (Optional) guard against re-initializing an existing player:
        // if (redisTemplate.hasKey(key)) throw new IllegalStateException("Already initialized");

        Map<String,String> init = Map.of(
        "position",  "0",
        "money",     "1500",
        "jail",      "false",
        "jailTime",  "0",
        "bankrupt",  "false",
        "properties","[]",
        "afk",       "false"
        );

        // write everything atomically
        hashOps.putAll(key, init);

        // optionally expire stale player-hashes after 2 hours
        redisTemplate.expire(key, Duration.ofHours(2));
    }

    /**
     * Mark a player as AFK=true in Redis.
     * Use when you detect a timeout.
     */
    public void markAfk(int playerId) {
        validationUtils.validatePlayerExists(playerId);
        String key = PLAYER_PREFIX + playerId;
        hashOps.put(key, "afk", true);
    }

    /**
     * Clear the AFK flag (set afk=false).
     * Call at the start of each new turn for that player.
     */
    public void clearAfk(int playerId) {
        validationUtils.validatePlayerExists(playerId);
        String key = PLAYER_PREFIX + playerId;
        hashOps.put(key, "afk", false);
    }

    /**
     * Save arbitrary updates to a player state hash.
     * All values are converted to String to satisfy Redis’s StringRedisSerializer.
     */
    public void savePlayerState(int playerId, Map<String, Object> playerData) {
        validationUtils.validatePlayerExists(playerId);
        String playerKey = PLAYER_PREFIX + playerId;

        // Coerce every value to String
        Map<String, String> stringData = playerData.entrySet().stream()
            .collect(Collectors.toMap(
                Map.Entry::getKey,
                e -> e.getValue() == null
                        ? ""                         // or null-safe default
                        : e.getValue().toString()
            ));

        hashOps.putAll(playerKey, stringData);
    }


    /**
     * Fetch the full Redis hash of a player.
     */
    public Map<String, Object> getPlayerState(int playerId) {
        String playerKey = PLAYER_PREFIX + playerId;
        return hashOps.entries(playerKey);
    }

    /**
     * Remove a player's state from Redis entirely.
     */
    public void deletePlayer(int playerId) {
        String playerKey = PLAYER_PREFIX + playerId;
        redisTemplate.delete(playerKey);
    }

    /**
     * Pay to get out of jail: deduct fee, clear jail flags.
     */
    public void payToExitJail(int playerId, int fee) {
        Map<String, Object> p = getPlayerState(playerId);
        int money = Integer.parseInt(p.get("money").toString());
        if (money < fee) {
            throw new IllegalStateException("Insufficient funds");
        }
        p.put("money",    money - fee);
        p.put("jail",     false);
        p.put("jailTime", 0);
        savePlayerState(playerId, p);
    }

    /**
     * Adds the given amount to the player's balance.
     */
    public void grantMoney(int playerId, int amount) {
        String key = PLAYER_PREFIX + playerId;
        String moneyStr = (String) redisTemplate.opsForHash().get(key, "money");
        int current = moneyStr == null ? 0 : Integer.parseInt(moneyStr);
        redisTemplate.opsForHash().put(key, "money", String.valueOf(current + amount));
    }
}
