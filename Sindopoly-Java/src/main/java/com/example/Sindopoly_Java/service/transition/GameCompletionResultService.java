package com.example.Sindopoly_Java.service.transition;

import com.example.Sindopoly_Java.model.dto.BoardSquareMetadataDto;
import com.example.Sindopoly_Java.realtime.GameCompletionResult;
import com.example.Sindopoly_Java.realtime.GameCompletionStanding;
import com.example.Sindopoly_Java.service.BoardMetadataService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Calculates terminal value and ordering from authoritative player state and canonical board metadata. */
@Service
public class GameCompletionResultService {
    private final BoardMetadataService boardMetadata;
    private final ObjectMapper mapper;

    public GameCompletionResultService(BoardMetadataService boardMetadata, ObjectMapper mapper) {
        this.boardMetadata = boardMetadata;
        this.mapper = mapper;
    }

    /** Calculates values and preserves the winner rule: total value, cash, then earlier turn order. */
    public CalculatedResult calculate(GameSnapshot snapshot) {
        List<CalculatedPlayer> players = calculatePlayers(snapshot);
        int winnerPlayerId = players.stream()
                .max(Comparator.comparingInt(CalculatedPlayer::totalValue)
                        .thenComparingInt(CalculatedPlayer::cash)
                        .thenComparingInt(player -> -player.turnIndex()))
                .orElseThrow(() -> new IllegalStateException("Cannot complete a game without players"))
                .playerId();
        List<CalculatedPlayer> ordered = players.stream()
                .sorted(Comparator.comparingInt(CalculatedPlayer::totalValue).reversed()
                        .thenComparingInt(CalculatedPlayer::turnIndex))
                .toList();
        List<CalculatedStanding> standings = new ArrayList<>(ordered.size());
        int previousTotal = 0;
        int previousRank = 0;
        for (int index = 0; index < ordered.size(); index++) {
            CalculatedPlayer player = ordered.get(index);
            int rank = index > 0 && player.totalValue() == previousTotal ? previousRank : index + 1;
            standings.add(new CalculatedStanding(player.playerId(), player.cash(), player.propertyValue(),
                    player.totalValue(), rank, player.playerId() == winnerPlayerId));
            previousTotal = player.totalValue();
            previousRank = rank;
        }
        return new CalculatedResult(winnerPlayerId, standings);
    }

    /** Projects the result frozen in the completion CAS; legacy terminal JSON is recomputed server-side once. */
    public GameCompletionResult project(GameSnapshot snapshot, Map<Integer, String> nicknames, int winnerPlayerId,
                                        String frozenJson) {
        CalculatedResult calculated = readFrozen(frozenJson, snapshot.gameId());
        if (calculated == null) {
            calculated = calculate(snapshot);
        }
        if (calculated.winnerPlayerId() != winnerPlayerId) {
            throw new IllegalStateException("Terminal result winner is inconsistent");
        }
        Set<Integer> expectedPlayers = new HashSet<>();
        for (String member : snapshot.members()) {
            try {
                expectedPlayers.add(Integer.valueOf(member));
            } catch (NumberFormatException exception) {
                throw new IllegalStateException("Terminal membership is malformed", exception);
            }
        }
        Set<Integer> resultPlayers = calculated.standings().stream()
                .map(CalculatedStanding::playerId).collect(java.util.stream.Collectors.toSet());
        if (resultPlayers.size() != calculated.standings().size() || !resultPlayers.equals(expectedPlayers)) {
            throw new IllegalStateException("Terminal result players do not match authoritative membership");
        }
        List<GameCompletionStanding> standings = new ArrayList<>(calculated.standings().size());
        for (CalculatedStanding player : calculated.standings()) {
            String nickname = nicknames.get(player.playerId());
            if (nickname == null) {
                throw new IllegalStateException("Terminal player nickname is missing");
            }
            standings.add(new GameCompletionStanding(
                    player.playerId(), nickname, player.cash(), player.propertyValue(), player.totalValue(),
                    player.rank(), player.winner()));
        }
        return new GameCompletionResult(winnerPlayerId, standings);
    }

    private List<CalculatedPlayer> calculatePlayers(GameSnapshot snapshot) {
        Map<Integer, Integer> purchasePrices = purchasePrices();
        List<Integer> order = TurnOrder.parseRequired(mapper, snapshot);
        List<CalculatedPlayer> result = new ArrayList<>(order.size());
        Set<Integer> claimedProperties = new HashSet<>();
        for (int index = 0; index < order.size(); index++) {
            int playerId = order.get(index);
            Map<String, String> state = snapshot.players().get(playerId);
            if (state == null) throw new IllegalStateException("Terminal player state is missing");
            int cash = integer(state, "money");
            int propertyValue = propertyValue(state, purchasePrices, claimedProperties);
            final int totalValue;
            try {
                totalValue = Math.addExact(cash, propertyValue);
            } catch (ArithmeticException exception) {
                throw new IllegalStateException("Terminal total value exceeds integer capacity", exception);
            }
            result.add(new CalculatedPlayer(playerId, cash, propertyValue, totalValue, index));
        }
        return List.copyOf(result);
    }

