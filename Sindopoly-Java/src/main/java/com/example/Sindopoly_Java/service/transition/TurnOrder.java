package com.example.Sindopoly_Java.service.transition;

import com.example.Sindopoly_Java.exception.GameStateConflictException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Canonical ordered player IDs stored in {@code game:{gameId}.turnOrder}. */
final class TurnOrder {

    static final int MAX_PLAYERS = 4;
    static final String FIELD = "turnOrder";

    private TurnOrder() {
    }

    static List<Integer> parseRequired(ObjectMapper mapper, GameSnapshot snapshot) {
        String raw = snapshot.game().get(FIELD);
        if (raw == null) {
            throw unavailable();
        }
        List<Integer> order = parse(mapper, raw);
        Set<Integer> members = new HashSet<>();
        for (String member : snapshot.members()) {
            try {
                int playerId = Integer.parseInt(member);
                if (playerId <= 0) throw new NumberFormatException();
                members.add(playerId);
            } catch (NumberFormatException exception) {
                throw corrupt("Membership contains an invalid player ID");
            }
        }
        if (order.size() != members.size() || !members.equals(new HashSet<>(order))) {
            throw corrupt("Turn order does not match authoritative membership");
        }
        return order;
    }

    static List<Integer> parse(ObjectMapper mapper, String raw) {
        try {
            JsonNode node = mapper.readTree(raw);
            if (!node.isArray() || node.isEmpty() || node.size() > MAX_PLAYERS) {
                throw corrupt("Turn order must be a non-empty bounded JSON array");
            }
            List<Integer> order = new ArrayList<>(node.size());
            Set<Integer> unique = new HashSet<>();
            for (JsonNode entry : node) {
                if (!entry.isIntegralNumber() || !entry.canConvertToInt() || entry.intValue() <= 0
                        || !unique.add(entry.intValue())) {
                    throw corrupt("Turn order contains an invalid or duplicate player ID");
                }
                order.add(entry.intValue());
            }
            return List.copyOf(order);
        } catch (JsonProcessingException exception) {
            throw corrupt("Turn order is malformed JSON");
        }
    }

    static List<Integer> lobbyOrder(ObjectMapper mapper, GameSnapshot snapshot) {
        String raw = snapshot.game().get(FIELD);
        if (raw != null) return parseRequired(mapper, snapshot);
        if ("lobby".equalsIgnoreCase(snapshot.game().get("status"))
                && snapshot.members().size() == 1
                && snapshot.members().contains(String.valueOf(snapshot.gameId()))) {
            return List.of(snapshot.gameId());
        }
        throw unavailable();
    }

    static int next(List<Integer> order, int current) {
        int index = order.indexOf(current);
        if (index < 0) throw corrupt("Active player is absent from turn order");
        return order.get((index + 1) % order.size());
    }

    static String encode(ObjectMapper mapper, List<Integer> order) {
        try {
            return mapper.writeValueAsString(order);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Could not serialize canonical turn order", exception);
        }
    }

    private static GameStateConflictException unavailable() {
        return new GameStateConflictException("TURN_ORDER_UNAVAILABLE: canonical join order cannot be reconstructed");
    }

    private static GameStateConflictException corrupt(String message) {
        return new GameStateConflictException("TURN_ORDER_INVALID: " + message);
    }
}
