package com.example.Sindopoly_Java.realtime;

import java.util.List;

/** Immutable authoritative result exposed only for a retained terminal game. */
public record GameCompletionResult(
        int winnerPlayerId,
        List<GameCompletionStanding> standings) {

    public GameCompletionResult {
        standings = List.copyOf(standings);
    }
}
