package com.example.Sindopoly_Java.model.dto;

import java.util.Objects;

/** Immutable client projection of MariaDB card metadata and its authoritative effect. */
public record CardDrawDto(
        int cardId,
        String title,
        String text,
        String effect,
        int amount) {
    public CardDrawDto {
        if (cardId <= 0) throw new IllegalArgumentException("cardId must be positive");
        Objects.requireNonNull(title, "title");
        Objects.requireNonNull(text, "text");
        Objects.requireNonNull(effect, "effect");
    }
}
