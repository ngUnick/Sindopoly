package com.example.Sindopoly_Java.service.transition;

/** Central key construction for versioned active-game transitions. */
public final class RedisGameKeys {

    private RedisGameKeys() {
    }

    public static String gamePattern() {
        return "game:*";
    }

    public static String membersPattern() {
        return "game:*:players";
    }

    public static String game(int gameId) {
        return "game:" + gameId;
    }

    public static String members(int gameId) {
        return game(gameId) + ":players";
    }

    public static String commands(int gameId) {
        return game(gameId) + ":commands";
    }

    public static String deck(int gameId) {
        return game(gameId) + ":deck";
    }

    public static String player(int playerId) {
        return "player:" + playerId;
    }
}
