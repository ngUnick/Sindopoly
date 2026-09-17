package com.example.Sindopoly_Java.service;

import com.example.Sindopoly_Java.model.Square;
import com.example.Sindopoly_Java.model.Square.SquareType;
import com.example.Sindopoly_Java.model.dto.BoardSquareMetadataDto;
import com.example.Sindopoly_Java.model.dto.BoardSquareMetadataDto.PropertyMetadata;
import com.example.Sindopoly_Java.repository.SquareRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.EnumSet;
import java.util.List;
import java.util.Set;

@Service
public class BoardMetadataService {

    private static final int BOARD_SIZE = 40;
    private static final Set<SquareType> PROPERTY_TYPES = EnumSet.of(
            SquareType.TRAIN, SquareType.UTILITY,
            SquareType.BROWN, SquareType.CYAN, SquareType.PURPLE, SquareType.ORANGE,
            SquareType.RED, SquareType.YELLOW, SquareType.GREEN, SquareType.BLUE);

    private final SquareRepository squares;

    public BoardMetadataService(SquareRepository squares) {
        this.squares = squares;
    }

    /**
     * Returns the complete board or fails closed; a partial or malformed reference catalog
     * must never be presented as canonical metadata.
     */
    @Transactional(readOnly = true)
    public List<BoardSquareMetadataDto> getCanonicalBoard() {
        List<Square> rows = squares.findAllByOrderByIdAsc();
        if (rows.size() != BOARD_SIZE) {
            throw invalidBoard("expected exactly " + BOARD_SIZE + " positions");
        }

        for (int position = 0; position < BOARD_SIZE; position++) {
            if (rows.get(position).getId() != position) {
                throw invalidBoard("positions must be unique and ordered from 0 through 39");
            }
        }
        return rows.stream().map(this::project).toList();
    }

    private BoardSquareMetadataDto project(Square square) {
        String name = square.getName();
        SquareType type = square.getType();
        if (name == null || name.isBlank() || !name.equals(name.trim())) {
            throw invalidBoard("position " + square.getId() + " has no canonical name");
        }
        if (type == null) {
            throw invalidBoard("position " + square.getId() + " has no canonical type");
        }

        PropertyMetadata property = PROPERTY_TYPES.contains(type)
                ? projectProperty(square, type)
                : projectSpecialSquare(square, type);
        return new BoardSquareMetadataDto(square.getId(), name, type, property);
    }

    private PropertyMetadata projectProperty(Square square, SquareType type) {
        Integer price = square.getPrice();
        Integer rent = square.getRent();
        if (price == null || price <= 0) {
            throw invalidBoard("property position " + square.getId() + " has no purchase price");
        }
        if (type == SquareType.UTILITY) {
            if (rent != null) {
                throw invalidBoard("utility position " + square.getId() + " must use dice-derived rent");
            }
        } else if (rent == null || rent <= 0) {
            throw invalidBoard("property position " + square.getId() + " has no base rent");
        }
        return new PropertyMetadata(price, rent, type.name());
    }

    private PropertyMetadata projectSpecialSquare(Square square, SquareType type) {
        Integer price = square.getPrice();
        Integer rent = square.getRent();
        if (type == SquareType.TAX) {
            if (price == null || price >= 0 || rent != null) {
                throw invalidBoard("tax position " + square.getId() + " has invalid persistent metadata");
            }
        } else if (price != null || rent != null) {
            throw invalidBoard("special position " + square.getId() + " has property metadata");
        }
        return null;
    }

    private IllegalStateException invalidBoard(String reason) {
        return new IllegalStateException("Canonical board metadata is invalid: " + reason);
    }
}
