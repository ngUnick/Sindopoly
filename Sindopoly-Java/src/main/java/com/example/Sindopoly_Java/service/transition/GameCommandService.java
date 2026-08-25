package com.example.Sindopoly_Java.service.transition;

import com.example.Sindopoly_Java.exception.GameNotFoundException;
import com.example.Sindopoly_Java.exception.GameStateConflictException;
import com.example.Sindopoly_Java.service.GameStateService;
import com.example.Sindopoly_Java.utils.ValidationUtils;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.Optional;

/** Calculates lobby commands from snapshots and delegates every write to the CAS store. */
@Service
public class GameCommandService {

    private static final long LOBBY_TTL_SECONDS = 24 * 60 * 60;
    private static final long PLAYER_TTL_SECONDS = 2 * 60 * 60;
    private static final String CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    private final RedisGameTransitionStore store;
    private final RedisTemplate<String, String> redis;
    private final ValidationUtils validation;
    private final GameStateService legacyReads;
    private final ObjectMapper mapper;
    private final SecureRandom random = new SecureRandom();

    public GameCommandService(RedisGameTransitionStore store, RedisTemplate<String, String> redis,
                              ValidationUtils validation, GameStateService legacyReads, ObjectMapper mapper) {
        this.store = store;
        this.redis = redis;
        this.validation = validation;
        this.legacyReads = legacyReads;
        this.mapper = mapper;
    }

    public TransitionExecution create(int ownerId, String visibility, CommandMetadata metadata) {
        metadata.requireCreate();
        validation.validatePlayerExists(ownerId);
        String normalizedVisibility = visibility == null ? "" : visibility.toLowerCase(Locale.ROOT);
        if (!Set.of("public", "private").contains(normalizedVisibility)) {
            throw new IllegalArgumentException("Visibility must be public or private");
        }
        String fingerprint = CommandFingerprint.create(ownerId, String.valueOf(ownerId), "CREATE_GAME", metadata,
                normalizedVisibility);
        Optional<TransitionExecution> replay = replay(ownerId, metadata, fingerprint);
        if (replay.isPresent()) {
            GameSnapshot current = requireGame(ownerId);
            requireMember(current, ownerId);
            return replay.get();
        }
        if (legacyReads.isPlayerInAnyGame(ownerId)) {
            throw new GameStateConflictException("Player is already in another game");
        }
        Map<String, String> game = new LinkedHashMap<>();
        game.put("status", "lobby");
        game.put("creationTime", Instant.now().toString());
        game.put("visibility", normalizedVisibility);
        game.put(TurnOrder.FIELD, TurnOrder.encode(mapper, List.of(ownerId)));
        if ("private".equals(normalizedVisibility)) game.put("inviteCode", inviteCode());
        JsonNode result = mapper.valueToTree(withVersionAndReplay(game, ownerId, 0, false));
        return commit(ownerId, metadata, fingerprint,
                GameTransitionPlan.bootstrap().putGame(game).addMember(ownerId).lifecycleTtl(LOBBY_TTL_SECONDS), result);
    }

    public TransitionExecution joinPublic(int gameId, int actorId, CommandMetadata metadata) {
        metadata.requireExistingGame();
        validation.validatePlayerExists(actorId);
        String fingerprint = CommandFingerprint.create(gameId, String.valueOf(actorId), "JOIN_PUBLIC", metadata, "");
        GameSnapshot snapshot = requireGame(gameId);
        Optional<TransitionExecution> replay = replay(gameId, metadata, fingerprint);
        if (replay.isPresent()) {
            requireMember(snapshot, actorId);
            return replay.get();
        }
        if (snapshot.members().contains(String.valueOf(actorId))) {
            return commit(gameId, metadata, fingerprint,
                    GameTransitionPlan.transition().noOp(),
                    mapper.valueToTree(Map.of("gameId", gameId, "status", "reconnected", "replayed", false,
                            "stateVersion", snapshot.stateVersion())));
        }
        requireLobby(snapshot);
        if (!"public".equalsIgnoreCase(snapshot.game().get("visibility"))) {
            throw new AccessDeniedException("Public game required");
        }
        requireJoinCapacity(actorId, snapshot);
        List<Integer> order = new java.util.ArrayList<>(TurnOrder.lobbyOrder(mapper, snapshot));
        order.add(actorId);
        return commit(gameId, metadata, fingerprint,
                GameTransitionPlan.transition().addMember(actorId)
                        .putGame(TurnOrder.FIELD, TurnOrder.encode(mapper, order)),
                mapper.valueToTree(Map.of("gameId", gameId, "status", "joined", "replayed", false,
                        "stateVersion", snapshot.stateVersion() + 1)));
    }

