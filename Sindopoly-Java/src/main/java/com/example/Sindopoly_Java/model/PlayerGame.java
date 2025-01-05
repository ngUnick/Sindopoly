package com.example.Sindopoly_Java.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

@Entity
@Getter @Setter
@Table(name = "PlayerGame")
public class PlayerGame {
    @Id
    @Column(name="player_id")
    private Integer playerId;

    @ManyToOne
    @JoinColumn(name="player_id", referencedColumnName = "id", insertable = false, updatable = false)
    private Player player;

    @ManyToOne
    @JoinColumn(name="game_id", referencedColumnName = "id")
    private Game game;

    @ManyToOne
    @JoinColumn(name="square_id", referencedColumnName = "id")
    private Square square;

    @Column(name="money")
    private Integer money;

    @Column(name="inJail")
    private Boolean inJail;
}
