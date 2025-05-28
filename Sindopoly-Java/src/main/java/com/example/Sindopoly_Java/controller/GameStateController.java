package com.example.Sindopoly_Java.controller;

import com.example.Sindopoly_Java.service.GameStateService;
import com.example.Sindopoly_Java.service.orchestrator.TurnService;
import com.example.Sindopoly_Java.dto.GameCreationRequest;
import com.example.Sindopoly_Java.repository.PlayerRepository;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;



@RestController
@RequestMapping("/api/game-state")
public class GameStateController {

    private final GameStateService gameStateService;

    public GameStateController(GameStateService gameStateService) {
        this.gameStateService = gameStateService;
    }


    @Autowired
    private PlayerRepository playerRepo;

    @GetMapping("/players-detailed/{gameId}")
    public List<Map<String, Object>> getPlayerDetailsInGame(@PathVariable int gameId) {
        Set<String> playerIds = gameStateService.getPlayersInGame(gameId);

        return playerIds.stream()
            .map(id -> {
                Map<String, Object> entry = new HashMap<>();
                entry.put("id", id);

                playerRepo.findById(Integer.parseInt(id)).ifPresent(player ->
                    entry.put("nickname", player.getName())
                );

                return entry;
            })
            .toList();
    }


    /**
     * Create a new game
     * POST /api/game-state/create
     * Body: { "ownerId": 1, "visibility": "private" }
     */
    @PostMapping("/create")
    public Map<String, String> createGame(@RequestBody GameCreationRequest request) {
        int ownerId = request.getOwnerId();
        Map<String, String> response = gameStateService.createGame(ownerId, request.getVisibility());
        response.put("gameId", String.valueOf(ownerId));
        return response;
    }


    
    /**
     * Check if a player is in any game
     * GET /api/game-state/in-game/{playerId}
     */
    @GetMapping("/in-game/{playerId}")
    public boolean isPlayerInGame(@PathVariable int playerId) {
        return gameStateService.isPlayerInAnyGame(playerId);
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
     * POST /api/game-state/add/{gameId}/{playerId}
     */
    @PostMapping("/add/{gameId}/{playerId}")
    public ResponseEntity<String> addPlayer(@PathVariable int gameId, @PathVariable int playerId) {
        // ❌ Prevent player from joining multiple games
        if (gameStateService.isPlayerInAnyGame(playerId)) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("Player is already in another game.");
        }

        // ✅ Proceed to add
        gameStateService.addPlayerToGame(gameId, playerId);
        return ResponseEntity.ok("Player added to game.");
    }


    /**
     * Get all player IDs in a game
     * GET /api/game-state/players/{gameId}
     */
    @GetMapping("/players/{gameId}")
    public Set<String> getPlayersInGame(@PathVariable int gameId) {
        return gameStateService.getPlayersInGame(gameId);
    }

    /**
     * Add a player to a game using an invite code
     * POST /api/game-state/join-with-invite?inviteCode=ABC123&playerId=2
     */
    @PostMapping("/join-with-invite")
    public String joinWithInvite(@RequestParam String inviteCode, @RequestParam int playerId) {
        return gameStateService.addPlayerToGameWithInviteCode(inviteCode, playerId);
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

    /**
     * Check end conditions
     * GET /api/game-state/{gameId}/check-end
     */
    @PostMapping("/{gameId}/check-end")
    public String checkGameEnd(@PathVariable int gameId) {
        boolean ended = gameStateService.checkEndCondition(gameId);
        return ended ? "Game ended due to condition." : "Game continues.";
    }


    /**
     * 
     * POST /api/turn/{gameId}/{playerId}
     */
    @RestController
    @RequestMapping("/api/turn")
    public class TurnController {

        private final TurnService turnService;
        public TurnController(TurnService ts) { this.turnService = ts; }

        @PostMapping("/{gameId}/{playerId}")
        public TurnService.TurnResponse playTurn(
                @PathVariable int gameId,
                @PathVariable int playerId) {
            return turnService.playTurn(gameId, playerId);
        }
    }


}
