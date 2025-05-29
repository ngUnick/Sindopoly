package com.example.Sindopoly_Java.service.redis;

import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class RedisKeyWatchdog {

    private final RedisTemplate<String, String> redis;

    private static final String LB  = "stats:leaderboard";
    private static final String ENT = "dice:entropy";

    @Scheduled(fixedDelay = 10000)          // every 10s
    public void ensureKeysStillExist() {

        if (!Boolean.TRUE.equals(redis.hasKey(LB))) {
            redis.opsForValue().set(LB, "[]");
        }

        if (!Boolean.TRUE.equals(redis.hasKey(ENT))) {
            redis.opsForList().leftPush(ENT, "SEED");
            redis.opsForList().trim(ENT, 1, 0);
        }
    }
}
