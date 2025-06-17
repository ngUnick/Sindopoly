package com.example.Sindopoly_Java.model.dto;

import com.example.Sindopoly_Java.model.Player;
import com.example.Sindopoly_Java.model.Stats;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor              // required by Jackson
@AllArgsConstructor             // (String, int, int, double)
public class PlayerStatsDto {

    private String nickname;    // NEW
    private int    totalWins;
    private int    totalGames;
    private double winRate;     // NEW   0-1 range (e.g. 0.25)

    /** Convenience ctor used in StatsService */
    public PlayerStatsDto(Player p, Stats s) {
        this.nickname   = p.getName();
        this.totalWins  = s.getTotalWins();
        this.totalGames = s.getTotalGames();
        this.winRate    = totalGames == 0
                          ? 0.0
                          : (double) totalWins / totalGames;
    }
}