package com.example.Sindopoly_Java.service.core;

public class MovementService {

    public static final int BOARD_SIZE = 40;

    public MovementResult move(int currentPos, int dice) {
        int newPos = (currentPos + dice) % BOARD_SIZE;
        // Exact landing at zero earns the same approved reward as passing it.
        boolean passedGo = currentPos + dice >= BOARD_SIZE;
        return new MovementResult(newPos, passedGo);
    }

    /** lightweight record */
    public record MovementResult(int newPosition, boolean passedGo) {}
}
