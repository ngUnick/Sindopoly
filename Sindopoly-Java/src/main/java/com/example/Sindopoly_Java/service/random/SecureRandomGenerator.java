package com.example.Sindopoly_Java.service.random;

import org.springframework.stereotype.Component;

import java.security.SecureRandom;

@Component("secureRng")               // named bean
public class SecureRandomGenerator implements RandomIntGenerator {
    private final SecureRandom sr = new SecureRandom();
    @Override public int nextDie() { return sr.nextInt(6) + 1; }
}
