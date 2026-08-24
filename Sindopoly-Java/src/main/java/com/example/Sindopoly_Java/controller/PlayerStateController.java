package com.example.Sindopoly_Java.controller;

import com.example.Sindopoly_Java.model.Player;
import com.example.Sindopoly_Java.repository.PlayerRepository;
import com.example.Sindopoly_Java.service.PlayerStateService;
import com.example.Sindopoly_Java.security.AuthenticatedPlayerResolver;
import com.example.Sindopoly_Java.security.PlayerSessionService;
import com.example.Sindopoly_Java.utils.ValidationUtils;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/player-state")
public class PlayerStateController {

    private final PlayerStateService playerStateService;
    private final PlayerRepository playerRepository;
    private final ValidationUtils validationUtils;
    private final AuthenticatedPlayerResolver authenticatedPlayerResolver;
    private final PlayerSessionService playerSessionService;

    @Autowired
    public PlayerStateController(PlayerStateService playerStateService,
                                 PlayerRepository playerRepository,
                                 ValidationUtils v,
                                 AuthenticatedPlayerResolver authenticatedPlayerResolver,
                                 PlayerSessionService playerSessionService) {
        this.playerStateService = playerStateService;
        this.playerRepository = playerRepository;
        this.validationUtils = v;
        this.authenticatedPlayerResolver = authenticatedPlayerResolver;
        this.playerSessionService = playerSessionService;
    }

    /**
     * Create a new Player
     * POST /api/player-state/create
     * Body: JSON like { "nickname": "Player1" }
     */
    @PostMapping("/create")
    public ResponseEntity<Integer> createPlayer(
            @RequestBody Map<String, String> body,
            HttpServletRequest request,
            HttpServletResponse response) {
        String nickname = body.get("nickname");

        validationUtils.validateNickname(nickname);

        if (nickname == null || nickname.trim().isEmpty()) {
            throw new IllegalArgumentException("Nickname is required");
        }

        // Reject identity switching before a durable Player row can be created.
        playerSessionService.assertCanEstablish();

        Player player = new Player();
        player.setName(nickname.trim());

        player = playerRepository.save(player);
        playerSessionService.establish(player, request, response);
        return ResponseEntity.ok(player.getId()); // return player ID
    }

    /**
     * Get Player State
     * GET /api/player-state/{playerId}
     */
    @GetMapping("/{playerId}")
    public Map<String, Object> getPlayer(@PathVariable int playerId, Authentication authentication) {
        authenticatedPlayerResolver.requireMatchingPlayerId(playerId, authentication);
        return playerStateService.getPlayerState(playerId);
    }

}
