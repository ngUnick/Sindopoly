package com.example.Sindopoly_Java.controller;

import com.example.Sindopoly_Java.model.Player;
import com.example.Sindopoly_Java.repository.PlayerRepository; // Add this import
import com.example.Sindopoly_Java.service.PlayerStateService;
import com.example.Sindopoly_Java.service.core.SquareActionService;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.Map;

@RestController
@RequestMapping("/api/player-state")
public class PlayerStateController {

    private final PlayerStateService playerStateService;
    private final SquareActionService squareActionService;
    private final PlayerRepository playerRepository; // Add this field

    public PlayerStateController(PlayerStateService playerStateService,
                                 SquareActionService squareActionService,
                                 PlayerRepository playerRepository) { // Add PlayerRepository to constructor
        this.playerStateService = playerStateService;
        this.squareActionService = squareActionService;
        this.playerRepository = playerRepository; // Assign it
    }

    /**
     * Create a new Player
     * POST /api/player-state/create
     * Body: JSON like { "nickname": "Player1" }
     */
    @PostMapping("/create")
    public ResponseEntity<Integer> createPlayer(@RequestBody Map<String, String> body) {
        String nickname = body.get("nickname");

        if (nickname == null || nickname.trim().isEmpty()) {
            throw new IllegalArgumentException("Nickname is required");
        }

        Player player = new Player();
        player.setName(nickname.trim());

        player = playerRepository.save(player);
        System.out.println("Saving player: " + nickname);
        return ResponseEntity.ok(player.getId()); // return player ID
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

     /** 
      * Pay to get out of jail
      * POST /api/player-state/{gameId}/{playerId}/pay-jail   (body empty)
      */
    @PostMapping("/{gameId}/{playerId}/pay-jail")
    public ResponseEntity<?> payJail(@PathVariable int gameId,
                                     @PathVariable int playerId){
        playerStateService.payToExitJail(playerId, 50);
        return ResponseEntity.ok(Map.of("status","freed","paid",50));
    }

    /**
     * Buy a property 
     * POST /api/player-state/{gameId}/{playerId}/buy?propertyId=12
     * */
    @PostMapping("/{gameId}/{playerId}/buy")
    public ResponseEntity<?> buyProperty(@PathVariable int gameId,
                                         @PathVariable int playerId,
                                         @RequestParam int propertyId){
        squareActionService.forceBuyProperty(gameId, playerId, propertyId);
        return ResponseEntity.ok(Map.of("status","bought","property",propertyId));
    }
}