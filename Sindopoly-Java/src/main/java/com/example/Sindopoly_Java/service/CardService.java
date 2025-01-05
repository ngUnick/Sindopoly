package com.example.Sindopoly_Java.service;

import com.example.Sindopoly_Java.model.*;
import com.example.Sindopoly_Java.repository.CardRepository;
import com.example.Sindopoly_Java.repository.PlayerGameRepository;
import jakarta.transaction.Transactional;
import org.springframework.stereotype.Service;

@Service
public class CardService {

    private final CardRepository cardRepository;
    private final PlayerGameRepository playerGameRepository;
    private final PlayerActionService playerActionService;
    private final FinanceService financeService;

    public CardService(CardRepository cardRepository,
                       PlayerGameRepository playerGameRepository,
                       PlayerActionService playerActionService,
                       FinanceService financeService) {
        this.cardRepository = cardRepository;
        this.playerGameRepository = playerGameRepository;
        this.playerActionService = playerActionService;
        this.financeService = financeService;
    }

    @Transactional
    public Card getRandomCardForPlayer(Integer playerId) {
        PlayerGame pg = playerGameRepository.findByPlayerId(playerId);
        if (pg == null) throw new RuntimeException("Player not in a game");
        
        Square sq = pg.getSquare();
        if (sq.getType() != SquareType.card) {
            // Not on a card square
            return null;
        }

        Card c = cardRepository.findRandomCard();
        // Depending on card type, apply effects
        if (c.getType() == CardType.transport) {
            // move player steps forward/backwards by amount
            int steps = c.getAmount();
            playerActionService.movePlayerSteps(playerId, steps);
        } else {
            // money card
            // if amount > 0, give money
            // if amount < 0, remove money
            financeService.moneyChange(playerId, c.getAmount());
        }

        return c;
    }
}
