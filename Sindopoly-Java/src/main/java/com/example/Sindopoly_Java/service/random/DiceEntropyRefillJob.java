package com.example.Sindopoly_Java.service.random;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.Arrays;
import java.util.List;

@Component
@ConditionalOnProperty(name = "dice.source", havingValue = "randomorg")
public class DiceEntropyRefillJob {

    private final RandomOrgGenerator rng;
    private final RedisTemplate<String, String> redis;
    private final WebClient web = WebClient.create("https://www.random.org");
    private static final String KEY = "dice:entropy";

    public DiceEntropyRefillJob(@Qualifier("randomOrgRng") RandomIntGenerator rng,
                                RedisTemplate<String, String> redis) {
        this.rng = (RandomOrgGenerator) rng;  // cast to access pushBatch()
        this.redis = redis;
    }

    @Scheduled(fixedRate = 30000)
    public void refill() {
        Long size = redis.opsForList().size(KEY);
        if (size != null && size > 200) return;

        String body = web.get()
                .uri("/integers/?num=1000&min=1&max=6&col=1&base=10&format=plain&rnd=new")
                .retrieve()
                .bodyToMono(String.class)
                .block();

        if (body == null) return;

        List<Integer> vals = Arrays.stream(body.trim().split("\\s+"))
                                   .map(Integer::parseInt)
                                   .toList();
        rng.pushBatch(vals);
    }
}
