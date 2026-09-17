package com.example.Sindopoly_Java.service.transition;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import com.example.Sindopoly_Java.realtime.GameEventPublisher;
import com.example.Sindopoly_Java.realtime.GameEventReason;
import com.example.Sindopoly_Java.realtime.GameEventType;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Owns versioned terminal transitions and retryable durable finalization. */
@Service
public class GameLifecycleCommandService {
    private static final Logger log = LoggerFactory.getLogger(GameLifecycleCommandService.class);
    private final RedisGameTransitionStore store;
    private final GameCompletionResultService completionResults;
    private final GameFinalizationService finalization;
    private final GameTimingService timing;
    private final ObjectMapper mapper;
    private final GameEventPublisher events;

    @Autowired
    public GameLifecycleCommandService(RedisGameTransitionStore store, GameCompletionResultService completionResults,
                                       GameFinalizationService finalization, GameTimingService timing,
                                       ObjectMapper mapper, GameEventPublisher events) {
        this.store = store;
        this.completionResults = completionResults;
        this.finalization = finalization;
        this.timing = timing;
        this.mapper = mapper;
        this.events = events;
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
        GameCompletionResultService.CalculatedResult calculated = completionResults.calculate(snapshot);
        int winner = calculated.winnerPlayerId();
        TerminalGameResult terminal = terminalResult(snapshot, calculated);
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
        events.publish(snapshot.gameId(), execution.stateVersion(),
                GameEventType.GAME_COMPLETED, GameEventReason.GAME_COMPLETED);
    }

    private boolean terminal(GameSnapshot snapshot) {
        Instant started = requiredInstant(snapshot, "startTime");
        long maxTime = Long.parseLong(snapshot.game().getOrDefault("maxTime", "1200"));
        int maxMoney = Integer.parseInt(snapshot.game().getOrDefault("maxMoney", "5000"));
        return !timing.now().isBefore(started.plusSeconds(maxTime))
                || snapshot.players().values().stream().anyMatch(player -> money(player) >= maxMoney);
    }

    private TerminalGameResult terminalResult(GameSnapshot snapshot,
                                              GameCompletionResultService.CalculatedResult calculated) {
        Instant created = requiredInstant(snapshot, "creationTime");
        Instant started = requiredInstant(snapshot, "startTime");
        Instant completed = timing.now();
        long duration = Math.max(0, Duration.between(started, completed).getSeconds());
        if (duration > Integer.MAX_VALUE) throw new IllegalStateException("Game duration exceeds Stats capacity");
        String identity = "game-finalization:" + snapshot.gameId() + ":" + created;
        String finalizationId = UUID.nameUUIDFromBytes(identity.getBytes(StandardCharsets.UTF_8)).toString();
        List<TerminalGameResult.TerminalPlayerResult> players = calculated.standings().stream()
                .map(player -> new TerminalGameResult.TerminalPlayerResult(
                        player.playerId(), player.cash(), player.propertyValue(), player.totalValue(),
                        player.rank(), player.winner()))
                .toList();
        return new TerminalGameResult(finalizationId, snapshot.gameId(), created.toEpochMilli(),
                completed.toEpochMilli(), (int) duration, calculated.winnerPlayerId(), players);
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

    private int money(Map<String, String> player) {
        if (player == null) throw new IllegalStateException("Terminal player state is missing");
        return Integer.parseInt(player.getOrDefault("money", "0"));
    }

    private String json(Object value) {
        try { return mapper.writeValueAsString(value); }
        catch (JsonProcessingException exception) { throw new IllegalStateException("Could not freeze terminal result", exception); }
    }
}
