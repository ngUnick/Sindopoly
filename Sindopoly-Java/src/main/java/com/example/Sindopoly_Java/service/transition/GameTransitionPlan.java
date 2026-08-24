package com.example.Sindopoly_Java.service.transition;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Bounded server-owned mutation vocabulary. Transport inputs can never provide
 * Redis keys, fields, or operations to this plan.
 */
public final class GameTransitionPlan {

    private final boolean bootstrap;
    private boolean stateChanging = true;
    private boolean deleteGame;
    private final Map<String, String> gamePuts = new LinkedHashMap<>();
    private final Set<String> gameDeletes = new LinkedHashSet<>();
    private final Set<Integer> memberAdds = new LinkedHashSet<>();
    private final Set<Integer> memberRemoves = new LinkedHashSet<>();
    private final Map<Integer, Map<String, String>> playerPuts = new LinkedHashMap<>();
    private final Set<Integer> playerDeletes = new LinkedHashSet<>();
    private List<String> deckReplacement;
    private Long lifecycleTtlSeconds;
    private final Map<Integer, Long> playerTtlSeconds = new LinkedHashMap<>();

    private GameTransitionPlan(boolean bootstrap) {
        this.bootstrap = bootstrap;
    }

    public static GameTransitionPlan bootstrap() {
        return new GameTransitionPlan(true);
    }

    public static GameTransitionPlan transition() {
        return new GameTransitionPlan(false);
    }

    public GameTransitionPlan noOp() {
        this.stateChanging = false;
        return this;
    }

    public GameTransitionPlan putGame(String field, String value) {
        gamePuts.put(field, value);
        return this;
    }

    public GameTransitionPlan putGame(Map<String, String> values) {
        gamePuts.putAll(values);
        return this;
    }

    public GameTransitionPlan deleteGameField(String field) {
        gameDeletes.add(field);
        return this;
    }

    public GameTransitionPlan addMember(int playerId) {
        memberAdds.add(playerId);
        return this;
    }

    public GameTransitionPlan removeMember(int playerId) {
        memberRemoves.add(playerId);
        return this;
    }

    public GameTransitionPlan putPlayer(int playerId, Map<String, String> values) {
        playerPuts.computeIfAbsent(playerId, ignored -> new LinkedHashMap<>()).putAll(values);
        return this;
    }

    public GameTransitionPlan deletePlayer(int playerId) {
        playerDeletes.add(playerId);
        return this;
    }

    public GameTransitionPlan replaceDeck(Collection<String> values) {
        deckReplacement = new ArrayList<>(values);
        return this;
    }

    public GameTransitionPlan deleteGameAndOwnedState(Collection<Integer> playerIds) {
        deleteGame = true;
        playerDeletes.addAll(playerIds);
        return this;
    }

    public GameTransitionPlan lifecycleTtl(long seconds) {
        lifecycleTtlSeconds = seconds;
        return this;
    }

    public GameTransitionPlan playerTtl(int playerId, long seconds) {
        playerTtlSeconds.put(playerId, seconds);
        return this;
    }

    boolean bootstrapFlag() { return bootstrap; }
    boolean stateChanging() { return stateChanging; }
    boolean deleteGame() { return deleteGame; }
    Map<String, String> gamePuts() { return Map.copyOf(gamePuts); }
    Set<String> gameDeletes() { return Set.copyOf(gameDeletes); }
    Set<Integer> memberAdds() { return Set.copyOf(memberAdds); }
    Set<Integer> memberRemoves() { return Set.copyOf(memberRemoves); }
    Map<Integer, Map<String, String>> playerPuts() { return Map.copyOf(playerPuts); }
    Set<Integer> playerDeletes() { return Set.copyOf(playerDeletes); }
    List<String> deckReplacement() { return deckReplacement == null ? null : List.copyOf(deckReplacement); }
    Long lifecycleTtlSeconds() { return lifecycleTtlSeconds; }
    Map<Integer, Long> playerTtlSeconds() { return Map.copyOf(playerTtlSeconds); }

    void validate() {
        if (!stateChanging && (deleteGame || !gamePuts.isEmpty() || !gameDeletes.isEmpty()
                || !memberAdds.isEmpty() || !memberRemoves.isEmpty() || !playerPuts.isEmpty()
                || !playerDeletes.isEmpty() || deckReplacement != null || lifecycleTtlSeconds != null
                || !playerTtlSeconds.isEmpty())) {
            throw new IllegalArgumentException("A no-op transition cannot contain state or TTL mutations");
        }
    }
}
