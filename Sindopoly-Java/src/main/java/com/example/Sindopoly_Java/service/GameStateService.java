package com.example.Sindopoly_Java.service;

import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.util.Map;

@Service
public class GameStateService {

    private final RedisTemplate<String, Object> redisTemplate;

    public GameStateService(RedisTemplate<String, Object> redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    // Save Game State
    public void saveGameState(String gameId, Map<String, Object> gameData) {
        redisTemplate.opsForHash().putAll("game:" + gameId, gameData);
    }

    // Retrieve Game State
    public Map<Object, Object> getGameState(String gameId) {
        return redisTemplate.opsForHash().entries("game:" + gameId);
    }

    // Delete Game State
    public void deleteGameState(String gameId) {
        redisTemplate.delete("game:" + gameId);
    }
}
