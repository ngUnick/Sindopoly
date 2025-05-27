package com.example.Sindopoly_Java.controller;

import com.example.Sindopoly_Java.service.core.StatsService;
import com.example.Sindopoly_Java.model.dto.PlayerStatsDto;
import com.example.Sindopoly_Java.model.dto.LeaderboardEntryDto;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/statistics")
@RequiredArgsConstructor
public class StatsController {

    private final StatsService statsService;

    @GetMapping("/user/{playerId}")
    public PlayerStatsDto getUserStats(@PathVariable Long playerId) {
        return statsService.getUserStats(playerId);
    }

    @GetMapping("/leaderboard")
    public List<LeaderboardEntryDto> getLeaderboard() {
        return statsService.getLeaderboard();
    }
} 