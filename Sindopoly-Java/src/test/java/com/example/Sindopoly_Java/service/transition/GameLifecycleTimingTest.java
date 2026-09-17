package com.example.Sindopoly_Java.service.transition;

import com.example.Sindopoly_Java.repository.CardRepository;
import com.example.Sindopoly_Java.repository.SquareRepository;
import com.example.Sindopoly_Java.service.core.DiceService;
import com.example.Sindopoly_Java.realtime.GameEventPublisher;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class GameLifecycleTimingTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void deadlineNotReachedProducesNoTimeoutCommand() {
        RedisGameTransitionStore store = mock(RedisGameTransitionStore.class);
        Instant now = Instant.parse("2026-08-25T10:00:00Z");
        GameTimingService timing = timing(now);
        when(store.load(41)).thenReturn(snapshot("inProgress", 0,
                Map.of("turnDeadlineEpochMs", String.valueOf(now.plusSeconds(1).toEpochMilli()))));
        TurnCommandService service = new TurnCommandService(store, mock(DiceService.class),
                mock(SquareRepository.class), mock(CardRepository.class), mapper,
                mock(GameEventPublisher.class), timing);

        assertThat(service.dueTimeout(41)).isEmpty();
        verify(store, never()).commit(anyInt(), any(), any(), any(), any());
    }

    @Test
    void elapsedLimitIsNotTerminalBeforeBoundaryAndCompletesAtBoundary() {
        RedisGameTransitionStore store = mock(RedisGameTransitionStore.class);
        GameFinalizationService finalization = mock(GameFinalizationService.class);
        GameCompletionResultService completionResults = mock(GameCompletionResultService.class);
        GameEventPublisher events = mock(GameEventPublisher.class);
        Instant start = Instant.parse("2026-08-25T10:00:00Z");
        GameSnapshot snapshot = snapshot("inProgress", 0, Map.of(
                "creationTime", "2026-08-25T09:59:00Z", "startTime", start.toString(),
                "maxTime", "60", "maxMoney", "5000", "turnDeadlineEpochMs", "1"));
        when(store.load(41)).thenReturn(snapshot);
        when(completionResults.calculate(snapshot)).thenReturn(new GameCompletionResultService.CalculatedResult(
                41, List.of(
                new GameCompletionResultService.CalculatedStanding(41, 100, 0, 100, 1, true),
                new GameCompletionResultService.CalculatedStanding(42, 100, 0, 100, 1, false))));

        GameLifecycleCommandService before = new GameLifecycleCommandService(store, completionResults, finalization,
                timing(start.plusSeconds(59)), mapper, events);
        assertThat(before.processScheduledGame(41)).isFalse();
        verify(store, never()).commit(anyInt(), any(), any(), any(), any());

        when(store.commit(anyInt(), any(), any(), any(), any())).thenReturn(new TransitionExecution(
                TransitionExecution.Status.APPLIED, 1, mapper.createObjectNode()));
        GameLifecycleCommandService boundary = new GameLifecycleCommandService(store, completionResults, finalization,
                timing(start.plusSeconds(60)), mapper, events);
        assertThat(boundary.processScheduledGame(41)).isTrue();
        ArgumentCaptor<GameTransitionPlan> plan = ArgumentCaptor.forClass(GameTransitionPlan.class);
        verify(store).commit(anyInt(), any(), any(), plan.capture(), any());
        assertThat(plan.getValue().gamePuts()).containsEntry("status", "ended").containsKey("terminalResult");
        assertThat(plan.getValue().gameDeletes()).contains("turnDeadlineEpochMs");
        assertThat(plan.getValue().playerTtlSeconds()).isEmpty();
    }

    private GameTimingService timing(Instant instant) {
        GameLifecycleProperties properties = new GameLifecycleProperties();
        properties.setTurnTimeoutSeconds(60);
        properties.setTerminalRetentionSeconds(300);
        return new GameTimingService(Clock.fixed(instant, ZoneOffset.UTC), properties);
    }

    private GameSnapshot snapshot(String status, long version, Map<String, String> additions) {
        Map<String, String> game = new java.util.LinkedHashMap<>(Map.of(
                "status", status, "stateVersion", String.valueOf(version), "playerTurn", "41",
                "turnOrder", "[41,42]"));
        game.putAll(additions);
        Map<String, String> player = Map.of("money", "100", "properties", "[]", "jail", "false", "jailTime", "0");
        return new GameSnapshot(41, Map.copyOf(game), Set.of("41", "42"),
                Map.of(41, player, 42, player), List.of());
    }
}
