package com.example.Sindopoly_Java.service.transition;

import java.util.List;
import java.util.Map;
import java.util.Set;

/** Immutable authoritative inputs used to calculate one proposed transition. */
public record GameSnapshot(
        int gameId,
        Map<String, String> game,
        Set<String> members,
        Map<Integer, Map<String, String>> players,
        List<String> deck) {

    public long stateVersion() {
        String raw = game.get("stateVersion");
        return raw == null ? 0 : Long.parseLong(raw);
    }
}
