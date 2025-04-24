package com.example.Sindopoly_Java.service.core;

public class MovementService {

    public MovementResult move(int currentPos, int dice) {
        int newPos = (currentPos + dice) % 40;      // 40 positions
        boolean passedGo = currentPos + dice >= 40; // went through the start?
        return new MovementResult(newPos, passedGo);
    }

    /** lightweight record */
    public record MovementResult(int newPosition, boolean passedGo) {}
}
