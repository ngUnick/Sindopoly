package com.example.Sindopoly_Java.model.dto;

import com.example.Sindopoly_Java.model.Stats;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class LeaderboardEntryDto {
    private String nickname;
    private int totalWins;
    private int totalGames;
    private double winRate;

    public LeaderboardEntryDto(Stats s) {
        this.nickname = s.getPlayer().getName();
        this.totalWins = s.getTotalWins();
        this.totalGames = s.getTotalGames();
        this.winRate = s.getTotalGames() == 0 ? 0.0 : (100.0 * s.getTotalWins() / s.getTotalGames());
    }
}