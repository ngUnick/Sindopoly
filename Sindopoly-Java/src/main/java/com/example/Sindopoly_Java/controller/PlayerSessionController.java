package com.example.Sindopoly_Java.controller;

import com.example.Sindopoly_Java.model.Player;
import com.example.Sindopoly_Java.model.dto.CurrentPlayerDto;
import com.example.Sindopoly_Java.model.dto.CurrentGameDto;
import com.example.Sindopoly_Java.security.AuthenticatedPlayerResolver;
import com.example.Sindopoly_Java.service.CurrentGameService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/session")
public class PlayerSessionController {

    private final AuthenticatedPlayerResolver authenticatedPlayerResolver;
    private final CurrentGameService currentGameService;

    public PlayerSessionController(
            AuthenticatedPlayerResolver authenticatedPlayerResolver,
            CurrentGameService currentGameService) {
        this.authenticatedPlayerResolver = authenticatedPlayerResolver;
        this.currentGameService = currentGameService;
    }

    @GetMapping("/me")
    public CurrentPlayerDto currentPlayer(Authentication authentication) {
        Player player = authenticatedPlayerResolver.requirePlayer(authentication);
        return new CurrentPlayerDto(player.getId(), player.getName());
    }

    @GetMapping("/current-game")
    public ResponseEntity<CurrentGameDto> currentGame(Authentication authentication) {
        int playerId = authenticatedPlayerResolver.requirePlayerId(authentication);
        return currentGameService.findForPlayer(playerId)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @GetMapping("/csrf")
    public Map<String, String> csrf(CsrfToken token) {
        return Map.of(
                "headerName", token.getHeaderName(),
                "parameterName", token.getParameterName(),
                "token", token.getToken());
    }
}
