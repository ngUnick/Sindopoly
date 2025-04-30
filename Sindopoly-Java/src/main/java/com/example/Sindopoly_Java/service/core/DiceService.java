package com.example.Sindopoly_Java.service.core;

import com.example.Sindopoly_Java.service.random.RandomIntGenerator;
import org.springframework.stereotype.Service;

@Service
public class DiceService {

    private final RandomIntGenerator rng;     // abstraction

    public DiceService(RandomIntGenerator rng) {
        this.rng = rng;
    }

    /** sum of two dice */
    public int roll() {
        return rng.nextDie() + rng.nextDie();
    }
}
