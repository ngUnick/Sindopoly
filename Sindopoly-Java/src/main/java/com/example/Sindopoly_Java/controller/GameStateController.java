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

    // Save game state
    @PostMapping("/{gameId}")
    public String saveGameState(@PathVariable String gameId, @RequestBody Map<String, Object> gameData) {
        gameStateService.saveGameState(gameId, gameData);
        return "Game state saved successfully.";
    }

    // Get game state
    @GetMapping("/{gameId}")
    public Map<Object, Object> getGameState(@PathVariable String gameId) {
        return gameStateService.getGameState(gameId);
    }

    // Delete game state
    @DeleteMapping("/{gameId}")
    public String deleteGameState(@PathVariable String gameId) {
        gameStateService.deleteGameState(gameId);
        return "Game state deleted successfully.";
    }
}
