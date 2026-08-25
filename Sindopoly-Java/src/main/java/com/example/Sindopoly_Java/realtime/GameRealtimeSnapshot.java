package com.example.Sindopoly_Java.realtime;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;

/** Bounded public recovery contract; internal replay and finalization state is excluded. */
public record GameRealtimeSnapshot(
        int gameId,
        long stateVersion,
        String status,
        Integer playerTurn,
        Integer winner,
        String visibility,
        String inviteCode,
        JsonNode optionalAction,
        List<GamePlayerSnapshot> players) { }
