package com.example.Sindopoly_Java.realtime;

/** Bounded reason codes prevent internal Redis state from leaking into notifications. */
public enum GameEventReason {
    GAME_CREATED,
    PLAYER_JOINED,
    PLAYER_LEFT,
    PLAYER_KICKED,
    GAME_STARTED,
    ROLL_COMPLETED,
    ACTION_RESOLVED,
    TURN_TIMED_OUT,
    GAME_COMPLETED
}
