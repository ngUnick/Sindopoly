package com.example.Sindopoly_Java.service;

import com.example.Sindopoly_Java.model.Game;
import com.example.Sindopoly_Java.model.GameStatus;
import com.example.Sindopoly_Java.model.Player;
import com.example.Sindopoly_Java.model.PlayerGame;
import com.example.Sindopoly_Java.repository.GameRepository;
import com.example.Sindopoly_Java.repository.PlayerGameRepository;
import jakarta.transaction.Transactional;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class WinConditionService {

    private final PlayerGameRepository playerGameRepository;
    private final GameRepository gameRepository;

    public WinConditionService(PlayerGameRepository playerGameRepository, GameRepository gameRepository) {
        this.playerGameRepository = playerGameRepository;
        this.gameRepository = gameRepository;
    }

    @Transactional
    public String timeUp(Integer playerId) {
        PlayerGame pg = playerGameRepository.findByPlayerId(playerId);
        if (pg == null) return "no_winner";
        Game game = pg.getGame();

        if (game.getGameStatus() == GameStatus.completed) {
            return game.getWinner() != null ? game.getWinner().getName() : "no_winner";
        }

        if (game.getStartTime() != null && game.getMaxTime() != null) {
            LocalDateTime timeUp = game.getStartTime().plusMinutes(game.getMaxTime());
            if (LocalDateTime.now().isAfter(timeUp)) {
                // time ended
                Player winner = findRichestPlayer(game.getId());
                game.setGameStatus(GameStatus.completed);
                game.setWinner(winner);
                gameRepository.save(game);
                return winner.getName();
            }
        }

        return "no_winner";
    }

    @Transactional
    public String moneyUp(Integer playerId) {
        PlayerGame pg = playerGameRepository.findByPlayerId(playerId);
        if (pg == null) return "no_winner";
        Game game = pg.getGame();

        if (game.getGameStatus() == GameStatus.completed) {
            return game.getWinner() != null ? game.getWinner().getName() : "no_winner";
        }

        List<PlayerGame> players = playerGameRepository.findPlayersByWealthDesc(game.getId());
        if (!players.isEmpty()) {
            PlayerGame richest = players.get(0);
            if (richest.getMoney() >= game.getMaxMoney()) {
                game.setGameStatus(GameStatus.completed);
                game.setWinner(richest.getPlayer());
                gameRepository.save(game);
                return richest.getPlayer().getName();
            }
        }

        return "no_winner";
    }

    @Transactional
    public String moneyDown(Integer playerId) {
        PlayerGame pg = playerGameRepository.findByPlayerId(playerId);
        if (pg == null) return "no_winner";
        Game game = pg.getGame();

        if (game.getGameStatus() == GameStatus.completed) {
            return game.getWinner() != null ? game.getWinner().getName() : "no_winner";
        }

        List<PlayerGame> ascending = playerGameRepository.findPlayersByWealthAsc(game.getId());
        List<PlayerGame> descending = playerGameRepository.findPlayersByWealthDesc(game.getId());

        if (!ascending.isEmpty()) {
            PlayerGame poorest = ascending.get(0);
            if (poorest.getMoney() < 0) {
                PlayerGame richest = descending.get(0);
                game.setGameStatus(GameStatus.completed);
                game.setWinner(richest.getPlayer());
                gameRepository.save(game);
                return richest.getPlayer().getName();
            }
        }

        return "no_winner";
    }

    private Player findRichestPlayer(Integer gameId) {
        List<PlayerGame> players = playerGameRepository.findPlayersByWealthDesc(gameId);
        if (players.isEmpty()) throw new RuntimeException("No players in game");
        return players.get(0).getPlayer();
    }
}
