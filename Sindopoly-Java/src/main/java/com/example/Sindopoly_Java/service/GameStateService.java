package com.example.Sindopoly_Java.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.SetOperations;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

@Service
public class GameStateService {
    private static final String GAME_PREFIX = "game:";
    private static final String PLAYERS_SUFFIX = ":players";

    private final RedisTemplate<String, Object> redisTemplate;
    private final HashOperations<String, String, Object> hashOps;
    private final SetOperations<String, Object> setOps;

    @Autowired
    public GameStateService(RedisTemplate<String, Object> redisTemplate) {
        this.redisTemplate = redisTemplate;
        this.hashOps = redisTemplate.opsForHash();
        this.setOps = redisTemplate.opsForSet();
    }

    /**
     * Save Game State (Hash: game:GAME_ID)
     * Example fields: status, playerTurn, timer, maxTime, maxMoney, winner, etc.
     */
    public void saveGame(int gameId, Map<String, Object> gameData) {
        String gameKey = GAME_PREFIX + gameId;
        hashOps.putAll(gameKey, gameData);
        // Set TTL to 24 hours
        redisTemplate.expire(gameKey, 24, TimeUnit.HOURS);
    }

    /**
     * Get Game State
     */
    public Map<String, Object> getGame(int gameId) {
        String gameKey = GAME_PREFIX + gameId;
        // HashOperations.entries(...) returns Map<String, Object>
        @SuppressWarnings("unchecked")
        Map<String, Object> result = (Map<String, Object>) (Map) hashOps.entries(gameKey);
        return result;
    }

    /**
     * Delete Game State
     */
    public void deleteGame(int gameId) {
        String gameKey = GAME_PREFIX + gameId;
        redisTemplate.delete(gameKey);
        redisTemplate.delete(gameKey + PLAYERS_SUFFIX);
    }

    /**
     * Add a Player to the Game's Player Set (Set: game:GAME_ID:players)
     */
    public void addPlayerToGame(int gameId, int playerId) {
        String playersKey = GAME_PREFIX + gameId + PLAYERS_SUFFIX;
        setOps.add(playersKey, String.valueOf(playerId)); // store player ID as String
    }

    /**
     * Get the Set of Player IDs for a Game
     */
    public Set<String> getPlayersInGame(int gameId) {
        String playersKey = GAME_PREFIX + gameId + PLAYERS_SUFFIX;
        Set<Object> rawSet = setOps.members(playersKey);
        if (rawSet == null) {
            return Set.of();
        }
        // Convert each Object to String
        return rawSet.stream()
                     .map(Object::toString)
                     .collect(Collectors.toSet());
    }
}
