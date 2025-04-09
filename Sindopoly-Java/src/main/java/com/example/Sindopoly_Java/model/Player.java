package com.example.Sindopoly_Java.model;

import jakarta.persistence.*;
import java.sql.Timestamp;

@Entity
@Table(name = "Player")
public class Player {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private int id;

    @Column(name = "p_name")
    private String name;

    @Column(name = "created_at", insertable = false, updatable = false)
    private Timestamp createdAt;
}
