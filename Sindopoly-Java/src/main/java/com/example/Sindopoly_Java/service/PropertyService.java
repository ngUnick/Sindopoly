package com.example.Sindopoly_Java.service;

import com.example.Sindopoly_Java.model.*;
import com.example.Sindopoly_Java.repository.*;
import jakarta.transaction.Transactional;
import org.springframework.stereotype.Service;

@Service
public class PropertyService {

    private final PlayerGameRepository playerGameRepository;
    private final PlayerPropertyRepository playerPropertyRepository;
    private final PropertyRepository propertyRepository;
    private final SquareRepository squareRepository;
    private final FinanceService financeService;

    public PropertyService(PlayerGameRepository playerGameRepository,
                           PlayerPropertyRepository playerPropertyRepository,
                           PropertyRepository propertyRepository,
                           SquareRepository squareRepository,
                           FinanceService financeService) {
        this.playerGameRepository = playerGameRepository;
        this.playerPropertyRepository = playerPropertyRepository;
        this.propertyRepository = propertyRepository;
        this.squareRepository = squareRepository;
        this.financeService = financeService;
    }

    @Transactional
    public void buyProperty(Integer playerId) {
        PlayerGame pg = playerGameRepository.findByPlayerId(playerId);
        if (pg == null) throw new RuntimeException("Player not found in a game");

        Square square = pg.getSquare();
        if (square.getProperty() == null) {
            throw new RuntimeException("No property at this square");
        }

        Property prop = square.getProperty();
        int playerMoney = pg.getMoney();

        if (playerMoney >= prop.getPrice()) {
            financeService.removeMoneyFromPlayer(playerId, prop.getPrice());

            PlayerProperty pp = new PlayerProperty();
            pp.setProperty(prop.getId());
            pp.setGame(pg.getGame().getId());
            pp.setPropertyObj(prop);
            pp.setPlayerObj(pg.getPlayer());
            pp.setGameObj(pg.getGame());

            playerPropertyRepository.save(pp);
        } else {
            throw new RuntimeException("Not enough money to buy the property");
        }
    }

    @Transactional
    public Integer canBuyProperty(Integer playerId) {
        PlayerGame pg = playerGameRepository.findByPlayerId(playerId);
        if (pg == null) return null;

        Square square = pg.getSquare();
        if (square.getType() != SquareType.property || square.getProperty() == null) return null;

        Property prop = square.getProperty();
        int playerMoney = pg.getMoney();

        boolean alreadyOwned = (playerPropertyRepository.findByPropertyAndGame(prop.getId(), pg.getGame().getId()) != null);

        if (playerMoney >= prop.getPrice() && !alreadyOwned) {
            return prop.getId();
        }

        return null;
    }

    @Transactional
    public int payRent(Integer playerId) {
        PlayerGame pg = playerGameRepository.findByPlayerId(playerId);
        if (pg == null) return 0;
        Game game = pg.getGame();

        Square square = pg.getSquare();
        if (square.getProperty() == null) return 0;

        Property prop = square.getProperty();
        PlayerProperty ownerRecord = playerPropertyRepository.findByPropertyAndGame(prop.getId(), game.getId());

        if (ownerRecord == null) return 0; // not owned
        if (ownerRecord.getPlayerObj().getId().equals(playerId)) return 0; // owned by same player

        int rent = prop.getRent();
        financeService.moneyTransactionBetweenPlayers(playerId, ownerRecord.getPlayerObj().getId(), rent);
        return rent;
    }
}
