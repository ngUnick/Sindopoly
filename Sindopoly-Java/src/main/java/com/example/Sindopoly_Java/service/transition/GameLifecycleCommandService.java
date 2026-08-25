package com.example.Sindopoly_Java.service.transition;

import com.example.Sindopoly_Java.model.Square;
import com.example.Sindopoly_Java.repository.SquareRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Owns versioned terminal transitions and retryable durable finalization. */
@Service
public class GameLifecycleCommandService {
    private static final Logger log = LoggerFactory.getLogger(GameLifecycleCommandService.class);
    private final RedisGameTransitionStore store;
    private final SquareRepository squares;
    private final GameFinalizationService finalization;
    private final GameTimingService timing;
    private final ObjectMapper mapper;
    private final SimpMessagingTemplate broker;

    public GameLifecycleCommandService(RedisGameTransitionStore store, SquareRepository squares,
                                       GameFinalizationService finalization, GameTimingService timing,
                                       ObjectMapper mapper, SimpMessagingTemplate broker) {
        this.store = store;
        this.squares = squares;
        this.finalization = finalization;
        this.timing = timing;
        this.mapper = mapper;
        this.broker = broker;
    }

    /** Returns true when this game was terminal, completed now, or needed a finalization retry. */
    public boolean processScheduledGame(int gameId) {
        GameSnapshot snapshot = store.load(gameId);
        if ("ended".equalsIgnoreCase(snapshot.game().get("status"))) {
            String frozen = snapshot.game().get("terminalResult");
            if (frozen != null) finalizeDurably(readTerminalResult(frozen));
            return true;
        }
        if (!"inProgress".equalsIgnoreCase(snapshot.game().get("status")) || !terminal(snapshot)) return false;
        complete(snapshot);
        return true;
    }

    public boolean completeIfTerminal(int gameId) { return processScheduledGame(gameId); }

    private void complete(GameSnapshot snapshot) {
        long version = snapshot.stateVersion();
        int winner = winner(snapshot);
        TerminalGameResult terminal = terminalResult(snapshot, winner);
        String commandId = UUID.nameUUIDFromBytes(
                ("scheduler:end:" + snapshot.gameId() + ":" + version).getBytes(StandardCharsets.UTF_8)).toString();
        CommandMetadata metadata = new CommandMetadata(commandId, version);
        GameTransitionPlan plan = GameTransitionPlan.transition()
                .putGame(Map.of("status", "ended", "winner", String.valueOf(winner),
                        "terminalResult", json(terminal)))
                .deleteGameField("turnDeadlineEpochMs")
                .deleteGameField("optionalAction")
                .deleteGameField("optionalDeadline")
                .lifecycleTtl(timing.terminalRetentionSeconds());
        var result = mapper.valueToTree(Map.of("event", "gameEnded", "gameId", snapshot.gameId(),
                "winner", String.valueOf(winner), "stateVersion", version + 1));
        TransitionExecution execution = store.commit(snapshot.gameId(), metadata,
                CommandFingerprint.create(snapshot.gameId(), "SYSTEM", "COMPLETE_GAME", metadata,
                        terminal.finalizationId()), plan, result);
        if (!execution.shouldPublish()) return;
        // Redis completion is authoritative; a failed DB transaction is retried from terminalResult.
        try {
            finalizeDurably(terminal);
        } catch (RuntimeException exception) {
            log.error("Stats finalization pending for game {} and finalization {}",
                    snapshot.gameId(), terminal.finalizationId(), exception);
        }
        broker.convertAndSend("/topic/game/" + snapshot.gameId(), Map.of("event", "gameEnded",
                "gameId", snapshot.gameId(), "winner", String.valueOf(winner),
                "stateVersion", execution.stateVersion()));
    }

    private boolean terminal(GameSnapshot snapshot) {
        Instant started = requiredInstant(snapshot, "startTime");
        long maxTime = Long.parseLong(snapshot.game().getOrDefault("maxTime", "1200"));
        int maxMoney = Integer.parseInt(snapshot.game().getOrDefault("maxMoney", "5000"));
        return !timing.now().isBefore(started.plusSeconds(maxTime))
                || snapshot.players().values().stream().anyMatch(player -> money(player) >= maxMoney);
    }

    private int winner(GameSnapshot snapshot) {
        List<Integer> order = TurnOrder.parseRequired(mapper, snapshot);
        return snapshot.members().stream().map(Integer::parseInt)
                .max(Comparator.comparingInt((Integer id) -> assetValue(snapshot.players().get(id)))
                        .thenComparingInt(id -> money(snapshot.players().get(id)))
                        .thenComparingInt(id -> -order.indexOf(id)))
                .orElseThrow(() -> new IllegalStateException("Cannot complete a game without players"));
    }

    private TerminalGameResult terminalResult(GameSnapshot snapshot, int winner) {
        Instant created = requiredInstant(snapshot, "creationTime");
        Instant started = requiredInstant(snapshot, "startTime");
        Instant completed = timing.now();
        long duration = Math.max(0, Duration.between(started, completed).getSeconds());
        if (duration > Integer.MAX_VALUE) throw new IllegalStateException("Game duration exceeds Stats capacity");
        String identity = "game-finalization:" + snapshot.gameId() + ":" + created;
        String finalizationId = UUID.nameUUIDFromBytes(identity.getBytes(StandardCharsets.UTF_8)).toString();
        List<TerminalGameResult.TerminalPlayerResult> players = TurnOrder.parseRequired(mapper, snapshot).stream()
                .filter(id -> snapshot.members().contains(String.valueOf(id)))
                .map(id -> new TerminalGameResult.TerminalPlayerResult(
                        id, money(snapshot.players().get(id)), id == winner))
                .toList();
        return new TerminalGameResult(finalizationId, snapshot.gameId(), created.toEpochMilli(),
                completed.toEpochMilli(), (int) duration, winner, players);
    }

    private void finalizeDurably(TerminalGameResult result) { finalization.finalizeGame(result); }

    private TerminalGameResult readTerminalResult(String json) {
        try { return mapper.readValue(json, TerminalGameResult.class); }
        catch (JsonProcessingException exception) {
            throw new IllegalStateException("Stored terminal result is malformed", exception);
        }
    }

    private Instant requiredInstant(GameSnapshot snapshot, String field) {
        String value = snapshot.game().get(field);
        if (value == null) throw new IllegalStateException("Game " + field + " is missing");
        try { return Instant.parse(value); }
        catch (RuntimeException exception) {
            throw new IllegalStateException("Game " + field + " is malformed", exception);
        }
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
        if (player == null) throw new IllegalStateException("Terminal player state is missing");
        return Integer.parseInt(player.getOrDefault("money", "0"));
    }

    private List<Integer> properties(Map<String, String> player) {
        try { return mapper.readValue(player.getOrDefault("properties", "[]"), new TypeReference<>() { }); }
        catch (JsonProcessingException exception) { throw new IllegalStateException("Malformed properties JSON", exception); }
    }

    private String json(Object value) {
        try { return mapper.writeValueAsString(value); }
        catch (JsonProcessingException exception) { throw new IllegalStateException("Could not freeze terminal result", exception); }
    }
}
