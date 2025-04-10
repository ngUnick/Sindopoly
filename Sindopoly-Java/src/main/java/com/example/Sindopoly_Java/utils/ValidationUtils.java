package com.example.Sindopoly_Java.utils;

import com.example.Sindopoly_Java.repository.PlayerRepository;
import org.springframework.stereotype.Component;

@Component
public class ValidationUtils {

    private final PlayerRepository playerRepo;

    public ValidationUtils(PlayerRepository playerRepo) {
        this.playerRepo = playerRepo;
    }

    public void validatePlayerExists(int playerId) {
        if (!playerRepo.existsById(playerId)) {
            throw new IllegalArgumentException("Player with ID " + playerId + " does not exist.");
        }
    }
}
