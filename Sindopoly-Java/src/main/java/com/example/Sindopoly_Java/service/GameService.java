package com.example.Sindopoly_Java.service;

import com.example.Sindopoly_Java.model.*;
import com.example.Sindopoly_Java.repository.*;
import jakarta.transaction.Transactional;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class GameService {

    private final GameRepository gameRepository;
    private final PlayerRepository playerRepository;
    private final PlayerGameRepository playerGameRepository;
    private final SquareRepository squareRepository;
    private final PropertyRepository propertyRepository;
    private final PlayerPropertyRepository playerPropertyRepository;

    public GameService(GameRepository gameRepository,
                       PlayerRepository playerRepository,
                       PlayerGameRepository playerGameRepository,
                       SquareRepository squareRepository,
                       PropertyRepository propertyRepository,
                       PlayerPropertyRepository playerPropertyRepository) {
        this.gameRepository = gameRepository;
        this.playerRepository = playerRepository;
        this.playerGameRepository = playerGameRepository;
        this.squareRepository = squareRepository;
        this.propertyRepository = propertyRepository;
        this.playerPropertyRepository = playerPropertyRepository;
    }

    @Transactional
    public Integer createGame(Integer playerCreatorId, Integer maxTime, Integer maxMoney) {
        Player creator = playerRepository.findById(playerCreatorId)
                .orElseThrow(() -> new RuntimeException("Player not found"));
        // Create a new game in 'lobby' status
        Game game = new Game();
        game.setGameStatus(GameStatus.lobby);
        game.setCreator(creator);
        game.setMaxTime(maxTime);
        game.setMaxMoney(maxMoney);
        game.setStartTime(null);

        game = gameRepository.save(game);

        // Create the board (40 squares)
        // For simplicity, we assume properties with ids 1-28 exist as in original data
        // Insert the squares similarly to original code
        // Adjust property positions as needed
        // Example (just a few squares, fill in all accordingly):
        squareRepository.save(makeSquare(game, 0, null, SquareType.start));
        squareRepository.save(makeSquare(game, 1, propertyRepository.findById(1).orElse(null), SquareType.property));
        squareRepository.save(makeSquare(game, 2, null, SquareType.card));
        // ... add all squares similarly ...

        // Join the creator to the game
        joinGame(game.getId(), playerCreatorId);

        return game.getId();
    }

    @Transactional
    public Integer createGameBot(Integer playerCreatorId, Integer maxTime, Integer maxMoney) {
        Integer gameId = createGame(playerCreatorId, maxTime, maxMoney);
        // Let's assume bot player_id = 5 as in original
        joinGame(gameId, 5);
        startGame(gameId);
        return gameId;
    }

    @Transactional
    public void joinGame(Integer gameId, Integer playerId) {
        Game game = gameRepository.findById(gameId)
                .orElseThrow(() -> new RuntimeException("Game not found"));
        Player player = playerRepository.findById(playerId)
                .orElseThrow(() -> new RuntimeException("Player not found"));

        // Check if game is still in lobby
        if (game.getGameStatus() != GameStatus.lobby) {
            throw new RuntimeException("Game not in lobby state");
        }

        // starting position = 0 (start)
        Square startSquare = squareRepository.findByGameAndPosition(game, 0);

        PlayerGame pg = new PlayerGame();
        pg.setPlayerId(player.getId());
        pg.setPlayer(player);
        pg.setGame(game);
        pg.setSquare(startSquare);
        pg.setMoney(500); // initial money
        pg.setInJail(false);

        playerGameRepository.save(pg);
    }

    @Transactional
    public void startGame(Integer gameId) {
        Game game = gameRepository.findById(gameId)
                .orElseThrow(() -> new RuntimeException("Game not found"));

        long countPlayers = playerGameRepository.countPlayersInGame(gameId);
        if (countPlayers < 2) {
            throw new RuntimeException("Should be at least 2 players to start the game");
        }

        // Start the game
        game.setGameStatus(GameStatus.inProgress);
        game.setStartTime(LocalDateTime.now());
        // Set playerTurn = creator for now
        game.setPlayerTurn(game.getCreator());
        gameRepository.save(game);
    }

    @Transactional
    public void endGame(Integer playerId) {
        PlayerGame pg = playerGameRepository.findByPlayerId(playerId);
        if (pg == null) {
            throw new RuntimeException("PlayerGame not found");
        }
        Integer gameId = pg.getGame().getId();

        // Remove PlayerGame, Square, PlayerProperty for the game
        // Because of cascading or references, might need manual deletes
        List<PlayerGame> pgs = playerGameRepository.findByGameId(gameId);
        for (PlayerGame p : pgs) {
            playerGameRepository.delete(p);
        }

        List<PlayerProperty> pps = playerPropertyRepository.findAll();
        for (PlayerProperty pp : pps) {
            if (pp.getGame().equals(gameId)) {
                playerPropertyRepository.delete(pp);
            }
        }

        // For squares, just delete them all:
        // Usually you'd query them by game
        // For simplicity (if you have a method to find by game), or just do:
        // 
        // There's no direct method here, but we can write a custom query or rely on cascade:
        // If not cascaded, you may need a custom repository method. 
        // Let's assume you add a method: 
        //   @Query("SELECT s FROM Square s WHERE s.game.id = :gameId")
        //   List<Square> findSquaresByGameId(Integer gameId);
        //
        //Implement quickly in SquareRepository:
        // @Query("SELECT s FROM Square s WHERE s.game.id = :gameId")
        // List<Square> findSquaresByGameId(Integer gameId);
        List<Square> squares = ((SquareRepository) squareRepository).findSquaresByGameId(gameId);
        for (Square s : squares) {
            squareRepository.delete(s);
        }

        // After cleanup, game still exists but is ended. If you want to delete the game itself, do so:
        // or leave as completed status
        Game g = gameRepository.findById(gameId).orElseThrow(() -> new RuntimeException("Game not found"));
        g.setGameStatus(GameStatus.completed);
        gameRepository.save(g);
    }

    private Square makeSquare(Game game, int position, Property property, SquareType type) {
        Square sq = new Square();
        sq.setGame(game);
        sq.setPosition(position);
        sq.setProperty(property);
        sq.setType(type);
        return sq;
    }
}
