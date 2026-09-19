package com.example.Sindopoly_Java.controller;

import com.example.Sindopoly_Java.model.Player;
import com.example.Sindopoly_Java.model.dto.CreatePlayerRequest;
import com.example.Sindopoly_Java.repository.PlayerRepository;
import com.example.Sindopoly_Java.service.PlayerStateService;
import com.example.Sindopoly_Java.security.AuthenticatedPlayerResolver;
import com.example.Sindopoly_Java.security.PlayerSessionService;
import com.example.Sindopoly_Java.utils.NicknamePolicy;

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
    private final NicknamePolicy nicknamePolicy;
    private final AuthenticatedPlayerResolver authenticatedPlayerResolver;
    private final PlayerSessionService playerSessionService;

    @Autowired
    public PlayerStateController(PlayerStateService playerStateService,
                                 PlayerRepository playerRepository,
                                 NicknamePolicy nicknamePolicy,
                                 AuthenticatedPlayerResolver authenticatedPlayerResolver,
                                 PlayerSessionService playerSessionService) {
        this.playerStateService = playerStateService;
        this.playerRepository = playerRepository;
        this.nicknamePolicy = nicknamePolicy;
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
            @RequestBody CreatePlayerRequest body,
            HttpServletRequest request,
            HttpServletResponse response) {
        String nickname = nicknamePolicy.acceptedName(body != null ? body.nickname() : null);

        // Reject identity switching before a durable Player row can be created.
        playerSessionService.assertCanEstablish();

        Player player = new Player();
        player.setName(nickname);

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
