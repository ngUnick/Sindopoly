package com.example.Sindopoly_Java.service;

import com.example.Sindopoly_Java.model.Square;
import com.example.Sindopoly_Java.model.Square.SquareType;
import com.example.Sindopoly_Java.model.dto.BoardSquareMetadataDto;
import com.example.Sindopoly_Java.repository.SquareRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class BoardMetadataServiceTest {

    @Mock SquareRepository squares;
    private BoardMetadataService service;

    @BeforeEach
    void setUp() {
        service = new BoardMetadataService(squares);
    }

    @Test
    void projectsExactlyFortyOrderedCanonicalPositions() {
        when(squares.findAllByOrderByIdAsc()).thenReturn(validBoard());

        List<BoardSquareMetadataDto> result = service.getCanonicalBoard();

        assertThat(result).hasSize(40);
        assertThat(result).extracting(BoardSquareMetadataDto::position)
                .containsExactlyElementsOf(java.util.stream.IntStream.range(0, 40).boxed().toList());
        assertThat(result.get(0)).extracting(
                BoardSquareMetadataDto::name, BoardSquareMetadataDto::type)
                .containsExactly("ΑΦΕΤΗΡΙΑ", SquareType.START);
        assertThat(result.get(10).type()).isEqualTo(SquareType.JAIL);
        assertThat(result.get(20).type()).isEqualTo(SquareType.PARKING);
        assertThat(result.get(30).type()).isEqualTo(SquareType.GOJAIL);
        assertThat(result.get(39)).extracting(
                BoardSquareMetadataDto::name, BoardSquareMetadataDto::type)
                .containsExactly("ΗΛΕΚΤΡΟΝΙΚΗΣ", SquareType.BLUE);
        verify(squares).findAllByOrderByIdAsc();
    }

    @Test
    void projectsPersistentPropertyMetadataAndSemanticGroup() {
        when(squares.findAllByOrderByIdAsc()).thenReturn(validBoard());

        List<BoardSquareMetadataDto> result = service.getCanonicalBoard();

        assertThat(result.get(1).property()).isEqualTo(
                new BoardSquareMetadataDto.PropertyMetadata(60, 2, "BROWN"));
        assertThat(result.get(5).property()).isEqualTo(
                new BoardSquareMetadataDto.PropertyMetadata(200, 25, "TRAIN"));
        assertThat(result.get(12).property()).isEqualTo(
                new BoardSquareMetadataDto.PropertyMetadata(150, null, "UTILITY"));
        assertThat(result.get(0).property()).isNull();
        assertThat(result.get(10).property()).isNull();
    }

    @Test
    void missingPositionFailsClosed() {
        List<Square> missing = validBoard();
        missing.remove(39);
        when(squares.findAllByOrderByIdAsc()).thenReturn(missing);

        assertThatThrownBy(service::getCanonicalBoard)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("exactly 40");
    }

    @Test
    void duplicateOrOutOfOrderPositionFailsClosed() {
        List<Square> duplicate = validBoard();
        duplicate.set(39, square(38, "Duplicate", SquareType.CARD, null, null));
        when(squares.findAllByOrderByIdAsc()).thenReturn(duplicate);

        assertThatThrownBy(service::getCanonicalBoard)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("unique and ordered");
    }

    @Test
    void malformedNameTypeAndPropertyMetadataFailClosed() {
        List<Square> unnamed = validBoard();
        unnamed.set(2, square(2, " ", SquareType.CARD, null, null));
        when(squares.findAllByOrderByIdAsc()).thenReturn(unnamed);
        assertThatThrownBy(service::getCanonicalBoard).hasMessageContaining("canonical name");

        List<Square> propertyWithoutPrice = validBoard();
        propertyWithoutPrice.set(1, square(1, "ΓΥΜΝΑΣΤΗΡΙΟ", SquareType.BROWN, null, 2));
        when(squares.findAllByOrderByIdAsc()).thenReturn(propertyWithoutPrice);
        assertThatThrownBy(service::getCanonicalBoard).hasMessageContaining("purchase price");
    }

    private List<Square> validBoard() {
        List<Square> board = new ArrayList<>();
        for (int position = 0; position < 40; position++) {
            board.add(square(position, "Τετράγωνο " + position, SquareType.CARD, null, null));
        }
        board.set(0, square(0, "ΑΦΕΤΗΡΙΑ", SquareType.START, null, null));
        board.set(1, square(1, "ΓΥΜΝΑΣΤΗΡΙΟ", SquareType.BROWN, 60, 2));
        board.set(5, square(5, "ΚΙΟΣΚΙ Σ.Ε.Υ.Π.", SquareType.TRAIN, 200, 25));
        board.set(10, square(10, "ΦΥΛΑΚΗ", SquareType.JAIL, null, null));
        board.set(12, square(12, "ΚΥΛΙΚΕΙΟ", SquareType.UTILITY, 150, null));
        board.set(20, square(20, "ΝΑΥΤΙΛΟΣ", SquareType.PARKING, null, null));
        board.set(30, square(30, "ΠΑΝΕ ΣΤΗ ΦΥΛΑΚΗ", SquareType.GOJAIL, null, null));
        board.set(39, square(39, "ΗΛΕΚΤΡΟΝΙΚΗΣ", SquareType.BLUE, 400, 50));
        return board;
    }

    private Square square(int id, String name, SquareType type, Integer price, Integer rent) {
        Square square = new Square();
        ReflectionTestUtils.setField(square, "id", id);
        ReflectionTestUtils.setField(square, "name", name);
        ReflectionTestUtils.setField(square, "type", type);
        ReflectionTestUtils.setField(square, "price", price);
        ReflectionTestUtils.setField(square, "rent", rent);
        return square;
    }
}
