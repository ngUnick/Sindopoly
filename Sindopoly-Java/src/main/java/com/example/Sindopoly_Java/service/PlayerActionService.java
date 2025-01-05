package com.example.Sindopoly_Java.service;

import com.example.Sindopoly_Java.model.*;
import com.example.Sindopoly_Java.repository.*;
import jakarta.transaction.Transactional;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Random;

@Service
public class PlayerActionService {

    private final PlayerGameRepository playerGameRepository;
    private final SquareRepository squareRepository;
    private final GameRepository gameRepository;
    private final PlayerPropertyRepository playerPropertyRepository;
    private final PropertyRepository propertyRepository;
    private final FinanceService financeService;
    private final PropertyService propertyService;

    public PlayerActionService(PlayerGameRepository playerGameRepository,
                               SquareRepository squareRepository,
                               GameRepository gameRepository,
                               PlayerPropertyRepository playerPropertyRepository,
                               PropertyRepository propertyRepository,
                               FinanceService financeService,
                               PropertyService propertyService) {
        this.playerGameRepository = playerGameRepository;
        this.squareRepository = squareRepository;
        this.gameRepository = gameRepository;
        this.playerPropertyRepository = playerPropertyRepository;
        this.propertyRepository = propertyRepository;
        this.financeService = financeService;
        this.propertyService = propertyService;
    }

    @Transactional
    public int[] rollDice(Integer playerId) {
        PlayerGame pg = playerGameRepository.findByPlayerId(playerId);
        if (pg == null) throw new RuntimeException("Player not in a game");

        int dice1 = new Random().nextInt(6) + 1;
        int dice2 = new Random().nextInt(6) + 1;
        movePlayerSteps(playerId, dice1 + dice2);

        return new int[]{dice1, dice2};
    }

    @Transactional
    public void movePlayerSteps(Integer playerId, int steps) {
        PlayerGame pg = playerGameRepository.findByPlayerId(playerId);
        if (pg == null) throw new RuntimeException("Player not in a game");
        Game game = pg.getGame();
        Square currentSquare = pg.getSquare();
        int currentPosition = currentSquare.getPosition();
        int newPosition = (currentPosition + steps) % 40;

        // If passed "start"
        if ((currentPosition + steps) >= 40) {
            financeService.giveMoneyToPlayer(playerId,100);
        }

        Square targetSquare = squareRepository.findByGameAndPosition(game, newPosition);
        pg.setSquare(targetSquare);
        playerGameRepository.save(pg);
    }

    @Transactional
    public void passTurn(Integer playerId) {
        PlayerGame pg = playerGameRepository.findByPlayerId(playerId);
        if (pg == null) throw new RuntimeException("Player not in a game");
        Game game = pg.getGame();

        List<PlayerGame> players = playerGameRepository.findPlayersOrderedByIdInGame(game.getId());
        int currentIndex = -1;
        for (int i = 0; i < players.size(); i++) {
            if (players.get(i).getPlayerId().equals(playerId)) {
                currentIndex = i;
                break;
            }
        }

        int nextIndex = (currentIndex + 1) % players.size();
        PlayerGame nextPlayerPG = players.get(nextIndex);
        Player nextPlayer = nextPlayerPG.getPlayer();

        game.setPlayerTurn(nextPlayer);
        gameRepository.save(game);
    }

    @Transactional
    public void goToJail(Integer playerId) {
        PlayerGame pg = playerGameRepository.findByPlayerId(playerId);
        if (pg == null) throw new RuntimeException("Player not in a game");
        Game game = pg.getGame();

        Square currentSquare = pg.getSquare();
        if (currentSquare.getType() == SquareType.goToJail) {
            // Jail is position 10
            Square jailSquare = squareRepository.findByGameAndPosition(game,10);
            pg.setSquare(jailSquare);
            pg.setInJail(true);
            financeService.removeMoneyFromPlayer(playerId,200);
            playerGameRepository.save(pg);
        }
    }

    @Transactional
    public void buyProperty(Integer playerId) {
        playerServiceCheck(); // We'll create propertyService methods
        propertyService.buyProperty(playerId);
    }

    // Just a helper to ensure propertyService is ready
    private void playerServiceCheck() {
        // no-op
    }
}
