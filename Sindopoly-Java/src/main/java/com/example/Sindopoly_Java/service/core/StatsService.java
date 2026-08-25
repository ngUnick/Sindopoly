package com.example.Sindopoly_Java.service.core;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.example.Sindopoly_Java.model.dto.PlayerStatsDto;
import com.example.Sindopoly_Java.model.dto.LeaderboardEntryDto;
import com.example.Sindopoly_Java.model.Stats;
import com.example.Sindopoly_Java.model.Player;
import com.example.Sindopoly_Java.repository.StatsRepository;
import com.example.Sindopoly_Java.repository.PlayerRepository;

import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class StatsService {

    private final StatsRepository statsRepository;
    private final PlayerRepository playerRepository;
    private final StringRedisTemplate redis;
    private final ObjectMapper objectMapper = new ObjectMapper();

    private static final String LEADERBOARD_KEY = "stats:leaderboard";

    public PlayerStatsDto getUserStats(Long playerId) {
        Player player = playerRepository.findById(playerId.intValue())
                .orElseThrow(() -> new IllegalArgumentException("Player not found"));

        Stats stats = statsRepository.findByPlayer(player)
                .orElseThrow(() -> new IllegalStateException("Player Stats row is missing"));

        double winRate = stats.getTotalGames() == 0
                    ? 0.0
                    : (double) stats.getTotalWins() / stats.getTotalGames();

        return new PlayerStatsDto(
                player.getName(),               // ✅ nickname present!
                stats.getTotalWins(),
                stats.getTotalGames(),
                winRate
        );
    }

    public List<LeaderboardEntryDto> getLeaderboard() {
        String cached = redis.opsForValue().get(LEADERBOARD_KEY);
        if (cached != null) {
            try {
                return objectMapper.readValue(cached, new TypeReference<>() {});
            } catch (Exception e) {
                e.printStackTrace();
            }
        }
        return refreshLeaderboard();
    }

    @Scheduled(fixedRate = 60000)
    public List<LeaderboardEntryDto> refreshLeaderboard() {
        List<LeaderboardEntryDto> topPlayers = statsRepository.findAll().stream()
                .map(LeaderboardEntryDto::new)
                .sorted(Comparator.comparingInt(LeaderboardEntryDto::getTotalWins).reversed())
                .limit(10)
                .collect(Collectors.toList());

        try {
            redis.opsForValue().set(LEADERBOARD_KEY, objectMapper.writeValueAsString(topPlayers));
        } catch (Exception e) {
            e.printStackTrace();
        }

        return topPlayers;
    }
}