    public TransitionExecution joinInvite(String inviteCode, int actorId, CommandMetadata metadata) {
        metadata.requireExistingGame();
        validation.validatePlayerExists(actorId);
        validation.validateInviteCode(inviteCode);
        InviteMetadata invite = resolveInvite(inviteCode);
        String fingerprint = CommandFingerprint.create(invite.gameId(), String.valueOf(actorId), "JOIN_INVITE", metadata,
                inviteCode.toUpperCase(Locale.ROOT));
        GameSnapshot snapshot = requireGame(invite.gameId());
        Optional<TransitionExecution> replay = replay(invite.gameId(), metadata, fingerprint);
        if (replay.isPresent()) {
            requireMember(snapshot, actorId);
            return replay.get();
        }
        if (!inviteCode.equalsIgnoreCase(snapshot.game().get("inviteCode"))) {
            throw new GameStateConflictException("Invite is no longer valid");
        }
        if (!snapshot.members().contains(String.valueOf(actorId))) {
            requireLobby(snapshot);
            requireJoinCapacity(actorId, snapshot);
        }
        GameTransitionPlan plan;
        if (snapshot.members().contains(String.valueOf(actorId))) {
            plan = GameTransitionPlan.transition().noOp();
        } else {
            List<Integer> order = new java.util.ArrayList<>(TurnOrder.lobbyOrder(mapper, snapshot));
            order.add(actorId);
            plan = GameTransitionPlan.transition().addMember(actorId)
                    .putGame(TurnOrder.FIELD, TurnOrder.encode(mapper, order));
        }
        long resultVersion = snapshot.stateVersion() + (plan.stateChanging() ? 1 : 0);
        return commit(invite.gameId(), metadata, fingerprint, plan,
                mapper.valueToTree(Map.of("gameId", invite.gameId(), "status", plan.stateChanging() ? "joined" : "reconnected",
                        "replayed", false, "stateVersion", resultVersion)));
    }

    public InviteMetadata inviteMetadata(String inviteCode) {
        validation.validateInviteCode(inviteCode);
        InviteMetadata metadata = resolveInvite(inviteCode);
        requireLobby(requireGame(metadata.gameId()));
        return metadata;
    }

    public TransitionExecution start(int gameId, int actorId, CommandMetadata metadata) {
        metadata.requireExistingGame();
        String fingerprint = CommandFingerprint.create(gameId, String.valueOf(actorId), "START_GAME", metadata, "");
        GameSnapshot snapshot = requireGame(gameId);
        requireMember(snapshot, actorId);
        if (snapshot.gameId() != actorId) throw new AccessDeniedException("Host authority required");
        Optional<TransitionExecution> replay = replay(gameId, metadata, fingerprint);
        if (replay.isPresent()) return replay.get();
        requireHostMemberLobby(snapshot, actorId);
        if (snapshot.members().size() < 2) {
            throw new GameStateConflictException("At least 2 players are required to start the game");
        }
        List<Integer> order = TurnOrder.parseRequired(mapper, snapshot);
        if (!order.contains(gameId)) throw new GameStateConflictException("TURN_ORDER_INVALID: host is missing");
        GameTransitionPlan plan = GameTransitionPlan.transition()
                .putGame(Map.of("status", "inProgress", "playerTurn", String.valueOf(order.get(0)), "timer", "0",
                        "startTime", Instant.now().toString(), "maxTime", "1200", "maxMoney", "5000", "winner", "null"));
        Map<String, String> initial = Map.of("position", "0", "money", "1500", "jail", "false",
                "jailTime", "0", "bankrupt", "false", "properties", "[]", "afk", "false");
        snapshot.members().stream().map(Integer::parseInt).forEach(id -> plan.putPlayer(id, initial).playerTtl(id, PLAYER_TTL_SECONDS));
        return commit(gameId, metadata, fingerprint, plan,
                mapper.valueToTree(Map.of("status", "inProgress", "gameId", gameId, "replayed", false,
                        "stateVersion", snapshot.stateVersion() + 1)));
    }

