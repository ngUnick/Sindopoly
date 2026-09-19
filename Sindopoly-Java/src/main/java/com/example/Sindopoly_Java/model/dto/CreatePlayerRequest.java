package com.example.Sindopoly_Java.model.dto;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;

/** Converts only a JSON string into the typed nickname; other JSON types fail validation. */
public final class CreatePlayerRequest {
    private final String nickname;

    @JsonCreator
    public CreatePlayerRequest(@JsonProperty("nickname") JsonNode nickname) {
        this.nickname = nickname != null && nickname.isTextual() ? nickname.textValue() : null;
    }

    public String nickname() {
        return nickname;
    }
}
