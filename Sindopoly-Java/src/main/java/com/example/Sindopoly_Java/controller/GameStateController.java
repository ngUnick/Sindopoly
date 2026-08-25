package com.example.Sindopoly_Java.controller;

import com.example.Sindopoly_Java.service.GameStateService;
import com.example.Sindopoly_Java.service.PlayerStateService;
import com.example.Sindopoly_Java.dto.GameCreationRequest;
import com.example.Sindopoly_Java.model.Player;
import com.example.Sindopoly_Java.model.dto.PlayerDetailedDto;
import com.example.Sindopoly_Java.repository.PlayerRepository;
import com.example.Sindopoly_Java.security.AuthenticatedPlayerResolver;
import com.example.Sindopoly_Java.security.GameAuthorizationService;
import com.example.Sindopoly_Java.service.transition.CommandMetadata;
import com.example.Sindopoly_Java.service.transition.CommandMetadataResolver;
import com.example.Sindopoly_Java.service.transition.GameCommandService;
import com.fasterxml.jackson.databind.JsonNode;
import com.example.Sindopoly_Java.realtime.GameRealtimeSnapshot;
import com.example.Sindopoly_Java.realtime.GameRealtimeSnapshotService;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;



@RestController
@RequestMapping("/api/game-state")
public class GameStateController {

    private final GameStateService gameStateService;
    private final PlayerStateService playerStateService;
    private final AuthenticatedPlayerResolver authenticatedPlayerResolver;
    private final GameAuthorizationService gameAuthorizationService;
    private final GameCommandService gameCommandService;
    private final CommandMetadataResolver commandMetadataResolver;
    private final GameRealtimeSnapshotService realtimeSnapshots;

    public GameStateController(GameStateService gameStateService, 
                               PlayerStateService playerStateService,
                               AuthenticatedPlayerResolver authenticatedPlayerResolver,
                               GameAuthorizationService gameAuthorizationService,
                               GameCommandService gameCommandService,
                               CommandMetadataResolver commandMetadataResolver,
                               GameRealtimeSnapshotService realtimeSnapshots) {
        this.playerStateService = playerStateService;
        this.gameStateService = gameStateService;
        this.authenticatedPlayerResolver = authenticatedPlayerResolver;
        this.gameAuthorizationService = gameAuthorizationService;
        this.gameCommandService = gameCommandService;
        this.commandMetadataResolver = commandMetadataResolver;
        this.realtimeSnapshots = realtimeSnapshots;
    }


    @Autowired
    private PlayerRepository playerRepo;

    /**
     * Get all players in a game with detailed information
     * GET /api/game-state/players-detailed/{gameId}
     */
    @GetMapping("/players-detailed-lobby/{gameId}")
    public List<Map<String, Object>> getPlayerDetailsInGame(
            @PathVariable int gameId,
            Authentication authentication) {
        int actorId = authenticatedPlayerResolver.requirePlayerId(authentication);
        Set<String> playerIds = gameAuthorizationService.requireMember(gameId, actorId).memberIds();

        return playerIds.stream()
            .map(id -> {
                Map<String, Object> entry = new HashMap<>();
                entry.put("id", id);

                playerRepo.findById(Integer.parseInt(id)).ifPresent(player ->
                    entry.put("nickname", player.getName())
                );

                return entry;
            })
            .toList();
    }

    /**
     * Get all players in a game with detailed information
     * GET /api/game-state/players-detailed/{gameId}
     */
    @GetMapping("/players-detailed/{gameId}")
    public ResponseEntity<List<PlayerDetailedDto>> getPlayersDetailed(
        @PathVariable int gameId,
        Authentication authentication
    ) {
        int actorId = authenticatedPlayerResolver.requirePlayerId(authentication);
        Set<String> ids = gameAuthorizationService.requireMember(gameId, actorId).memberIds();

        List<PlayerDetailedDto> dtos = new ArrayList<>();
        for (String pidStr : ids) {
            int pid = Integer.parseInt(pidStr);
            String nickname = playerRepo.findById(pid)
                                .map(Player::getName)
                                .orElse("Unknown");
            Map<String,Object> state = playerStateService.getPlayerState(pid);
            int position = parseIntOrDefault(state.get("position"), 0);
            int money    = parseIntOrDefault(state.get("money"),    0);
            String props = (String) state.getOrDefault("properties","[]");
            dtos.add(new PlayerDetailedDto(pid, nickname, position, money, props));
        }
        return ResponseEntity.ok(dtos);
    }


