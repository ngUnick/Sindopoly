package com.example.Sindopoly_Java.model;

import jakarta.persistence.*;

@Entity
@Table(name = "square")
public class Square {

    @Id
    // @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(columnDefinition = "TINYINT")
    private int id;

    @Enumerated(EnumType.STRING)
    @Column(name = "s_type")
    private SquareType type;

    @Column(columnDefinition = "SMALLINT")
    private Integer price;

    @Column(columnDefinition = "SMALLINT")
    private Integer rent;

    /* ── getters ─────────────────────────────────────────────── */

    public int getId() {
        return id;
    }

    public SquareType getType() {
        return type;
    }

    public Integer getPrice() {
        return price;
    }

    public Integer getRent() {
        return rent;
    }

    /* ── enum ───────────────────────────────────────────────── */
    public enum SquareType {
        START, CARD, TAX, JAIL, GOJAIL, PARKING, TRAIN, UTILITY,
        BROWN, CYAN, PURPLE, ORANGE, RED, YELLOW, GREEN, BLUE
    }
}

