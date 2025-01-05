package com.example.Sindopoly_Java.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

@Entity
@Getter @Setter
@Table(name = "Square")
public class Square {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @ManyToOne
    @JoinColumn(name="game", referencedColumnName = "id")
    private Game game;

    @Column(name="position")
    private Integer position;

    @ManyToOne
    @JoinColumn(name="property", referencedColumnName = "id")
    private Property property;

    @Enumerated(EnumType.STRING)
    @Column(name="type")
    private SquareType type;
}
