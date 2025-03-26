package com.example.Sindopoly_Java.controller;

import com.example.Sindopoly_Java.service.GameStateService;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/game-state")
public class GameStateController {

    private final GameStateService gameStateService;

    public GameStateController(GameStateService gameStateService) {
        this.gameStateService = gameStateService;
    }

    /**
     * Save Game State
     * POST /api/game-state/{gameId}
     * Body: JSON with fields like { "status": "inProgress", ... }
     */
    @PostMapping("/{gameId}")
    public String saveGameState(@PathVariable int gameId, @RequestBody Map<String, Object> gameData) {
        gameStateService.saveGame(gameId, gameData);
        return "Game state saved successfully.";
    }

    /**
     * Get Game State
     * GET /api/game-state/{gameId}
     */
    @GetMapping("/{gameId}")
    public Map<String, String> getGameState(@PathVariable int gameId) {
        return gameStateService.getGame(gameId);
    }

    /**
     * Delete Game State
     * DELETE /api/game-state/{gameId}
     */
    @DeleteMapping("/{gameId}")
    public String deleteGameState(@PathVariable int gameId) {
        gameStateService.deleteGame(gameId);
        return "Game state deleted successfully.";
    }
}
