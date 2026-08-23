package com.example.Sindopoly_Java.controller;

import com.example.Sindopoly_Java.model.Player;
import com.example.Sindopoly_Java.model.dto.CurrentPlayerDto;
import com.example.Sindopoly_Java.security.AuthenticatedPlayerResolver;
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

    public PlayerSessionController(AuthenticatedPlayerResolver authenticatedPlayerResolver) {
        this.authenticatedPlayerResolver = authenticatedPlayerResolver;
    }

    @GetMapping("/me")
    public CurrentPlayerDto currentPlayer(Authentication authentication) {
        Player player = authenticatedPlayerResolver.requirePlayer(authentication);
        return new CurrentPlayerDto(player.getId(), player.getName());
    }

    @GetMapping("/csrf")
    public Map<String, String> csrf(CsrfToken token) {
        return Map.of(
                "headerName", token.getHeaderName(),
                "parameterName", token.getParameterName(),
                "token", token.getToken());
    }
}
