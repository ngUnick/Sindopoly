package com.example.Sindopoly_Java.service.core;

import com.example.Sindopoly_Java.service.random.RandomIntGenerator;
import org.junit.jupiter.api.Test;

import java.util.ArrayDeque;
import java.util.Deque;

import static org.junit.jupiter.api.Assertions.assertEquals;

class DiceServiceRuleTest {

    @Test
    void sumsTwoServerSuppliedMinimumDieValues() {
        DiceService dice = new DiceService(sequence(1, 1));

        assertEquals(2, dice.roll());
    }

    @Test
    void sumsTwoServerSuppliedMaximumDieValues() {
        DiceService dice = new DiceService(sequence(6, 6));

        assertEquals(12, dice.roll());
    }

    @Test
    void consumesTwoValuesFromInjectedServerSideRandomSourcePerRoll() {
        Deque<Integer> values = new ArrayDeque<>(java.util.List.of(2, 5, 4, 3));
        RandomIntGenerator source = values::removeFirst;
        DiceService dice = new DiceService(source);

        assertEquals(7, dice.roll());
        assertEquals(7, dice.roll());
        assertEquals(0, values.size());
    }

    private static RandomIntGenerator sequence(int... values) {
        Deque<Integer> results = new ArrayDeque<>();
        for (int value : values) {
            results.add(value);
        }
        return results::removeFirst;
    }
}
