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

        assertEquals(new DiceRoll(1, 1, 2), dice.roll());
    }

    @Test
    void sumsTwoServerSuppliedMaximumDieValues() {
        DiceService dice = new DiceService(sequence(6, 6));

        assertEquals(new DiceRoll(6, 6, 12), dice.roll());
    }

    @Test
    void consumesTwoValuesFromInjectedServerSideRandomSourcePerRoll() {
        Deque<Integer> values = new ArrayDeque<>(java.util.List.of(2, 5, 4, 3));
        RandomIntGenerator source = values::removeFirst;
        DiceService dice = new DiceService(source);

        assertEquals(new DiceRoll(2, 5, 7), dice.roll());
        assertEquals(new DiceRoll(4, 3, 7), dice.roll());
        assertEquals(0, values.size());
    }

    @Test
    void doubleValuesRemainOnlyAnOrdinaryServerGeneratedTotal() {
        DiceService dice = new DiceService(sequence(4, 4));

        assertEquals(new DiceRoll(4, 4, 8), dice.roll());
    }

    private static RandomIntGenerator sequence(int... values) {
        Deque<Integer> results = new ArrayDeque<>();
        for (int value : values) {
            results.add(value);
        }
        return results::removeFirst;
    }
}
