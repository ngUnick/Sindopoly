package com.example.Sindopoly_Java.realtime;

import com.example.Sindopoly_Java.model.Player;
import com.example.Sindopoly_Java.repository.PlayerRepository;
import com.example.Sindopoly_Java.service.transition.GameSnapshot;
import com.example.Sindopoly_Java.service.transition.RedisGameTransitionStore;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class GameRealtimeSnapshotServiceTest {
    @Test
    void projectsBoundedStateInFrozenTurnOrderWithoutInternalFields() {
        RedisGameTransitionStore store = mock(RedisGameTransitionStore.class);
        PlayerRepository repository = mock(PlayerRepository.class);
        Player first = player(9, "First");
        Player second = player(4, "Second");
        when(repository.findAllById(Set.of(4, 9))).thenReturn(List.of(second, first));
        when(store.loadStable(7)).thenReturn(new GameSnapshot(7,
                Map.of("stateVersion", "12", "status", "inProgress", "playerTurn", "9",
                        "turnOrder", "[9,4]", "terminalResult", "secret"), Set.of("4", "9"),
                Map.of(4, Map.of("position", "2", "money", "1400", "properties", "[]"),
                        9, Map.of("position", "8", "money", "1600", "properties", "[1,3]")), List.of()));

        GameRealtimeSnapshot snapshot = new GameRealtimeSnapshotService(store, repository, new ObjectMapper()).load(7);

        assertEquals(12, snapshot.stateVersion());
        assertEquals(List.of(9, 4), snapshot.players().stream().map(GamePlayerSnapshot::playerId).toList());
        assertEquals(List.of(1, 3), snapshot.players().get(0).properties());
        assertNull(snapshot.optionalAction());
    }

    private Player player(int id, String name) {
        Player player = new Player();
        player.setId(id);
        player.setName(name);
        return player;
    }
}
