package com.example.Sindopoly_Java.security;

import com.example.Sindopoly_Java.model.Player;
import com.example.Sindopoly_Java.repository.PlayerRepository;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;

@Component
public class AuthenticatedPlayerResolver {

    private final PlayerRepository playerRepository;

    public AuthenticatedPlayerResolver(PlayerRepository playerRepository) {
        this.playerRepository = playerRepository;
    }

    public int requirePlayerId(Authentication authentication) {
        PlayerPrincipal principal = principal(authentication);
        if (!playerRepository.existsById(principal.playerId())) {
            throw new AuthenticationCredentialsNotFoundException("Player session is no longer valid");
        }
        return principal.playerId();
    }

    public Player requirePlayer(Authentication authentication) {
        PlayerPrincipal principal = principal(authentication);
        return playerRepository.findById(principal.playerId())
                .orElseThrow(() -> new AuthenticationCredentialsNotFoundException(
                        "Player session is no longer valid"));
    }

    /**
     * Legacy request IDs remain compatibility selectors, never identity proof.
     */
    public int requireMatchingPlayerId(int suppliedPlayerId, Authentication authentication) {
        int authenticatedPlayerId = requirePlayerId(authentication);
        if (suppliedPlayerId != authenticatedPlayerId) {
            throw new AccessDeniedException("Player identity does not match the authenticated session");
        }
        return authenticatedPlayerId;
    }

    private PlayerPrincipal principal(Authentication authentication) {
        if (authentication == null
                || !authentication.isAuthenticated()
                || !(authentication.getPrincipal() instanceof PlayerPrincipal principal)) {
            throw new AuthenticationCredentialsNotFoundException("Authenticated player session required");
        }
        return principal;
    }
}
