package com.example.Sindopoly_Java.model.dto;

import com.example.Sindopoly_Java.model.Square.SquareType;

/** Read-only canonical metadata for one board position. */
public record BoardSquareMetadataDto(
        int position,
        String name,
        SquareType type,
        PropertyMetadata property
) {
    /** Persistent purchase metadata; live ownership and payable rent are intentionally excluded. */
    public record PropertyMetadata(
            int purchasePrice,
            Integer baseRent,
            String group
    ) { }
}
