package com.example.Sindopoly_Java.security;

import com.example.Sindopoly_Java.exception.GameNotFoundException;
import com.example.Sindopoly_Java.exception.GameStateConflictException;
import com.example.Sindopoly_Java.service.GameStateService;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.Set;

/**
 * Applies game-scoped authorization to one authoritative Redis snapshot.
 * Request IDs select a resource; only the server-derived actor receives rights.
 */
@Service
public class GameAuthorizationService {

    private static final String STATUS_LOBBY = "lobby";
    private static final String STATUS_IN_PROGRESS = "inProgress";
    private static final String OPTIONAL_ACTION = "optionalAction";

    private final GameStateService gameStateService;

    public GameAuthorizationService(GameStateService gameStateService) {
        this.gameStateService = gameStateService;
    }

    public GameAccess requireMember(int gameId, int actorPlayerId) {
        GameAccess access = load(gameId, actorPlayerId);
        if (!access.memberIds().contains(String.valueOf(actorPlayerId))) {
            throw new AccessDeniedException("Game membership required");
        }
        return access;
    }

    public GameAccess requireHostInLobby(int gameId, int actorPlayerId) {
        GameAccess access = requireMember(gameId, actorPlayerId);
        requireHost(access);
        requireStatus(access, STATUS_LOBBY, "Game is not in the lobby phase");
        return access;
    }

    public GameAccess requireActivePlayerForRoll(int gameId, int actorPlayerId) {
        GameAccess access = requireActivePlayer(gameId, actorPlayerId);
        if (access.game().containsKey(OPTIONAL_ACTION)) {
            throw new GameStateConflictException("A pending optional action must be resolved first");
        }
        return access;
    }

    public GameAccess requireActivePlayerForOptionalAction(int gameId, int actorPlayerId) {
        GameAccess access = requireActivePlayer(gameId, actorPlayerId);
        if (!access.game().containsKey(OPTIONAL_ACTION)) {
            throw new GameStateConflictException("No optional action is pending");
        }
        return access;
    }

    public void requireTargetMember(GameAccess access, int targetPlayerId) {
        if (!access.memberIds().contains(String.valueOf(targetPlayerId))) {
            throw new AccessDeniedException("Target player is not a game member");
        }
    }

    private GameAccess requireActivePlayer(int gameId, int actorPlayerId) {
        GameAccess access = requireMember(gameId, actorPlayerId);
        requireStatus(access, STATUS_IN_PROGRESS, "Game is not in progress");
        if (!String.valueOf(actorPlayerId).equals(access.game().get("playerTurn"))) {
            throw new AccessDeniedException("Only the active player may perform this command");
        }
        return access;
    }

    private GameAccess load(int gameId, int actorPlayerId) {
        Map<String, String> game = gameStateService.getGame(gameId);
        if (game == null || game.isEmpty()) {
            throw new GameNotFoundException();
        }
        Set<String> members = gameStateService.getPlayersInGame(gameId);
        return new GameAccess(
                gameId,
                actorPlayerId,
                Map.copyOf(game),
                members == null ? Set.of() : Set.copyOf(members));
    }

    private void requireHost(GameAccess access) {
        // The current Redis schema has no owner field: game ID equals creator/host ID.
        if (access.gameId() != access.actorPlayerId()) {
            throw new AccessDeniedException("Host authority required");
        }
    }

    private void requireStatus(GameAccess access, String expected, String message) {
        if (!expected.equalsIgnoreCase(access.game().get("status"))) {
            throw new GameStateConflictException(message);
        }
    }

    public record GameAccess(
            int gameId,
            int actorPlayerId,
            Map<String, String> game,
            Set<String> memberIds) {
    }
}
