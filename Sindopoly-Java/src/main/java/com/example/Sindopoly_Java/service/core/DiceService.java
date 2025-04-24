package com.example.Sindopoly_Java.service.core;

import java.security.SecureRandom;
import java.util.Random;

public class DiceService {
    private final Random rnd = new SecureRandom();

    /** 2 Dices with 6 sides each */
    public int roll() {
        return rnd.nextInt(6) + 1 + rnd.nextInt(6) + 1;
    }
}