    public TransitionExecution leave(int gameId, int actorId, CommandMetadata metadata) {
        return remove(gameId, actorId, actorId, false, metadata);
    }

    public TransitionExecution kick(int gameId, int actorId, int targetId, CommandMetadata metadata) {
        if (actorId == targetId) throw new IllegalArgumentException("Host must use the leave command for self-removal");
        return remove(gameId, actorId, targetId, true, metadata);
    }

    private TransitionExecution remove(int gameId, int actorId, int targetId, boolean kick, CommandMetadata metadata) {
        metadata.requireExistingGame();
        String type = kick ? "KICK_PLAYER" : "LEAVE_GAME";
        String fingerprint = CommandFingerprint.create(gameId, String.valueOf(actorId), type, metadata,
                String.valueOf(targetId));
        Optional<TransitionExecution> replay = replay(gameId, metadata, fingerprint);
        // Self-leave is the narrow exception to current-membership replay checks:
        // the command itself revokes membership and its result contains no game state.
        if (replay.isPresent() && !kick) return replay.get();
        GameSnapshot snapshot = requireGame(gameId);
        requireMember(snapshot, actorId);
        if (kick) {
            if (snapshot.gameId() != actorId) throw new AccessDeniedException("Host authority required");
            if (replay.isPresent()) return replay.get();
            requireHostMemberLobby(snapshot, actorId);
        }
        if (!snapshot.members().contains(String.valueOf(targetId))) throw new AccessDeniedException("Target player is not a game member");
        List<Integer> previousOrder = "lobby".equalsIgnoreCase(snapshot.game().get("status"))
                ? TurnOrder.lobbyOrder(mapper, snapshot)
                : TurnOrder.parseRequired(mapper, snapshot);
        List<Integer> remainingOrder = previousOrder.stream().filter(id -> id != targetId).toList();
        GameTransitionPlan plan = GameTransitionPlan.transition().removeMember(targetId)
                .putGame(TurnOrder.FIELD, TurnOrder.encode(mapper, remainingOrder));
        if ("inProgress".equalsIgnoreCase(snapshot.game().get("status"))
                && String.valueOf(targetId).equals(snapshot.game().get("playerTurn"))) {
            if (remainingOrder.isEmpty()) {
                throw new GameStateConflictException("Cannot remove the final active player");
            }
            int removedIndex = previousOrder.indexOf(targetId);
            int nextIndex = removedIndex >= remainingOrder.size() ? 0 : removedIndex;
            int nextPlayer = remainingOrder.get(nextIndex);
            plan.putGame("playerTurn", String.valueOf(nextPlayer)).deleteGameField("optionalDeadline");
            Map<String, String> nextState = snapshot.players().get(nextPlayer);
            if (nextState != null && Boolean.parseBoolean(nextState.getOrDefault("jail", "false"))) {
                plan.putGame("optionalAction", json(PendingOptionalAction.jailPayment(
                        gameId, nextPlayer, snapshot.stateVersion() + 1)));
            } else {
                plan.deleteGameField("optionalAction");
            }
        } else if ("inProgress".equalsIgnoreCase(snapshot.game().get("status"))
                && snapshot.game().containsKey("optionalAction")) {
            // Membership changes advance the game version; preserve a valid active-player
            // choice while rebinding it so the old client intent becomes stale.
            PendingOptionalAction pending = pending(snapshot);
            if (!String.valueOf(pending.playerId()).equals(snapshot.game().get("playerTurn"))
                    || pending.playerId() == targetId) {
                throw new GameStateConflictException("Optional action does not match the surviving active player");
            }
            plan.putGame("optionalAction", json(pending.atVersion(snapshot.stateVersion() + 1)));
        }
        if (targetId == gameId && "lobby".equalsIgnoreCase(snapshot.game().get("status"))) {
            plan.deleteGameAndOwnedState(snapshot.members().stream().map(Integer::parseInt).toList()).lifecycleTtl(30);
        }
        return commit(gameId, metadata, fingerprint, plan,
                mapper.valueToTree(Map.of("status", "removed", "gameId", gameId, "playerId", targetId,
                        "replayed", false, "stateVersion", snapshot.stateVersion() + 1)));
    }

