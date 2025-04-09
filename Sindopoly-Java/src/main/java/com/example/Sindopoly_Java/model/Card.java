package com.example.Sindopoly_Java.model;

import jakarta.persistence.*;

@Entity
@Table(name = "Card")
public class Card {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private int id;

    private String title;
    private String description;

    public String getTitle() {
        return title;
    }

    public String getDescription() {
        return description;
    }

    @Enumerated(EnumType.STRING)
    private CardType type;

    private float amount;

    public float getAmount() {
        return amount;
    }

    public enum CardType {
        money, transport
    }
}
