package com.example.Sindopoly_Java.service.random;

import org.springframework.stereotype.Component;
import org.springframework.scheduling.annotation.Scheduled;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.Arrays;
import java.util.List;

@Component
@RequiredArgsConstructor
public class DiceEntropyRefillJob {

    private final RandomOrgGenerator rng;
    private final RedisTemplate<String,String> redis;
    private final WebClient web = WebClient.create("https://www.random.org");
    private static final String KEY = "dice:entropy";

    @Scheduled(fixedRate = 30000)           // every 30 s
    public void refill() {
        Long size = redis.opsForList().size(KEY);
        if (size != null && size > 200) return;    // still plenty left

        // request 1000 integers 1-6
        String body = web.get()
                .uri("/integers/?num=1000&min=1&max=6&col=1&base=10&format=plain&rnd=new")
                .retrieve()
                .bodyToMono(String.class)
                .block();

        if (body == null) return;

        List<Integer> vals = Arrays.stream(body.trim().split("\\s+"))
                                   .map(Integer::parseInt).toList();
        rng.pushBatch(vals);
    }
}
