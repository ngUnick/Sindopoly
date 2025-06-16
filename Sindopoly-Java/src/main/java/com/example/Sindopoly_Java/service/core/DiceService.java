package com.example.Sindopoly_Java.service.core;

import com.example.Sindopoly_Java.service.random.RandomIntGenerator;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

@Service
public class DiceService {
    private final RandomIntGenerator rng;

    public DiceService(@Qualifier("randomIntGenerator") RandomIntGenerator rng) {
        this.rng = rng;
    }

    /**
     * Roll two six-sided dice and return their sum (2–12).
     */
    public int roll() {
        int d1 = rng.nextDie();  // 1–6
        int d2 = rng.nextDie();  // 1–6
        return d1 + d2;           // now 2–12
    }
}

