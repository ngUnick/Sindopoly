package com.example.Sindopoly_Java.service.redis;

import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Component;

/**
 * Makes sure critical keys exist the moment Spring Boot finishes
 * starting, so later jobs never read "null".
 */
@Component
@RequiredArgsConstructor
public class RedisKeyBootstrap {

    private static final String LEADERBOARD  = "stats:leaderboard";
    private static final String DICE_ENTROPY = "dice:entropy";

    private final RedisTemplate<String, String> redis;

    @PostConstruct
    public void createIfMissing() {

        /*  stats:leaderboard  -> empty JSON array  */
        if (!Boolean.TRUE.equals(redis.hasKey(LEADERBOARD))) {
            redis.opsForValue().set(LEADERBOARD, "[]");
        }

        /*  dice:entropy  -> create an *empty list*  */
        if (!Boolean.TRUE.equals(redis.hasKey(DICE_ENTROPY))) {
            redis.opsForList().leftPush(DICE_ENTROPY, "SEED");   // ensure LIST type
            redis.opsForList().trim(DICE_ENTROPY, 1, 0);         // length → 0
        }
    }
}