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

    // Getters
    public int getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public Timestamp getCreatedAt() {
        return createdAt;
    }

    // Setters
    public void setId(int id) {
        this.id = id;
    }

    public void setName(String name) {
        this.name = name;
    }

    public void setCreatedAt(Timestamp createdAt) {
        this.createdAt = createdAt;
    }
}