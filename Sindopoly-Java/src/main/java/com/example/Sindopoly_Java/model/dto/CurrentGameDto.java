package com.example.Sindopoly_Java.model.dto;

/** Bounded session projection used to resume an existing lobby or active game. */
public record CurrentGameDto(
        int gameId,
        String status,
        long stateVersion,
        String visibility) {
}
