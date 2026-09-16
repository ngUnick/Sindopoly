package com.example.Sindopoly_Java.realtime;

import com.example.Sindopoly_Java.model.Player;
import com.example.Sindopoly_Java.repository.PlayerRepository;
import com.example.Sindopoly_Java.service.transition.GameSnapshot;
import com.example.Sindopoly_Java.service.transition.RedisGameTransitionStore;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class GameRealtimeSnapshotServiceTest {
    private static final long DEADLINE = 1_789_661_234_567L;
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void projectsDeadlineFromSameStableStateAsVersionAndActiveTurn() {
        Fixture fixture = fixture(snapshot("inProgress", 12, Map.of(
                "playerTurn", "9", "turnDeadlineEpochMs", String.valueOf(DEADLINE),
                "turnOrder", "[9,4]")));

        GameRealtimeSnapshot projected = fixture.service().load(7);

        assertEquals(12, projected.stateVersion());
        assertEquals(9, projected.playerTurn());
        assertEquals(DEADLINE, projected.turnDeadlineEpochMs());
        assertEquals(List.of(9, 4), projected.players().stream().map(GamePlayerSnapshot::playerId).toList());
        assertEquals(List.of(1, 3), projected.players().get(0).properties());
        verify(fixture.store(), times(1)).loadStable(7);
    }

    @Test
    void lobbyAndRetainedTerminalSnapshotsExposeNoDeadlineWhenFieldIsAbsent() {
        Fixture fixture = fixture(
                snapshot("lobby", 1, Map.of("turnOrder", "[9,4]")),
                snapshot("ended", 21, Map.of(
                        "playerTurn", "4", "winner", "9", "turnOrder", "[9,4]")));

        assertNull(fixture.service().load(7).turnDeadlineEpochMs());
        assertNull(fixture.service().load(7).turnDeadlineEpochMs());
    }

    @Test
    void missingAndLegacyNullDeadlineAreHandledAsNoAuthoritativeDeadline() {
        Fixture fixture = fixture(
                snapshot("inProgress", 4, Map.of("playerTurn", "9", "turnOrder", "[9,4]")),
                snapshot("inProgress", 5, Map.of(
                        "playerTurn", "9", "turnDeadlineEpochMs", "null", "turnOrder", "[9,4]")));

        assertNull(fixture.service().load(7).turnDeadlineEpochMs());
        assertNull(fixture.service().load(7).turnDeadlineEpochMs());
    }

    @Test
    void malformedStoredDeadlineFailsInsteadOfInventingAClientDeadline() {
        Fixture fixture = fixture(snapshot("inProgress", 12, Map.of(
                "playerTurn", "9", "turnDeadlineEpochMs", "tomorrow", "turnOrder", "[9,4]")));

        assertThrows(NumberFormatException.class, () -> fixture.service().load(7));
    }

    @Test
    void newerTurnSnapshotProjectsItsRenewedDeadline() {
        Fixture fixture = fixture(
                snapshot("inProgress", 12, Map.of(
                        "playerTurn", "9", "turnDeadlineEpochMs", String.valueOf(DEADLINE),
                        "turnOrder", "[9,4]")),
                snapshot("inProgress", 13, Map.of(
                        "playerTurn", "4", "turnDeadlineEpochMs", String.valueOf(DEADLINE + 60_000),
                        "turnOrder", "[9,4]")));

        GameRealtimeSnapshot before = fixture.service().load(7);
        GameRealtimeSnapshot after = fixture.service().load(7);

        assertEquals(9, before.playerTurn());
        assertEquals(DEADLINE, before.turnDeadlineEpochMs());
        assertEquals(4, after.playerTurn());
        assertEquals(13, after.stateVersion());
        assertEquals(DEADLINE + 60_000, after.turnDeadlineEpochMs());
    }

    @Test
    void optionalPurchaseAndJailStatesProjectTheirCurrentDeadline() {
        String purchase = "{\"type\":\"PURCHASE_PROPERTY\",\"gameId\":7,\"playerId\":9,"
                + "\"stateVersion\":12,\"squareId\":6,\"cost\":100,\"declinable\":true}";
        String jail = "{\"type\":\"PAY_JAIL_EXIT\",\"gameId\":7,\"playerId\":9,"
                + "\"stateVersion\":13,\"squareId\":null,\"cost\":50,\"declinable\":true}";
        Fixture fixture = fixture(
                snapshot("inProgress", 12, Map.of(
                        "playerTurn", "9", "turnDeadlineEpochMs", String.valueOf(DEADLINE),
                        "optionalAction", purchase, "turnOrder", "[9,4]")),
                snapshot("inProgress", 13, Map.of(
                        "playerTurn", "9", "turnDeadlineEpochMs", String.valueOf(DEADLINE + 60_000),
                        "optionalAction", jail, "turnOrder", "[9,4]")));

        GameRealtimeSnapshot purchaseSnapshot = fixture.service().load(7);
        GameRealtimeSnapshot jailSnapshot = fixture.service().load(7);

        assertEquals("PURCHASE_PROPERTY", purchaseSnapshot.optionalAction().get("type").asText());
        assertEquals(DEADLINE, purchaseSnapshot.turnDeadlineEpochMs());
        assertEquals("PAY_JAIL_EXIT", jailSnapshot.optionalAction().get("type").asText());
        assertEquals(DEADLINE + 60_000, jailSnapshot.turnDeadlineEpochMs());
    }

    @Test
    void serializesExactDeadlineFieldNameForValueAndNull() throws Exception {
        Fixture fixture = fixture(
                snapshot("inProgress", 12, Map.of(
                        "playerTurn", "9", "turnDeadlineEpochMs", String.valueOf(DEADLINE),
                        "turnOrder", "[9,4]")),
                snapshot("lobby", 1, Map.of("turnOrder", "[9,4]")));

        JsonNode activeJson = mapper.readTree(mapper.writeValueAsString(fixture.service().load(7)));
        JsonNode lobbyJson = mapper.readTree(mapper.writeValueAsString(fixture.service().load(7)));

        assertTrue(activeJson.has("turnDeadlineEpochMs"));
        assertEquals(DEADLINE, activeJson.get("turnDeadlineEpochMs").asLong());
        assertTrue(lobbyJson.has("turnDeadlineEpochMs"));
        assertTrue(lobbyJson.get("turnDeadlineEpochMs").isNull());
        assertEquals(1, activeJson.properties().stream()
                .filter(entry -> entry.getKey().equals("turnDeadlineEpochMs")).count());
    }

    private Fixture fixture(GameSnapshot first, GameSnapshot... remaining) {
        RedisGameTransitionStore store = mock(RedisGameTransitionStore.class);
        PlayerRepository repository = mock(PlayerRepository.class);
        Player firstPlayer = player(9, "First");
        Player secondPlayer = player(4, "Second");
        when(repository.findAllById(Set.of(4, 9))).thenReturn(List.of(secondPlayer, firstPlayer));
        when(store.loadStable(7)).thenReturn(first, remaining);
        return new Fixture(store, new GameRealtimeSnapshotService(store, repository, mapper));
    }

    private GameSnapshot snapshot(String status, long version, Map<String, String> additions) {
        Map<String, String> game = new LinkedHashMap<>();
        game.put("stateVersion", String.valueOf(version));
        game.put("status", status);
        game.putAll(additions);
        return new GameSnapshot(7, Map.copyOf(game), Set.of("4", "9"),
                Map.of(4, Map.of("position", "2", "money", "1400", "properties", "[]"),
                        9, Map.of("position", "8", "money", "1600", "properties", "[1,3]")),
                List.of());
    }

    private Player player(int id, String name) {
        Player player = new Player();
        player.setId(id);
        player.setName(name);
        return player;
    }

    private record Fixture(RedisGameTransitionStore store, GameRealtimeSnapshotService service) { }
}
