package com.example.Sindopoly_Java.service;

import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.util.Map;

/** Read-only projection access for player state stored by authoritative transitions. */
@Service
public class PlayerStateService {
    private static final String PLAYER_PREFIX = "player:";

    private final HashOperations<String, String, Object> hashOps;

    public PlayerStateService(RedisTemplate<String, String> redisTemplate) {
        this.hashOps = redisTemplate.opsForHash();
    }

    /** Fetches the current Redis player-state projection. */
    public Map<String, Object> getPlayerState(int playerId) {
        return hashOps.entries(PLAYER_PREFIX + playerId);
    }
}
