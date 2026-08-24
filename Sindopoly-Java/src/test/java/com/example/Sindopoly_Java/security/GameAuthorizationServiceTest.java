package com.example.Sindopoly_Java.security;

import com.example.Sindopoly_Java.exception.GameNotFoundException;
import com.example.Sindopoly_Java.exception.GameStateConflictException;
import com.example.Sindopoly_Java.service.GameStateService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;

import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class GameAuthorizationServiceTest {

    @Mock
    private GameStateService gameStateService;

    @Test
    void memberCanReadOneAuthoritativeSnapshotAndNonMemberCannot() {
        GameAuthorizationService service = serviceFor(
                7, Map.of("status", "lobby"), Set.of("7", "8"));

        assertEquals(Set.of("7", "8"), service.requireMember(7, 8).memberIds());
        assertThrows(AccessDeniedException.class, () -> service.requireMember(7, 9));
    }

    @Test
    void missingGameIsNotReportedAsAnInternalFailure() {
        when(gameStateService.getGame(404)).thenReturn(Map.of());

        assertThrows(GameNotFoundException.class, () -> service().requireMember(404, 1));
    }

    @Test
    void onlyCurrentHostMemberCanPerformLobbyAdministration() {
        GameAuthorizationService service = serviceFor(
                7, Map.of("status", "lobby"), Set.of("7", "8"));

        assertEquals(7, service.requireHostInLobby(7, 7).actorPlayerId());
        assertThrows(AccessDeniedException.class, () -> service.requireHostInLobby(7, 8));
        assertThrows(AccessDeniedException.class, () -> service.requireHostInLobby(7, 9));
    }

    @Test
    void hostAdministrationRejectsWrongLifecycleAsConflict() {
        GameAuthorizationService service = serviceFor(
                7, Map.of("status", "inProgress", "playerTurn", "7"), Set.of("7", "8"));

        assertThrows(GameStateConflictException.class, () -> service.requireHostInLobby(7, 7));
    }

    @Test
    void rollRequiresMemberActivePlayerAndAwaitingRollPhase() {
        GameAuthorizationService service = serviceFor(
                7, Map.of("status", "inProgress", "playerTurn", "8"), Set.of("7", "8"));

        assertEquals(8, service.requireActivePlayerForRoll(7, 8).actorPlayerId());
        assertThrows(AccessDeniedException.class, () -> service.requireActivePlayerForRoll(7, 7));
        assertThrows(AccessDeniedException.class, () -> service.requireActivePlayerForRoll(7, 9));
    }

    @Test
    void optionalAndRollCommandsRejectTheWrongPhase() {
        GameAuthorizationService awaitingOptional = serviceFor(
                7,
                Map.of("status", "inProgress", "playerTurn", "7", "optionalAction", "{}"),
                Set.of("7"));
        assertThrows(
                GameStateConflictException.class,
                () -> awaitingOptional.requireActivePlayerForRoll(7, 7));

        GameAuthorizationService awaitingRoll = serviceFor(
                8, Map.of("status", "inProgress", "playerTurn", "7"), Set.of("7"));
        assertThrows(
                GameStateConflictException.class,
                () -> awaitingRoll.requireActivePlayerForOptionalAction(8, 7));
    }

    @Test
    void gameplayRejectsLobbyAndCompletedLifecycle() {
        GameAuthorizationService lobby = serviceFor(
                7, Map.of("status", "lobby"), Set.of("7"));
        GameAuthorizationService completed = serviceFor(
                8, Map.of("status", "ended", "playerTurn", "7"), Set.of("7"));

        assertThrows(GameStateConflictException.class, () -> lobby.requireActivePlayerForRoll(7, 7));
        assertThrows(GameStateConflictException.class, () -> completed.requireActivePlayerForRoll(8, 7));
    }

    @Test
    void hostTargetMustBeARealMemberOfTheAuthorizedGame() {
        GameAuthorizationService service = serviceFor(
                7, Map.of("status", "lobby"), Set.of("7", "8"));
        var access = service.requireHostInLobby(7, 7);

        service.requireTargetMember(access, 8);
        assertThrows(AccessDeniedException.class, () -> service.requireTargetMember(access, 99));
    }

    private GameAuthorizationService serviceFor(
            int gameId,
            Map<String, String> game,
            Set<String> members) {
        when(gameStateService.getGame(gameId)).thenReturn(game);
        when(gameStateService.getPlayersInGame(gameId)).thenReturn(members);
        return service();
    }

    private GameAuthorizationService service() {
        return new GameAuthorizationService(gameStateService);
    }
}
