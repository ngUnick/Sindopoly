package com.example.Sindopoly_Java.controller;

import com.example.Sindopoly_Java.service.PlayerStateService;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/player-state")
public class PlayerStateController {

    private final PlayerStateService playerStateService;

    public PlayerStateController(PlayerStateService playerStateService) {
        this.playerStateService = playerStateService;
    }

    /**
     * Save Player State
     * POST /api/player-state/{playerId}
     * Body: JSON like { "position": 10, "money": 500, ... }
     */
    @PostMapping("/{playerId}")
    public String savePlayer(@PathVariable int playerId, @RequestBody Map<String, Object> playerData) {
        playerStateService.savePlayerState(playerId, playerData);
        return "Player state saved successfully.";
    }

    /**
     * Get Player State
     * GET /api/player-state/{playerId}
     */
    @GetMapping("/{playerId}")
    public Map<String, Object> getPlayer(@PathVariable int playerId) {
        return playerStateService.getPlayerState(playerId);
    }

    /**
     * Delete Player State
     * DELETE /api/player-state/{playerId}
     */
    @DeleteMapping("/{playerId}")
    public String deletePlayer(@PathVariable int playerId) {
        playerStateService.deletePlayer(playerId);
        return "Player state deleted successfully.";
    }
}
