package com.example.Sindopoly_Java.realtime;

import java.util.List;

public record GamePlayerSnapshot(
        int playerId,
        String nickname,
        int position,
        int money,
        List<Integer> properties,
        boolean jailed,
        int jailTurnsRemaining,
        boolean bankrupt,
        boolean afk) { }
