package com.example.Sindopoly_Java.service.transition;

import com.example.Sindopoly_Java.model.Square;
import com.example.Sindopoly_Java.model.dto.ThrowResultDto;
import com.example.Sindopoly_Java.repository.CardRepository;
import com.example.Sindopoly_Java.repository.SquareRepository;
import com.example.Sindopoly_Java.service.core.DiceService;
import com.example.Sindopoly_Java.realtime.GameEventPublisher;
import com.example.Sindopoly_Java.realtime.GameEventPayload;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TurnCommandServiceTest {
    @Mock RedisGameTransitionStore store;
    @Mock DiceService dice;
    @Mock SquareRepository squares;
    @Mock CardRepository cards;
    @Mock GameEventPublisher events;
    @Mock Square square;
    private final ObjectMapper mapper = new ObjectMapper();
    private TurnCommandService service;
    private CommandMetadata metadata;

    @BeforeEach
    void setUp() {
        service = new TurnCommandService(store, dice, squares, cards, mapper, events,
                new GameTimingService(java.time.Clock.systemUTC(), new GameLifecycleProperties()));
        metadata = new CommandMetadata("00000000-0000-0000-0000-000000000001", 0);
    }

    @Test
    void publishesVersionedNotificationOnlyAfterAppliedRedisCommit() {
        when(store.replayIfPresent(anyInt(), any(), anyString())).thenReturn(Optional.empty());
        when(store.load(1)).thenReturn(snapshot());
        when(dice.roll()).thenReturn(1);
        when(squares.findById(1)).thenReturn(Optional.of(square));
        when(square.getType()).thenReturn(Square.SquareType.START);
        when(store.commit(anyInt(), any(), anyString(), any(), any(JsonNode.class))).thenAnswer(invocation ->
                new TransitionExecution(TransitionExecution.Status.APPLIED, 1, invocation.getArgument(4)));

        ThrowResultDto result = service.throwDice(1, 1, metadata);

        assertThat(result.stateVersion()).isEqualTo(1);
        InOrder order = inOrder(store, events);
        order.verify(store).commit(anyInt(), any(), anyString(), any(), any(JsonNode.class));
        order.verify(events).publish(anyInt(), org.mockito.ArgumentMatchers.anyLong(), any(),
                any(GameEventPayload.class));
    }

    @Test
    void sequentialReplayReturnsRecordedRollWithoutRollingOrPublishing() {
        ThrowResultDto recorded = new ThrowResultDto(6, 6, false, 4, -1, 1, false);
        when(store.load(1)).thenReturn(snapshot());
        when(store.replayIfPresent(anyInt(), any(), anyString())).thenReturn(Optional.of(
                new TransitionExecution(TransitionExecution.Status.REPLAY, 1, mapper.valueToTree(recorded))));

        ThrowResultDto result = service.throwDice(1, 1, metadata);

        assertThat(result.dice()).isEqualTo(6);
        assertThat(result.replayed()).isTrue();
        verify(dice, never()).roll();
        verify(store).load(1);
        verify(events, never()).publish(anyInt(), org.mockito.ArgumentMatchers.anyLong(), any(),
                any(GameEventPayload.class));
    }

    @Test
    void replayDoesNotBypassCurrentMembershipAuthorization() {
        when(store.load(1)).thenReturn(new GameSnapshot(1,
                Map.of("status", "inProgress", "playerTurn", "1", "stateVersion", "2"),
                Set.of(), Map.of(), List.of()));

        assertThatThrownBy(() -> service.throwDice(1, 1, metadata))
                .isInstanceOf(AccessDeniedException.class);
        verify(store, never()).replayIfPresent(anyInt(), any(), anyString());
        verify(dice, never()).roll();
        verify(events, never()).publish(anyInt(), org.mockito.ArgumentMatchers.anyLong(), any(),
                any(GameEventPayload.class));
    }

    private GameSnapshot snapshot() {
        return new GameSnapshot(1,
                Map.of("status", "inProgress", "playerTurn", "1", "stateVersion", "0", "turnOrder", "[1]"),
                Set.of("1"),
                Map.of(1, Map.of("position", "0", "money", "1500", "jail", "false", "jailTime", "0",
                        "bankrupt", "false", "properties", "[]", "afk", "false")),
                List.of());
    }
}
