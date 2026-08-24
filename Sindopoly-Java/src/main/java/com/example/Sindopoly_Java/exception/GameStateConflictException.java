package com.example.Sindopoly_Java.exception;

public class GameStateConflictException extends RuntimeException {

    public GameStateConflictException(String message) {
        super(message);
    }
}
