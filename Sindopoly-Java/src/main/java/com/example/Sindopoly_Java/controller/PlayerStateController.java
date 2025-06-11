package com.example.Sindopoly_Java.controller;

import com.example.Sindopoly_Java.model.Player;
import com.example.Sindopoly_Java.model.dto.ActionRequestDto;
import com.example.Sindopoly_Java.model.dto.ActionResultDto;
import com.example.Sindopoly_Java.repository.PlayerRepository; // Add this import
import com.example.Sindopoly_Java.service.GameStateService;
import com.example.Sindopoly_Java.service.PlayerStateService;
import com.example.Sindopoly_Java.service.core.SquareActionService;
import com.example.Sindopoly_Java.service.orchestrator.TurnService;
import com.example.Sindopoly_Java.utils.ValidationUtils;

import lombok.val;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/player-state")
public class PlayerStateController {

    private final PlayerStateService playerStateService;
    private final SquareActionService squareActionSvc;
    private final PlayerRepository playerRepository;
    private final GameStateService gameStateSvc;
    private final TurnService turnSvc;
    private final ValidationUtils validationUtils;

    @Autowired
    public PlayerStateController(PlayerStateService playerStateService,
                                 SquareActionService squareActionSvc,
                                 PlayerRepository playerRepository,
                                 GameStateService gameStateSvc,
                                 TurnService turnSvc,
                                 ValidationUtils v) {
        this.playerStateService = playerStateService;
        this.squareActionSvc= squareActionSvc;
        this.playerRepository     = playerRepository;
        this.gameStateSvc   = gameStateSvc;
        this.turnSvc        = turnSvc;
        this.validationUtils= v;
    }

    /**
     * Create a new Player
     * POST /api/player-state/create
     * Body: JSON like { "nickname": "Player1" }
     */
    @PostMapping("/create")
    public ResponseEntity<Integer> createPlayer(@RequestBody Map<String, String> body) {
        String nickname = body.get("nickname");

        validationUtils.validateNickname(nickname);

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
}