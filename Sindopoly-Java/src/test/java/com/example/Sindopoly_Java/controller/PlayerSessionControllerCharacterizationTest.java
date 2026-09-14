package com.example.Sindopoly_Java.controller;

import com.example.Sindopoly_Java.model.dto.CurrentGameDto;
import com.example.Sindopoly_Java.security.AuthenticatedPlayerResolver;
import com.example.Sindopoly_Java.service.CurrentGameService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.Authentication;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PlayerSessionControllerCharacterizationTest {
    @Mock AuthenticatedPlayerResolver authenticatedPlayerResolver;
    @Mock CurrentGameService currentGameService;
    @Mock Authentication authentication;
    @InjectMocks PlayerSessionController controller;

    @Test
    void currentGameUsesOnlyTheAuthenticatedSessionPlayer() {
        CurrentGameDto current = new CurrentGameDto(22, "inProgress", 5, "public");
        when(authenticatedPlayerResolver.requirePlayerId(authentication)).thenReturn(7);
        when(currentGameService.findForPlayer(7)).thenReturn(Optional.of(current));

        assertThat(controller.currentGame(authentication).getBody()).isEqualTo(current);
        verify(currentGameService).findForPlayer(7);
    }

    @Test
    void currentGameReturnsNoContentWhenThereIsNoResumableGame() {
        when(authenticatedPlayerResolver.requirePlayerId(authentication)).thenReturn(7);
        when(currentGameService.findForPlayer(7)).thenReturn(Optional.empty());

        assertThat(controller.currentGame(authentication).getStatusCode().value()).isEqualTo(204);
    }
}
