package com.example.Sindopoly_Java.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
@Getter @Setter
@Table(name = "Game")
public class Game {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Enumerated(EnumType.STRING)
    @Column(name="gameStatus")
    private GameStatus gameStatus;

    @ManyToOne
    @JoinColumn(name="creator", referencedColumnName = "id")
    private Player creator;

    @ManyToOne
    @JoinColumn(name="playerTurn", referencedColumnName = "id")
    private Player playerTurn;

    @Column(name="timer")
    private LocalDateTime timer;

    @Column(name="maxTime")
    private Integer maxTime;

    @Column(name="maxMoney")
    private Integer maxMoney;

    @ManyToOne
    @JoinColumn(name="winner", referencedColumnName = "id")
    private Player winner;

    @Column(name="start_Time")
    private LocalDateTime startTime;
}
