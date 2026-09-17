package com.example.Sindopoly_Java.service.transition;

import com.example.Sindopoly_Java.model.Square.SquareType;
import com.example.Sindopoly_Java.model.dto.BoardSquareMetadataDto;
import com.example.Sindopoly_Java.model.dto.BoardSquareMetadataDto.PropertyMetadata;
import com.example.Sindopoly_Java.realtime.GameCompletionResult;
import com.example.Sindopoly_Java.service.BoardMetadataService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class GameCompletionResultServiceTest {
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void calculatesCanonicalCashPropertyAndTotalValuesWithOneBoardRead() {
        BoardMetadataService metadata = metadata();
        GameCompletionResultService service = new GameCompletionResultService(metadata, mapper);
        GameSnapshot snapshot = snapshot(
                player("100", "[]", false),
                player("-20", "[1,5,12]", true));

        GameCompletionResultService.CalculatedResult result = service.calculate(snapshot);

        assertThat(result.winnerPlayerId()).isEqualTo(2);
        assertThat(result.standings()).extracting(
                GameCompletionResultService.CalculatedStanding::playerId,
                GameCompletionResultService.CalculatedStanding::cash,
                GameCompletionResultService.CalculatedStanding::propertyValue,
                GameCompletionResultService.CalculatedStanding::totalValue,
                GameCompletionResultService.CalculatedStanding::rank)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(2, -20, 600, 580, 1),
                        org.assertj.core.groups.Tuple.tuple(1, 100, 0, 100, 2));
        verify(metadata, times(1)).getCanonicalBoard();
    }

    @Test
    void utilityAndTrainUsePurchasePriceRatherThanRentMechanics() {
        GameCompletionResultService service = new GameCompletionResultService(metadata(), mapper);

        GameCompletionResultService.CalculatedResult result = service.calculate(snapshot(
                player("0", "[5,12]", false), player("1", "[]", false)));

        assertThat(result.standings().get(0).propertyValue()).isEqualTo(500);
        assertThat(result.standings().get(0).totalValue()).isEqualTo(500);
    }

    @Test
    void equalTotalsShareCompetitionRankWhileTurnOrderOnlyStabilizesDisplay() throws Exception {
        GameCompletionResultService service = new GameCompletionResultService(metadata(), mapper);
        GameSnapshot snapshot = snapshot(
                player("100", "[1]", false),
                player("200", "[]", false));
        GameCompletionResultService.CalculatedResult calculated = service.calculate(snapshot);

        assertThat(calculated.winnerPlayerId()).isEqualTo(2);
        assertThat(calculated.standings()).extracting(
                GameCompletionResultService.CalculatedStanding::playerId,
                GameCompletionResultService.CalculatedStanding::rank,
                GameCompletionResultService.CalculatedStanding::winner)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(1, 1, false),
                        org.assertj.core.groups.Tuple.tuple(2, 1, true));

        TerminalGameResult frozen = terminal(calculated);
        GameCompletionResult projected = service.project(snapshot, Map.of(1, "Ίριδα", 2, "Άλκη"), 2,
                mapper.writeValueAsString(frozen));
        assertThat(projected.winnerPlayerId()).isEqualTo(2);
        assertThat(projected.standings()).extracting(row -> row.nickname())
                .containsExactly("Ίριδα", "Άλκη");
        assertThat(projected.standings()).allSatisfy(row -> assertThat(row.rank()).isEqualTo(1));
    }

    @Test
    void higherAndLowerCapitalProduceDeterministicCompetitionRanks() {
        GameCompletionResultService service = new GameCompletionResultService(metadata(), mapper);
        GameSnapshot snapshot = snapshot(player("50", "[1]", false), player("400", "[]", false));

        assertThat(service.calculate(snapshot)).isEqualTo(service.calculate(snapshot));
        assertThat(service.calculate(snapshot).standings()).extracting(
                GameCompletionResultService.CalculatedStanding::playerId,
                GameCompletionResultService.CalculatedStanding::rank)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(2, 1),
                        org.assertj.core.groups.Tuple.tuple(1, 2));
    }

    @Test
    void rejectsUnknownSpecialDuplicateAndMalformedOwnedProperties() {
        GameCompletionResultService service = new GameCompletionResultService(metadata(), mapper);

        for (String properties : List.of("[39]", "[0]", "[1,1]", "[\"1\"]", "not-json")) {
            assertThatThrownBy(() -> service.calculate(snapshot(
                    player("100", properties, false), player("100", "[]", false))))
                    .isInstanceOf(IllegalStateException.class);
        }
        assertThatThrownBy(() -> service.calculate(snapshot(
                player("100", "[1]", false), player("100", "[1]", false))))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("duplicated");
    }

    @Test
    void rejectsMissingCanonicalPriceAndArithmeticOverflow() {
        BoardMetadataService invalidMetadata = mock(BoardMetadataService.class);
        when(invalidMetadata.getCanonicalBoard()).thenThrow(new IllegalStateException("missing purchase price"));
        assertThatThrownBy(() -> new GameCompletionResultService(invalidMetadata, mapper)
                .calculate(snapshot(player("1", "[1]", false), player("1", "[]", false))))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("missing purchase price");

        assertThatThrownBy(() -> new GameCompletionResultService(metadata(), mapper)
                .calculate(snapshot(player(String.valueOf(Integer.MAX_VALUE), "[1]", false),
                        player("1", "[]", false))))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("integer capacity");
    }

    @Test
    void frozenProjectionRejectsWinnerArithmeticAndMembershipContradictions() throws Exception {
        GameCompletionResultService service = new GameCompletionResultService(metadata(), mapper);
        GameSnapshot snapshot = snapshot(player("100", "[]", false), player("200", "[]", false));
        TerminalGameResult malformed = new TerminalGameResult("id", 7, 1, 2, 1, 2, List.of(
                new TerminalGameResult.TerminalPlayerResult(1, 100, 0, 999, 2, false),
                new TerminalGameResult.TerminalPlayerResult(2, 200, 0, 200, 1, true)));

        assertThatThrownBy(() -> service.project(snapshot, Map.of(1, "One", 2, "Two"), 2,
                mapper.writeValueAsString(malformed))).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> service.project(snapshot, Map.of(1, "One", 2, "Two"), 1,
                mapper.writeValueAsString(terminal(service.calculate(snapshot)))))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("winner");

        TerminalGameResult partial = new TerminalGameResult("id", 7, 1, 2, 1, 2, List.of(
                new TerminalGameResult.TerminalPlayerResult(2, 200, 0, 200, 1, true),
                new TerminalGameResult.TerminalPlayerResult(1, 100, false)));
        assertThatThrownBy(() -> service.project(snapshot, Map.of(1, "One", 2, "Two"), 2,
                mapper.writeValueAsString(partial)))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("incomplete");

        TerminalGameResult wrongGame = new TerminalGameResult("id", 8, 1, 2, 1, 2,
                terminal(service.calculate(snapshot)).players());
        assertThatThrownBy(() -> service.project(snapshot, Map.of(1, "One", 2, "Two"), 2,
                mapper.writeValueAsString(wrongGame)))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("identity");
    }

    @Test
    void frozenProjectionDoesNotRecalculateFromReusablePlayerHashes() throws Exception {
        BoardMetadataService metadata = mock(BoardMetadataService.class);
        GameCompletionResultService service = new GameCompletionResultService(metadata, mapper);
        GameSnapshot laterPlayerState = snapshot(
                player("25", "[]", false), player("1500", "[]", false));
        TerminalGameResult frozen = new TerminalGameResult("id", 7, 1, 2, 1, 1, List.of(
                new TerminalGameResult.TerminalPlayerResult(1, 5000, 410, 5410, 1, true),
                new TerminalGameResult.TerminalPlayerResult(2, 1500, 0, 1500, 2, false)));

        GameCompletionResult result = service.project(laterPlayerState, Map.of(1, "One", 2, "Two"), 1,
                mapper.writeValueAsString(frozen));

        assertThat(result.standings().get(0).cash()).isEqualTo(5000);
        assertThat(result.standings().get(0).propertyValue()).isEqualTo(410);
        verify(metadata, times(0)).getCanonicalBoard();
    }

    private BoardMetadataService metadata() {
        BoardMetadataService metadata = mock(BoardMetadataService.class);
        List<BoardSquareMetadataDto> board = new ArrayList<>();
        for (int position = 0; position < 40; position++) {
            board.add(new BoardSquareMetadataDto(position, "Square " + position, SquareType.START, null));
        }
        board.set(1, new BoardSquareMetadataDto(1, "Property", SquareType.BROWN,
                new PropertyMetadata(100, 10, "BROWN")));
        board.set(5, new BoardSquareMetadataDto(5, "Train", SquareType.TRAIN,
                new PropertyMetadata(200, 25, "TRAIN")));
        board.set(12, new BoardSquareMetadataDto(12, "Utility", SquareType.UTILITY,
                new PropertyMetadata(300, null, "UTILITY")));
        when(metadata.getCanonicalBoard()).thenReturn(List.copyOf(board));
        return metadata;
    }

    private GameSnapshot snapshot(Map<String, String> first, Map<String, String> second) {
        return new GameSnapshot(7, Map.of("status", "ended", "stateVersion", "9", "turnOrder", "[1,2]"),
                Set.of("1", "2"), Map.of(1, first, 2, second), List.of());
    }

    private Map<String, String> player(String money, String properties, boolean bankrupt) {
        Map<String, String> state = new LinkedHashMap<>();
        state.put("money", money);
        state.put("properties", properties);
        state.put("bankrupt", String.valueOf(bankrupt));
        return Map.copyOf(state);
    }

    private TerminalGameResult terminal(GameCompletionResultService.CalculatedResult result) {
        return new TerminalGameResult("id", 7, 1, 2, 1, result.winnerPlayerId(),
                result.standings().stream().map(row -> new TerminalGameResult.TerminalPlayerResult(
                        row.playerId(), row.cash(), row.propertyValue(), row.totalValue(), row.rank(), row.winner()))
                        .toList());
    }
}
