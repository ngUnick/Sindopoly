package com.example.Sindopoly_Java.model;

import java.io.Serializable;
import java.util.Objects;

public class PlayerPropertyId implements Serializable {
    private Integer property;
    private Integer game;

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof PlayerPropertyId)) return false;
        PlayerPropertyId that = (PlayerPropertyId) o;
        return Objects.equals(property, that.property) &&
               Objects.equals(game, that.game);
    }

    @Override
    public int hashCode() {
        return Objects.hash(property, game);
    }
}
