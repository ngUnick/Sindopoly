package com.example.Sindopoly_Java.service.transition;

import com.example.Sindopoly_Java.exception.GameStateConflictException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TurnOrderTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void preservesNonNumericJoinOrderAndWrapsRotation() {
        GameSnapshot snapshot = snapshot("[41,7,103]", Set.of("41", "7", "103"), "inProgress");

        List<Integer> order = TurnOrder.parseRequired(mapper, snapshot);

        assertThat(order).containsExactly(41, 7, 103);
        assertThat(TurnOrder.next(order, 41)).isEqualTo(7);
        assertThat(TurnOrder.next(order, 7)).isEqualTo(103);
        assertThat(TurnOrder.next(order, 103)).isEqualTo(41);
    }

    @Test
    void rejectsDuplicateMalformedAndMembershipMismatchedOrder() {
        assertThatThrownBy(() -> TurnOrder.parseRequired(mapper,
                snapshot("[41,7,7]", Set.of("41", "7"), "lobby")))
                .isInstanceOf(GameStateConflictException.class);
        assertThatThrownBy(() -> TurnOrder.parseRequired(mapper,
                snapshot("not-json", Set.of("41"), "lobby")))
                .isInstanceOf(GameStateConflictException.class);
        assertThatThrownBy(() -> TurnOrder.parseRequired(mapper,
                snapshot("[41,7]", Set.of("41", "103"), "lobby")))
                .isInstanceOf(GameStateConflictException.class);
    }

    @Test
    void permitsOnlyUnambiguousSingleHostLegacyLobbyFallback() {
        GameSnapshot lobby = snapshot(null, Set.of("41"), "lobby");

        assertThat(TurnOrder.lobbyOrder(mapper, lobby)).containsExactly(41);
        assertThatThrownBy(() -> TurnOrder.lobbyOrder(mapper,
                snapshot(null, Set.of("41", "7"), "lobby")))
                .isInstanceOf(GameStateConflictException.class)
                .hasMessageContaining("TURN_ORDER_UNAVAILABLE");
        assertThatThrownBy(() -> TurnOrder.lobbyOrder(mapper,
                snapshot(null, Set.of("41"), "inProgress")))
                .isInstanceOf(GameStateConflictException.class)
                .hasMessageContaining("TURN_ORDER_UNAVAILABLE");
    }

    private GameSnapshot snapshot(String order, Set<String> members, String status) {
        Map<String, String> game = new java.util.LinkedHashMap<>();
        game.put("status", status);
        if (order != null) game.put(TurnOrder.FIELD, order);
        return new GameSnapshot(41, Map.copyOf(game), members, Map.of(), List.of());
    }
}