    private CalculatedResult readFrozen(String frozenJson, int expectedGameId) {
        if (frozenJson == null) throw new IllegalStateException("Terminal result is missing");
        final TerminalGameResult terminal;
        try {
            terminal = mapper.readValue(frozenJson, TerminalGameResult.class);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Stored terminal result is malformed", exception);
        }
        if (terminal.gameId() != expectedGameId || terminal.players() == null || terminal.players().isEmpty()) {
            throw new IllegalStateException("Stored terminal result identity is inconsistent");
        }
        boolean legacy = terminal.players().stream().allMatch(player -> player.propertyValue() == null
                && player.totalValue() == null && player.rank() == null);
        if (legacy) {
            return null;
        }
        if (terminal.players().stream().anyMatch(player -> player.propertyValue() == null
                || player.totalValue() == null || player.rank() == null)) {
            throw new IllegalStateException("Stored terminal result values are incomplete");
        }
        List<CalculatedStanding> standings = terminal.players().stream()
                .map(player -> validateFrozen(player, terminal.winnerPlayerId()))
                .toList();
        validateRanks(standings);
        return new CalculatedResult(terminal.winnerPlayerId(), standings);
    }

    private CalculatedStanding validateFrozen(TerminalGameResult.TerminalPlayerResult player, int winnerPlayerId) {
        int expectedTotal;
        try {
            expectedTotal = Math.addExact(player.money(), player.propertyValue());
        } catch (ArithmeticException exception) {
            throw new IllegalStateException("Stored terminal total value exceeds integer capacity", exception);
        }
        if (player.playerId() <= 0 || player.propertyValue() < 0 || player.totalValue() != expectedTotal
                || player.rank() <= 0 || player.winner() != (player.playerId() == winnerPlayerId)) {
            throw new IllegalStateException("Stored terminal result values are inconsistent");
        }
        return new CalculatedStanding(player.playerId(), player.money(), player.propertyValue(),
                player.totalValue(), player.rank(), player.winner());
    }

    private void validateRanks(List<CalculatedStanding> standings) {
        Set<Integer> ids = new HashSet<>();
        int previousTotal = 0;
        int previousRank = 0;
        for (int index = 0; index < standings.size(); index++) {
            CalculatedStanding standing = standings.get(index);
            int expectedRank = index > 0 && standing.totalValue() == previousTotal ? previousRank : index + 1;
            if (!ids.add(standing.playerId()) || standing.rank() != expectedRank
                    || index > 0 && standing.totalValue() > previousTotal) {
                throw new IllegalStateException("Stored terminal standings are malformed");
            }
            previousTotal = standing.totalValue();
            previousRank = standing.rank();
        }
    }

    private Map<Integer, Integer> purchasePrices() {
        List<BoardSquareMetadataDto> board = boardMetadata.getCanonicalBoard();
        Map<Integer, Integer> prices = new HashMap<>();
        for (BoardSquareMetadataDto square : board) {
            if (square.property() == null) continue;
            int price = square.property().purchasePrice();
            if (price <= 0 || prices.put(square.position(), price) != null) {
                throw new IllegalStateException("Canonical board purchase metadata is invalid");
            }
        }
        return Map.copyOf(prices);
    }

    private int propertyValue(Map<String, String> state, Map<Integer, Integer> purchasePrices,
                              Set<Integer> claimedProperties) {
        List<Integer> properties = properties(state.get("properties"));
        Set<Integer> unique = new HashSet<>();
        int total = 0;
        for (Integer propertyId : properties) {
            if (propertyId == null || !unique.add(propertyId) || !claimedProperties.add(propertyId)) {
                throw new IllegalStateException("Terminal property ownership is malformed or duplicated");
            }
            Integer price = purchasePrices.get(propertyId);
            if (price == null) {
                throw new IllegalStateException("Terminal ownership references a non-purchasable or unknown square");
            }
            try {
                total = Math.addExact(total, price);
            } catch (ArithmeticException exception) {
                throw new IllegalStateException("Terminal property value exceeds integer capacity", exception);
            }
        }
        return total;
    }

    private List<Integer> properties(String raw) {
        if (raw == null) throw new IllegalStateException("Terminal properties are missing");
        try {
            JsonNode node = mapper.readTree(raw);
            if (!node.isArray()) throw new IllegalStateException("Terminal properties JSON is malformed");
            List<Integer> properties = new ArrayList<>(node.size());
            for (JsonNode entry : node) {
                if (!entry.isIntegralNumber() || !entry.canConvertToInt() || entry.intValue() < 0) {
                    throw new IllegalStateException("Terminal properties JSON is malformed");
                }
                properties.add(entry.intValue());
            }
            return List.copyOf(properties);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Terminal properties JSON is malformed", exception);
        }
    }

    private int integer(Map<String, String> state, String field) {
        String raw = state.get(field);
        if (raw == null) throw new IllegalStateException("Terminal player " + field + " is missing");
        try {
            return Integer.parseInt(raw);
        } catch (NumberFormatException exception) {
            throw new IllegalStateException("Terminal player " + field + " is malformed", exception);
        }
    }

    private record CalculatedPlayer(int playerId, int cash, int propertyValue, int totalValue, int turnIndex) { }

    public record CalculatedResult(int winnerPlayerId, List<CalculatedStanding> standings) {
        public CalculatedResult {
            standings = List.copyOf(standings);
        }
    }

    public record CalculatedStanding(
            int playerId, int cash, int propertyValue, int totalValue, int rank, boolean winner) { }
}
