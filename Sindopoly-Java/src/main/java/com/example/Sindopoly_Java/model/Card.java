package com.example.Sindopoly_Java.model;

import jakarta.persistence.*;

@Entity
@Table(name = "`Card`")
public class Card {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private int id;

    private String  title;
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
