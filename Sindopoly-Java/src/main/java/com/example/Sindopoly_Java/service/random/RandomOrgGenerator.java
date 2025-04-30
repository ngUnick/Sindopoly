package com.example.Sindopoly_Java.service.random;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
// import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
// import reactor.util.retry.Retry;
import org.springframework.data.redis.core.ListOperations;
import org.springframework.data.redis.core.RedisTemplate;

import java.security.SecureRandom;
// import java.time.Duration;
import java.util.List;

@Component("randomOrgRng")
@ConditionalOnProperty(name = "dice.source", havingValue = "randomorg")
public class RandomOrgGenerator implements RandomIntGenerator {

    private final ListOperations<String, String> listOps;
    private final WebClient web;
    private final SecureRandom fallback = new SecureRandom();
    private static final String CACHE_KEY = "dice:entropy";

    public RandomOrgGenerator(RedisTemplate<String,String> redis) {
        this.listOps = redis.opsForList();
        this.web = WebClient.builder()
                .baseUrl("https://www.random.org")
                .build();
    }

    @Override
    public int nextDie() {
        String cached = listOps.leftPop(CACHE_KEY);
        if (cached != null) return Integer.parseInt(cached);

        return fallback.nextInt(6) + 1;      // should rarely happen
    }

    /* helper used by refill job */
    public void pushBatch(List<Integer> vals) {
        vals.forEach(v -> listOps.rightPush(CACHE_KEY, v.toString()));
    }
}
