package com.example.Sindopoly_Java.exception;

public class GameNotFoundException extends RuntimeException {

    public GameNotFoundException() {
        super("Game not found");
    }
}
