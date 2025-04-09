package com.example.Sindopoly_Java.model;

import jakarta.persistence.*;

@Entity
@Table(name = "Square")
public class Square {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private int id;

    @Enumerated(EnumType.STRING)
    @Column(name = "s_type")
    private SquareType type;

    private Integer price;
    private Integer rent;

    public Integer getPrice() {
        return price;
    }

    public Integer getRent() {
        return rent;
    }

    public enum SquareType {
        START, CARD, TAX, JAIL, GOJAIL, PARKING, TRAIN, UTILITY,
        BROWN, CYAN, PURPLE, ORANGE, RED, YELLOW, GREEN, BLUE
    }
}

