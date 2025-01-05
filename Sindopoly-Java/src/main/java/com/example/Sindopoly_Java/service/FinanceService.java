package com.example.Sindopoly_Java.service;

import com.example.Sindopoly_Java.model.PlayerGame;
import com.example.Sindopoly_Java.repository.PlayerGameRepository;
import jakarta.transaction.Transactional;
import org.springframework.stereotype.Service;

@Service
public class FinanceService {

    private final PlayerGameRepository playerGameRepository;

    public FinanceService(PlayerGameRepository playerGameRepository) {
        this.playerGameRepository = playerGameRepository;
    }

    @Transactional
    public void giveMoneyToPlayer(Integer playerId, Integer amount) {
        PlayerGame pg = playerGameRepository.findByPlayerId(playerId);
        if (pg == null) throw new RuntimeException("PlayerGame not found");
        pg.setMoney(pg.getMoney() + amount);
        playerGameRepository.save(pg);
    }

    @Transactional
    public void removeMoneyFromPlayer(Integer playerId, Integer amount) {
        PlayerGame pg = playerGameRepository.findByPlayerId(playerId);
        if (pg == null) throw new RuntimeException("PlayerGame not found");
        pg.setMoney(pg.getMoney() - amount);
        playerGameRepository.save(pg);
    }

    @Transactional
    public void moneyTransactionBetweenPlayers(Integer giverId, Integer ownerId, Integer amount) {
        giveMoneyToPlayer(ownerId, amount);
        removeMoneyFromPlayer(giverId, amount);
    }

    @Transactional
    public void moneyChange(Integer playerId, Integer amount) {
        if (amount > 0) {
            giveMoneyToPlayer(playerId, amount);
        } else {
            removeMoneyFromPlayer(playerId, Math.abs(amount));
        }
    }
}
