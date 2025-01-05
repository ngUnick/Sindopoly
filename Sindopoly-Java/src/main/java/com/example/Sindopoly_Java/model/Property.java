package com.example.Sindopoly_Java.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

@Entity
@Getter @Setter
@Table(name = "Property")
public class Property {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @Column(name="price")
    private Integer price;

    @Enumerated(EnumType.STRING)
    @Column(name="color")
    private Color color;

    @Column(name="rent")
    private Integer rent;
}
