package com.example.Sindopoly_Java.realtime;

import com.example.Sindopoly_Java.exception.GameNotFoundException;
import com.example.Sindopoly_Java.model.Player;
import com.example.Sindopoly_Java.repository.PlayerRepository;
import com.example.Sindopoly_Java.service.transition.GameSnapshot;
import com.example.Sindopoly_Java.service.transition.RedisGameTransitionStore;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

@Service
public class GameRealtimeSnapshotService {
    private final RedisGameTransitionStore store;
    private final PlayerRepository players;
    private final ObjectMapper mapper;

    public GameRealtimeSnapshotService(RedisGameTransitionStore store, PlayerRepository players, ObjectMapper mapper) {
        this.store = store;
        this.players = players;
        this.mapper = mapper;
    }

    public GameRealtimeSnapshot load(int gameId) {
        GameSnapshot snapshot = store.loadStable(gameId);
        if (snapshot.game().isEmpty()) throw new GameNotFoundException();
        Map<Integer, String> names = new java.util.HashMap<>();
        players.findAllById(snapshot.players().keySet()).forEach(player -> names.put(player.getId(), player.getName()));
        List<GamePlayerSnapshot> playerSnapshots = orderedPlayerIds(snapshot).stream()
                .map(id -> player(id, names.getOrDefault(id, "Unknown"), snapshot.players().get(id)))
                .toList();
        Map<String, String> game = snapshot.game();
        return new GameRealtimeSnapshot(gameId, snapshot.stateVersion(), game.get("status"),
                nullableInteger(game.get("playerTurn")), nullableInteger(game.get("winner")),
                game.get("visibility"), game.get("inviteCode"), optionalAction(game.get("optionalAction")),
                playerSnapshots);
    }

    private List<Integer> orderedPlayerIds(GameSnapshot snapshot) {
        try {
            List<Integer> order = new ArrayList<>(mapper.readValue(
                    snapshot.game().getOrDefault("turnOrder", "[]"), new TypeReference<List<Integer>>() { }));
            snapshot.players().keySet().stream().sorted().filter(id -> !order.contains(id)).forEach(order::add);
            return order;
        } catch (Exception exception) {
            throw new IllegalStateException("Stored turn order is malformed", exception);
        }
    }

    private GamePlayerSnapshot player(int id, String nickname, Map<String, String> state) {
        return new GamePlayerSnapshot(id, nickname, integer(state, "position"), integer(state, "money"),
                properties(state.get("properties")), Boolean.parseBoolean(state.getOrDefault("jail", "false")),
                integer(state, "jailTime"), Boolean.parseBoolean(state.getOrDefault("bankrupt", "false")),
                Boolean.parseBoolean(state.getOrDefault("afk", "false")));
    }

    private List<Integer> properties(String raw) {
        if (raw == null) return List.of();
        try {
            return List.copyOf(mapper.readValue(raw, new TypeReference<List<Integer>>() { }));
        } catch (Exception exception) {
            throw new IllegalStateException("Stored player properties are malformed", exception);
        }
    }

    private JsonNode optionalAction(String raw) {
        if (raw == null) return null;
        try {
            return mapper.readTree(raw);
        } catch (Exception exception) {
            throw new IllegalStateException("Stored optional action is malformed", exception);
        }
    }

    private int integer(Map<String, String> state, String key) {
        return Integer.parseInt(state.getOrDefault(key, "0"));
    }

    private Integer nullableInteger(String raw) {
        if (raw == null || "null".equalsIgnoreCase(raw)) return null;
        return Integer.valueOf(raw);
    }
}
