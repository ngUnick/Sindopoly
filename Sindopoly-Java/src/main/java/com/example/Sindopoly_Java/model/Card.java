package com.example.Sindopoly_Java.model;

import jakarta.persistence.*;

@Entity
@Table(name = "card")
public class Card {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(columnDefinition = "SMALLINT")
    private int id;

    @Column(length = 200)
    private String  title;
    @Column(length = 1000)
    private String  description;

    @Enumerated(EnumType.STRING)
    private CardType type;

    private float   amount;

    /* ── getters ─────────────────────────────── */
    public int getId()            { return id; }
    public String getTitle()      { return title; }
    public String getDescription(){ return description; }
    public CardType getType()     { return type; }
    public float getAmount()      { return amount; }

    /* ── enum ────────────────────────────────── */
    public enum CardType { money, transport }
}
