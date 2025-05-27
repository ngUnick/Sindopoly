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

    public int roll() {
        return rng.nextDie();
    }
}