    /** Helper to coerce Object→int or return default if missing/bad */
    private int parseIntOrDefault(Object o, int defaultValue) {
    if (o == null) return defaultValue;
    try {
        return Integer.parseInt(o.toString());
    } catch (NumberFormatException e) {
        return defaultValue;
    }
    }


    /**
     * Create a new game
     * POST /api/game-state/create
     * Body: { "ownerId": 1, "visibility": "private" }
     */
    @PostMapping("/create")
    public JsonNode createGame(
            @RequestBody GameCreationRequest request,
            Authentication authentication,
            @RequestHeader(value = CommandMetadata.COMMAND_ID_HEADER, required = false) String commandId,
            @RequestHeader(value = CommandMetadata.EXPECTED_VERSION_HEADER, required = false) String expectedVersion) {
        int ownerId = authenticatedPlayerResolver.requireMatchingPlayerId(
                request.getOwnerId(), authentication);
        return gameCommandService.create(ownerId, request.getVisibility(), metadata(commandId, expectedVersion)).semanticResult();
    }


    
    /**
     * Check if a player is in any game
     * GET /api/game-state/in-game/{playerId}
     */
    @GetMapping("/in-game/{playerId}")
    public boolean isPlayerInGame(@PathVariable int playerId, Authentication authentication) {
        authenticatedPlayerResolver.requireMatchingPlayerId(playerId, authentication);
        return gameStateService.isPlayerInAnyGame(playerId);
    }



    /**
     * Start a game
     * POST /api/game-state/{gameId}/start
     *
     * Requires at least 2 players in the lobby to start.
     */
    @PostMapping("/{gameId}/start")
    public ResponseEntity<?> startGame(
            @PathVariable int gameId,
            @RequestParam int playerId,
            Authentication authentication,
            @RequestHeader(value = CommandMetadata.COMMAND_ID_HEADER, required = false) String commandId,
            @RequestHeader(value = CommandMetadata.EXPECTED_VERSION_HEADER, required = false) String expectedVersion) {
        authenticatedPlayerResolver.requireMatchingPlayerId(playerId, authentication);
        return ResponseEntity.ok(gameCommandService.start(gameId, playerId, metadata(commandId, expectedVersion)).semanticResult());
    }




    /**
     * Get all public games in lobby state
     * GET /api/game-state/public-lobby
     */
    @GetMapping("/public-lobby")
    public List<Map<String, String>> getAllPublicLobbyGames() {
        return gameStateService.getAllPublicLobbyGames();
    }

    /**
     * Add a player to a game
     * POST /api/game-state/add/{gameId}/{playerId}
     */
    @PostMapping("/add/{gameId}/{playerId}")
    public ResponseEntity<JsonNode> addPlayer(
            @PathVariable int gameId,
            @PathVariable int playerId,
            Authentication authentication,
            @RequestHeader(value = CommandMetadata.COMMAND_ID_HEADER, required = false) String commandId,
            @RequestHeader(value = CommandMetadata.EXPECTED_VERSION_HEADER, required = false) String expectedVersion) {
        authenticatedPlayerResolver.requireMatchingPlayerId(playerId, authentication);
        return ResponseEntity.ok(gameCommandService.joinPublic(gameId, playerId,
                metadata(commandId, expectedVersion)).semanticResult());
    }


    /**
     * Get all player IDs in a game
     * GET /api/game-state/players/{gameId}
     */
    @GetMapping("/players/{gameId}")
    public Set<String> getPlayersInGame(@PathVariable int gameId, Authentication authentication) {
        int actorId = authenticatedPlayerResolver.requirePlayerId(authentication);
        return gameAuthorizationService.requireMember(gameId, actorId).memberIds();
    }

