package com.example.Sindopoly_Java.utils;

import com.example.Sindopoly_Java.repository.PlayerRepository;
import org.springframework.stereotype.Component;
import java.util.Map;

@Component
public class ValidationUtils {

    private final PlayerRepository playerRepo;

    public ValidationUtils(PlayerRepository playerRepo) {
        this.playerRepo = playerRepo;
    }

    /** Ensure the player exists */
    public void validatePlayerExists(int playerId) {
        if (!playerRepo.existsById(playerId)) {
            throw new IllegalArgumentException("Player with ID " + playerId + " does not exist.");
        }
    }

    /** Ensure it is this player's turn */
    public void ensurePlayerTurn(int gameId,
                                 int playerId,
                                 Map<String,String> gameHash) {
        String current = gameHash.get("playerTurn");
        if (!String.valueOf(playerId).equals(current)) {
            throw new IllegalStateException("Not your turn.");
        }
    }

    /** Ensure game is still in lobby state */
    public void ensureLobby(String status) {
        if (!"lobby".equalsIgnoreCase(status))
            throw new IllegalStateException("Game already started.");
    }

    /** Prevent negative money except via bankruptcy handling */
    public void assertNonNegativeMoney(int money) {
        if (money < 0)
            throw new IllegalStateException("Money cannot be negative.");
    }

    /** Validate a player's nickname */
    public void validateNickname(String name) {
        if (name == null || !name.matches("^[A-Za-z0-9_]{2,15}$")) {
            throw new IllegalArgumentException("Nickname may contain only A-Z, 0-9, _ (2–15 chars)");
        }
    }

    /** Validate an invite code */
    public void validateInviteCode(String code) {
        if (code == null || !code.matches("^[A-Z0-9]{5}$")) {
            throw new IllegalArgumentException("Invalid invite code");
        }
    }

}
