package com.example.Sindopoly_Java.security;

import com.example.Sindopoly_Java.model.Player;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.stereotype.Service;

@Service
public class PlayerSessionService {

    private final SecurityContextRepository securityContextRepository;

    public PlayerSessionService(SecurityContextRepository securityContextRepository) {
        this.securityContextRepository = securityContextRepository;
    }

    /**
     * Binds exactly one logical player to a rotated, framework-managed session.
     */
    public void establish(Player player, HttpServletRequest request, HttpServletResponse response) {
        assertCanEstablish();

        request.getSession(true);
        request.changeSessionId();

        Authentication authentication = UsernamePasswordAuthenticationToken.authenticated(
                new PlayerPrincipal(player.getId()),
                null,
                AuthorityUtils.NO_AUTHORITIES);
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        securityContextRepository.saveContext(context, request, response);
    }

    public void assertCanEstablish() {
        Authentication current = SecurityContextHolder.getContext().getAuthentication();
        if (current != null && current.isAuthenticated()
                && current.getPrincipal() instanceof PlayerPrincipal) {
            throw new AccessDeniedException("Logout before creating another player identity");
        }
    }
}