    /**
     * Add a player to a game using an invite code
     * POST /api/game-state/join-with-invite?inviteCode=ABC123&playerId=2
     */
    @PostMapping("/join-with-invite")
    public JsonNode joinWithInvite(@RequestParam String inviteCode,
                                            @RequestParam int playerId,
                                            Authentication authentication,
                                            @RequestHeader(value = CommandMetadata.COMMAND_ID_HEADER, required = false) String commandId,
                                            @RequestHeader(value = CommandMetadata.EXPECTED_VERSION_HEADER, required = false) String expectedVersion) {
        authenticatedPlayerResolver.requireMatchingPlayerId(playerId, authentication);
        return gameCommandService.joinInvite(inviteCode, playerId,
                metadata(commandId, expectedVersion)).semanticResult();
    }

    /** Bounded pre-join metadata lets private joins supply the required version. */
    @GetMapping("/invite-metadata")
    public GameCommandService.InviteMetadata getInviteMetadata(@RequestParam String inviteCode) {
        return gameCommandService.inviteMetadata(inviteCode);
    }



    /**
     * Remove a player from a game
     * POST /api/game-state/{gameId}/remove-player?playerId=2
     */
    @PostMapping("/{gameId}/remove-player")
    public JsonNode removePlayer(
            @PathVariable int gameId,
            @RequestParam int playerId,
            Authentication authentication,
            @RequestHeader(value = CommandMetadata.COMMAND_ID_HEADER, required = false) String commandId,
            @RequestHeader(value = CommandMetadata.EXPECTED_VERSION_HEADER, required = false) String expectedVersion) {
        authenticatedPlayerResolver.requireMatchingPlayerId(playerId, authentication);
        return gameCommandService.leave(gameId, playerId, metadata(commandId, expectedVersion)).semanticResult();
    }

    /**
     * Host removal keeps the authenticated host as actor; the path player is only the target.
     */
    @PostMapping("/{gameId}/players/{targetPlayerId}/kick")
    public JsonNode kickPlayer(
            @PathVariable int gameId,
            @PathVariable int targetPlayerId,
            Authentication authentication,
            @RequestHeader(value = CommandMetadata.COMMAND_ID_HEADER, required = false) String commandId,
            @RequestHeader(value = CommandMetadata.EXPECTED_VERSION_HEADER, required = false) String expectedVersion) {
        int actorId = authenticatedPlayerResolver.requirePlayerId(authentication);
        return gameCommandService.kick(gameId, actorId, targetPlayerId,
                metadata(commandId, expectedVersion)).semanticResult();
    }

    /**
     * Get game state
     * GET /api/game-state/{gameId}
     */
    @GetMapping("/{gameId}")
    public Map<String, String> getGameState(@PathVariable int gameId, Authentication authentication) {
        int actorId = authenticatedPlayerResolver.requirePlayerId(authentication);
        return gameAuthorizationService.requireMember(gameId, actorId).game();
    }

    /** Authoritative recovery state for reconnects, gaps, and duplicate notifications. */
    @GetMapping("/{gameId}/snapshot")
    public GameRealtimeSnapshot getRealtimeSnapshot(@PathVariable int gameId, Authentication authentication) {
        int actorId = authenticatedPlayerResolver.requirePlayerId(authentication);
        gameAuthorizationService.requireMember(gameId, actorId);
        return realtimeSnapshots.load(gameId);
    }

    /**
     * Get players in a game
     * GET /api/game-state/{gameId}/players
     */
    @GetMapping("/{gameId}/players")
    public Set<String> getPlayers(@PathVariable int gameId, Authentication authentication) {
        int actorId = authenticatedPlayerResolver.requirePlayerId(authentication);
        return gameAuthorizationService.requireMember(gameId, actorId).memberIds();
    }

    private CommandMetadata metadata(String commandId, String expectedVersion) {
        return commandMetadataResolver.resolve(commandId, expectedVersion);
    }

}
