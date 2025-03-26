package com.example.Sindopoly_Java.controller;

import com.example.Sindopoly_Java.service.GameStateService;
import com.example.Sindopoly_Java.dto.GameCreationRequest;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.Set;

@RestController
@RequestMapping("/api/game-state")
public class GameStateController {

    private final GameStateService gameStateService;

    public GameStateController(GameStateService gameStateService) {
        this.gameStateService = gameStateService;
    }

    /**
     * Create a new game
     * POST /api/game-state/create
     * Body: { "ownerId": 1, "visibility": "private" }
     */
    @PostMapping("/create")
    public Map<String, String> createGame(@RequestBody GameCreationRequest request) {
        // Use ownerId as the gameId for easier lookup
        int ownerId = request.getOwnerId();
        return gameStateService.createGame(ownerId, request.getVisibility());
    }

    /**
     * Start a game
     * POST /api/game-state/{gameId}/start
     */
    @PostMapping("/{gameId}/start")
    public String startGame(@PathVariable int gameId) {
        gameStateService.startGame(gameId);
        return "Game started.";
    }

    /**
     * Add a player to a game
     * POST /api/game-state/{gameId}/add-player?playerId=2
     */
    @PostMapping("/{gameId}/add-player")
    public String addPlayer(@PathVariable int gameId, @RequestParam int playerId) {
        gameStateService.addPlayerToGame(gameId, playerId);
        return "Player added to game.";
    }

    /**
     * Remove a player from a game
     * POST /api/game-state/{gameId}/remove-player?playerId=2
     */
    @PostMapping("/{gameId}/remove-player")
    public String removePlayer(@PathVariable int gameId, @RequestParam int playerId) {
        gameStateService.removePlayerFromGame(gameId, playerId);
        return "Player removed from game.";
    }

    /**
     * Get game state
     * GET /api/game-state/{gameId}
     */
    @GetMapping("/{gameId}")
    public Map<String, String> getGameState(@PathVariable int gameId) {
        return gameStateService.getGame(gameId);
    }

    /**
     * Get players in a game
     * GET /api/game-state/{gameId}/players
     */
    @GetMapping("/{gameId}/players")
    public Set<String> getPlayers(@PathVariable int gameId) {
        return gameStateService.getPlayersInGame(gameId);
    }

    /**
     * Delete game state
     * DELETE /api/game-state/{gameId}
     */
    @DeleteMapping("/{gameId}")
    public String deleteGame(@PathVariable int gameId) {
        gameStateService.deleteGame(gameId);
        return "Game state deleted.";
    }
}
