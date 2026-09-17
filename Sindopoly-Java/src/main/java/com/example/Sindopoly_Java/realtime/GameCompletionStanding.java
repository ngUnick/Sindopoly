package com.example.Sindopoly_Java.realtime;

/** One player row in the ordered authoritative terminal standing. */
public record GameCompletionStanding(
        int playerId,
        String nickname,
        int cash,
        int propertyValue,
        int totalValue,
        int rank,
        boolean winner) { }
