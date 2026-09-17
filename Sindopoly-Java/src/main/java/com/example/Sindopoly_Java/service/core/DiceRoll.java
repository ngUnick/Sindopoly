package com.example.Sindopoly_Java.service.core;

/** One authoritative two-die result. Doubles carry no additional rule meaning. */
public record DiceRoll(int die1, int die2, int total) {

    public DiceRoll(int die1, int die2) {
        this(die1, die2, die1 + die2);
    }

    public DiceRoll {
        if (die1 < 1 || die1 > 6 || die2 < 1 || die2 > 6) {
            throw new IllegalArgumentException("Die values must be between 1 and 6");
        }
        if (total != die1 + die2) {
            throw new IllegalArgumentException("Dice total must equal die1 + die2");
        }
    }
}
