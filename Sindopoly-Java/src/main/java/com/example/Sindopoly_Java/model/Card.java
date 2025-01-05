package com.example.Sindopoly_Java.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

@Entity
@Getter @Setter
@Table(name = "Card")
public class Card {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name="title", length=200)
    private String title;

    @Column(name="description", length=1000)
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(name="type")
    private CardType type;

    @Column(name="amount")
    private Integer amount;
}