    private void requireJoinCapacity(int actorId, GameSnapshot snapshot) {
        if (legacyReads.isPlayerInAnyGame(actorId)) throw new GameStateConflictException("Player is already in another game");
        if (snapshot.members().size() >= TurnOrder.MAX_PLAYERS) throw new GameStateConflictException("Game is full (4 players)");
    }

    private GameSnapshot requireGame(int gameId) {
        GameSnapshot snapshot = store.load(gameId);
        if (snapshot.game().isEmpty()) throw new GameNotFoundException();
        return snapshot;
    }

    private void requireMember(GameSnapshot snapshot, int actorId) {
        if (!snapshot.members().contains(String.valueOf(actorId))) throw new AccessDeniedException("Game membership required");
    }

    private void requireHostMemberLobby(GameSnapshot snapshot, int actorId) {
        requireMember(snapshot, actorId);
        if (snapshot.gameId() != actorId) throw new AccessDeniedException("Host authority required");
        requireLobby(snapshot);
    }

    private void requireLobby(GameSnapshot snapshot) {
        if (!"lobby".equalsIgnoreCase(snapshot.game().get("status"))) throw new GameStateConflictException("Game is not in the lobby phase");
    }

    private TransitionExecution commit(int gameId, CommandMetadata metadata, String fingerprint,
                                       GameTransitionPlan plan, JsonNode result) {
        TransitionExecution execution = store.commit(gameId, metadata, fingerprint, plan, result);
        if (execution.replayed() && execution.semanticResult().isObject()) {
            ((com.fasterxml.jackson.databind.node.ObjectNode) execution.semanticResult()).put("replayed", true);
        }
        return execution;
    }

    private Optional<TransitionExecution> replay(int gameId, CommandMetadata metadata, String fingerprint) {
        Optional<TransitionExecution> replay = store.replayIfPresent(gameId, metadata, fingerprint);
        replay.ifPresent(execution -> {
            if (execution.semanticResult().isObject()) {
                ((com.fasterxml.jackson.databind.node.ObjectNode) execution.semanticResult()).put("replayed", true);
            }
        });
        return replay;
    }

    private InviteMetadata resolveInvite(String inviteCode) {
        Set<String> keys = redis.keys("game:*");
        if (keys != null) for (String key : keys) {
            String suffix = key.substring("game:".length());
            if (!suffix.chars().allMatch(Character::isDigit)) continue;
            Object stored = redis.opsForHash().get(key, "inviteCode");
            if (stored != null && inviteCode.equalsIgnoreCase(stored.toString())) {
                int gameId = Integer.parseInt(suffix);
                GameSnapshot snapshot = requireGame(gameId);
                return new InviteMetadata(gameId, snapshot.stateVersion());
            }
        }
        throw new IllegalArgumentException("Invalid invite code");
    }

    private String inviteCode() {
        StringBuilder code = new StringBuilder(5);
        for (int index = 0; index < 5; index++) code.append(CODE_CHARS.charAt(random.nextInt(CODE_CHARS.length())));
        return code.toString();
    }

    private String json(Object value) {
        try {
            return mapper.writeValueAsString(value);
        } catch (com.fasterxml.jackson.core.JsonProcessingException exception) {
            throw new IllegalStateException("Could not serialize command state", exception);
        }
    }

    private PendingOptionalAction pending(GameSnapshot snapshot) {
        try {
            PendingOptionalAction pending = mapper.readValue(
                    snapshot.game().get("optionalAction"), PendingOptionalAction.class);
            pending.validate();
            if (pending.gameId() != snapshot.gameId() || pending.stateVersion() != snapshot.stateVersion()) {
                throw new GameStateConflictException("Optional action does not match current game state");
            }
            return pending;
        } catch (com.fasterxml.jackson.core.JsonProcessingException | IllegalArgumentException exception) {
            throw new GameStateConflictException("Optional action state is malformed");
        }
    }

    private Map<String, Object> withVersionAndReplay(Map<String, String> source, int gameId, long version, boolean replayed) {
        Map<String, Object> result = new LinkedHashMap<>(source);
        result.put("gameId", gameId);
        result.put("stateVersion", version);
        result.put("replayed", replayed);
        return result;
    }

    public record InviteMetadata(int gameId, long stateVersion) { }
}
