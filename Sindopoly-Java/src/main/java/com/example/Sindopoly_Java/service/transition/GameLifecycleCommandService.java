package com.example.Sindopoly_Java.service.transition;

import com.example.Sindopoly_Java.model.Square;
import com.example.Sindopoly_Java.repository.SquareRepository;
import com.example.Sindopoly_Java.service.GameStateService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Versioned scheduler completion foundation; timer race policy remains REVAMP-020. */
@Service
public class GameLifecycleCommandService {

    private final RedisGameTransitionStore store;
    private final SquareRepository squares;
    private final GameStateService stats;
    private final ObjectMapper mapper;
    private final SimpMessagingTemplate broker;

    public GameLifecycleCommandService(RedisGameTransitionStore store, SquareRepository squares,
                                       GameStateService stats, ObjectMapper mapper, SimpMessagingTemplate broker) {
        this.store = store;
        this.squares = squares;
        this.stats = stats;
        this.mapper = mapper;
        this.broker = broker;
    }

    public boolean completeIfTerminal(int gameId) {
        GameSnapshot snapshot = store.load(gameId);
        if (!"inProgress".equalsIgnoreCase(snapshot.game().get("status")) || !terminal(snapshot)) return false;
        long version = snapshot.stateVersion();
        String commandId = UUID.nameUUIDFromBytes(
                ("scheduler:end:" + gameId + ":" + version).getBytes(StandardCharsets.UTF_8)).toString();
        CommandMetadata metadata = new CommandMetadata(commandId, version);
        String winner = winner(snapshot);
        GameTransitionPlan plan = GameTransitionPlan.transition().putGame(Map.of("status", "ended", "winner", winner))
                .lifecycleTtl(30);
        snapshot.members().stream().map(Integer::parseInt).forEach(id -> plan.playerTtl(id, 30));
        var result = mapper.valueToTree(Map.of("event", "gameEnded", "gameId", gameId,
                "winner", winner, "stateVersion", version + 1));
        TransitionExecution execution = store.commit(gameId, metadata,
                CommandFingerprint.create(gameId, "SYSTEM", "COMPLETE_GAME", metadata, winner), plan, result);
        if (!execution.shouldPublish()) return false;

        // Redis is authoritative. MariaDB aggregation is intentionally post-commit, not falsely atomic.
        finalizeStats(snapshot, winner);
        broker.convertAndSend("/topic/game/" + gameId, Map.of("event", "gameEnded", "gameId", gameId,
                "winner", winner, "stateVersion", execution.stateVersion()));
        return true;
    }

    private boolean terminal(GameSnapshot snapshot) {
        int timer = Integer.parseInt(snapshot.game().getOrDefault("timer", "0"));
        int maxTime = Integer.parseInt(snapshot.game().getOrDefault("maxTime", "1200"));
        int maxMoney = Integer.parseInt(snapshot.game().getOrDefault("maxMoney", "5000"));
        return timer >= maxTime || snapshot.players().values().stream()
                .anyMatch(player -> Integer.parseInt(player.getOrDefault("money", "0")) >= maxMoney);
    }

    private String winner(GameSnapshot snapshot) {
        List<Integer> order = TurnOrder.parseRequired(mapper, snapshot);
        return snapshot.members().stream().map(Integer::parseInt)
                .max(Comparator.comparingInt((Integer id) -> assetValue(snapshot.players().get(id)))
                        .thenComparingInt(id -> money(snapshot.players().get(id)))
                        .thenComparingInt(id -> -order.indexOf(id)))
                .map(String::valueOf).orElseThrow(() -> new IllegalStateException("Cannot complete a game without players"));
    }

    private int assetValue(Map<String, String> player) {
        int total = money(player);
        for (Integer id : properties(player)) {
            Integer price = squares.findById(id).map(Square::getPrice).orElse(0);
            total += price == null ? 0 : price;
        }
        return total;
    }

    private int money(Map<String, String> player) {
        return Integer.parseInt(player.getOrDefault("money", "0"));
    }

    private List<Integer> properties(Map<String, String> player) {
        try { return mapper.readValue(player.getOrDefault("properties", "[]"), new TypeReference<>() {}); }
        catch (JsonProcessingException exception) { throw new IllegalStateException("Malformed properties JSON", exception); }
    }

    private void finalizeStats(GameSnapshot snapshot, String winner) {
        Instant started = Instant.parse(snapshot.game().getOrDefault("startTime", Instant.now().toString()));
        int seconds = (int) Duration.between(started, Instant.now()).getSeconds();
        for (String member : snapshot.members()) {
            int id = Integer.parseInt(member);
            stats.finalizePlayerStats(id, member.equals(winner), money(snapshot.players().get(id)), seconds);
        }
    }
}
