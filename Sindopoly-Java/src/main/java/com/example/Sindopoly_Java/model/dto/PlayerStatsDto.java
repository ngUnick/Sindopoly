package com.example.Sindopoly_Java.model.dto;

import com.example.Sindopoly_Java.model.Stats;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class PlayerStatsDto {
    private int totalGames;
    private int totalWins;
    private int totalLosses;
    private int totalMoney;
    private int totalTimePlayed;

    public PlayerStatsDto(Stats s) {
        this.totalGames = s.getTotalGames();
        this.totalWins = s.getTotalWins();
        this.totalLosses = s.getTotalLosses();
        this.totalMoney = s.getTotalMoney();
        this.totalTimePlayed = s.getTotalTimePlayed();
    }
}