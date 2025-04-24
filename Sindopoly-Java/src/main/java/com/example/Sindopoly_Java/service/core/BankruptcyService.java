package com.example.Sindopoly_Java.service.core;

import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.util.Set;

@Service
public class BankruptcyService {

    private final HashOperations<String,String,String> hashOps;
    private final RedisTemplate<String,String> redis;

    public BankruptcyService(RedisTemplate<String,String> redisTemplate) {
        this.redis  = redisTemplate;
        this.hashOps= redisTemplate.opsForHash();
    }

    /** true if money ≤ 0 */
    public boolean isBankrupt(int money) { return money <= 0; }

    /** releases all properties whose owner == playerId */
    public void releaseProperties(int playerId) {
        Set<String> keys = redis.keys("square:*");
        if (keys.isEmpty()) return;
        for (String k : keys) {
            String owner = hashOps.get(k,"owner");
            if (String.valueOf(playerId).equals(owner)) {
                hashOps.delete(k,"owner");
            }
        }
    }
}
