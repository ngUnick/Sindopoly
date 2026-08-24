package com.example.Sindopoly_Java.controller;

import com.example.Sindopoly_Java.dto.GameCreationRequest;
import com.example.Sindopoly_Java.security.AuthenticatedPlayerResolver;
import com.example.Sindopoly_Java.security.GameAuthorizationService;
import com.example.Sindopoly_Java.service.GameStateService;
import com.example.Sindopoly_Java.service.PlayerStateService;
import com.example.Sindopoly_Java.service.transition.CommandMetadata;
import com.example.Sindopoly_Java.service.transition.CommandMetadataResolver;
import com.example.Sindopoly_Java.service.transition.GameCommandService;
import com.example.Sindopoly_Java.service.transition.TransitionExecution;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.Authentication;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class GameStateControllerCharacterizationTest {
    @Mock GameStateService gameStateService;
    @Mock PlayerStateService playerStateService;
    @Mock AuthenticatedPlayerResolver authenticatedPlayerResolver;
    @Mock GameAuthorizationService gameAuthorizationService;
    @Mock GameCommandService gameCommandService;
    @Mock CommandMetadataResolver commandMetadataResolver;
    @Mock Authentication authentication;
    @InjectMocks GameStateController controller;
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void createDerivesActorAndUsesCentralCommandMetadata() {
        GameCreationRequest request = new GameCreationRequest();
        request.setOwnerId(17); request.setVisibility("public");
        CommandMetadata metadata = metadata(1, -1);
        when(authenticatedPlayerResolver.requireMatchingPlayerId(17, authentication)).thenReturn(17);
        when(commandMetadataResolver.resolve(metadata.commandId(), "-1")).thenReturn(metadata);
        when(gameCommandService.create(17, "public", metadata)).thenReturn(execution(0, "gameId", 17));
        assertEquals(17, controller.createGame(request, authentication, metadata.commandId(), "-1").get("gameId").asInt());
        verify(gameCommandService).create(17, "public", metadata);
    }

    @Test
    void joinDelegatesToAuthoritativeCommandPath() {
        CommandMetadata metadata = metadata(2, 4);
        when(authenticatedPlayerResolver.requireMatchingPlayerId(2, authentication)).thenReturn(2);
        when(commandMetadataResolver.resolve(metadata.commandId(), "4")).thenReturn(metadata);
        when(gameCommandService.joinPublic(1, 2, metadata)).thenReturn(execution(5, "status", "joined"));
        assertEquals("joined", controller.addPlayer(1, 2, authentication, metadata.commandId(), "4")
                .getBody().get("status").asText());
    }

    @Test
    void startDelegatesActorAndMetadata() {
        CommandMetadata metadata = metadata(3, 4);
        when(authenticatedPlayerResolver.requireMatchingPlayerId(1, authentication)).thenReturn(1);
        when(commandMetadataResolver.resolve(metadata.commandId(), "4")).thenReturn(metadata);
        when(gameCommandService.start(1, 1, metadata)).thenReturn(execution(5, "status", "inProgress"));
        var body = (com.fasterxml.jackson.databind.JsonNode) controller
                .startGame(1, 1, authentication, metadata.commandId(), "4").getBody();
        assertEquals("inProgress", body.get("status").asText());
    }

    @Test
    void leaveKeepsAuthenticatedActorAuthoritative() {
        CommandMetadata metadata = metadata(4, 4);
        when(authenticatedPlayerResolver.requireMatchingPlayerId(2, authentication)).thenReturn(2);
        when(commandMetadataResolver.resolve(metadata.commandId(), "4")).thenReturn(metadata);
        when(gameCommandService.leave(1, 2, metadata)).thenReturn(execution(5, "status", "removed"));
        assertEquals("removed", controller.removePlayer(1, 2, authentication, metadata.commandId(), "4")
                .get("status").asText());
    }

    @Test
    void kickKeepsActorDistinctFromTarget() {
        CommandMetadata metadata = metadata(5, 4);
        when(authenticatedPlayerResolver.requirePlayerId(authentication)).thenReturn(1);
        when(commandMetadataResolver.resolve(metadata.commandId(), "4")).thenReturn(metadata);
        when(gameCommandService.kick(1, 1, 2, metadata)).thenReturn(execution(5, "status", "removed"));
        controller.kickPlayer(1, 2, authentication, metadata.commandId(), "4");
        verify(gameCommandService).kick(1, 1, 2, metadata);
    }

    private CommandMetadata metadata(int suffix, long version) {
        return new CommandMetadata("00000000-0000-0000-0000-00000000000" + suffix, version);
    }
    private TransitionExecution execution(long version, String key, Object value) {
        return new TransitionExecution(TransitionExecution.Status.APPLIED, version,
                mapper.valueToTree(java.util.Map.of(key, value)));
    }
}
