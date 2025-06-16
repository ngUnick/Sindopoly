package com.example.Sindopoly_Java.controller;

import com.example.Sindopoly_Java.service.GameStateService;
import com.example.Sindopoly_Java.service.PlayerStateService;
import com.example.Sindopoly_Java.service.orchestrator.TurnService;
import com.example.Sindopoly_Java.dto.GameCreationRequest;
import com.example.Sindopoly_Java.model.Player;
import com.example.Sindopoly_Java.model.dto.PlayerDetailedDto;
import com.example.Sindopoly_Java.repository.PlayerRepository;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import com.example.Sindopoly_Java.utils.ValidationUtils;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;



@RestController
@RequestMapping("/api/game-state")
public class GameStateController {

    private final GameStateService gameStateService;
    private final PlayerStateService playerStateService;

    @Autowired
    private ValidationUtils validationUtils;

    public GameStateController(GameStateService gameStateService, 
                               PlayerStateService playerStateService) {
        this.playerStateService = playerStateService;
        this.gameStateService = gameStateService;
    }


    @Autowired
    private PlayerRepository playerRepo;

    /**
     * Get all players in a game with detailed information
     * GET /api/game-state/players-detailed/{gameId}
     */
    @GetMapping("/players-detailed-lobby/{gameId}")
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
     * Get all players in a game with detailed information
     * GET /api/game-state/players-detailed/{gameId}
     */
    @GetMapping("/players-detailed/{gameId}")
    public ResponseEntity<List<PlayerDetailedDto>> getPlayersDetailed(
        @PathVariable int gameId
    ) {
        // 1) getPlayersInGame now returns a LinkedHashSet in join-order
        Set<String> ids = gameStateService.getPlayersInGame(gameId);

        List<PlayerDetailedDto> dtos = new ArrayList<>();
        for (String pidStr : ids) {
            int pid = Integer.parseInt(pidStr);
            String nickname = playerRepo.findById(pid)
                                .map(Player::getName)
                                .orElse("Unknown");
            Map<String,Object> state = playerStateService.getPlayerState(pid);
            int position = parseIntOrDefault(state.get("position"), 0);
            int money    = parseIntOrDefault(state.get("money"),    0);
            String props = (String) state.getOrDefault("properties","[]");
            dtos.add(new PlayerDetailedDto(pid, nickname, position, money, props));
        }
        return ResponseEntity.ok(dtos);
    }


    /** Helper to coerce Object→int or return default if missing/bad */
    private int parseIntOrDefault(Object o, int defaultValue) {
    if (o == null) return defaultValue;
    try {
        return Integer.parseInt(o.toString());
    } catch (NumberFormatException e) {
        return defaultValue;
    }
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
     *
     * Requires at least 2 players in the lobby to start.
     */
    @PostMapping("/{gameId}/start")
    public ResponseEntity<?> startGame(
            @PathVariable int gameId,
            @RequestParam int playerId) {
        try {
            Set<String> currentPlayers = gameStateService.getPlayersInGame(gameId);

            // Reject if fewer than 2 players
            if (currentPlayers.size() < 2) {
                return ResponseEntity
                    .status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("error", "At least 2 players are required to start the game."));
            }

            gameStateService.startGame(gameId, playerId);
            return ResponseEntity.ok(Map.of("status", "inProgress", "gameId", gameId));
        } catch (IllegalStateException ex) {
            // Owner check / other state‐related errors
            return ResponseEntity.status(403).body(Map.of("error", ex.getMessage()));
        }
    }




    /**
     * Get all public games in lobby state
     * GET /api/game-state/public-lobby
     */
    @GetMapping("/public-lobby")
    public List<Map<String, String>> getAllPublicLobbyGames() {
        return gameStateService.getAllPublicLobbyGames();
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

        Set<String> currentPlayers = gameStateService.getPlayersInGame(gameId);

        // Reject if lobby already has 4 players
        if (currentPlayers.size() >= 4) {
            return ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .body("This game is already full (4 players).");
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
    public Map<String, String> joinWithInvite(@RequestParam String inviteCode,
                                            @RequestParam int playerId) {

        String id = gameStateService.addPlayerToGameWithInviteCode(inviteCode, playerId);

        // for error paths we still return the message
        if (!id.chars().allMatch(Character::isDigit)) {
            return Map.of("error", id);
        }
        return Map.of("gameId", id);
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


}
