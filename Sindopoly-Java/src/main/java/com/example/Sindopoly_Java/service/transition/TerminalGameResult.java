package com.example.Sindopoly_Java.service.transition;

import java.util.List;

/** Frozen, bounded input shared by Redis terminal recovery and MariaDB finalization. */
public record TerminalGameResult(
        String finalizationId,
        int gameId,
        long gameCreatedAtEpochMs,
        long completedAtEpochMs,
        int durationSeconds,
        int winnerPlayerId,
        List<TerminalPlayerResult> players) {

    public TerminalGameResult {
        players = List.copyOf(players);
        if (players.isEmpty() || players.size() > TurnOrder.MAX_PLAYERS) {
            throw new IllegalArgumentException("Terminal result must contain one to four players");
        }
        long winners = players.stream().filter(TerminalPlayerResult::winner).count();
        if (winners != 1 || players.stream().noneMatch(player -> player.playerId() == winnerPlayerId && player.winner())) {
            throw new IllegalArgumentException("Terminal result winner is inconsistent");
        }
    }

    public record TerminalPlayerResult(int playerId, int money, boolean winner) { }
}
