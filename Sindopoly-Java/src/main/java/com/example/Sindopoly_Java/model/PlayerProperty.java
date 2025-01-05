package com.example.Sindopoly_Java.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

@Entity
@Getter @Setter
@Table(name = "PlayerProperty")
@IdClass(PlayerPropertyId.class)
public class PlayerProperty {

    @Id
    @Column(name="property")
    private Integer property;

    @Id
    @Column(name="game")
    private Integer game;

    @ManyToOne
    @JoinColumn(name="property", insertable=false, updatable=false)
    private Property propertyObj;

    @ManyToOne
    @JoinColumn(name="player", referencedColumnName = "id")
    private Player playerObj;

    @ManyToOne
    @JoinColumn(name="game", insertable=false, updatable=false)
    private Game gameObj;
}
