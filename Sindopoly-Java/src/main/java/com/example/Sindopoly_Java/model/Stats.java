package com.example.Sindopoly_Java.model;

import jakarta.persistence.*;

@Entity
@Table(name = "Stats")
public class Stats {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private int id;

    private int player;
    private int totalWins;
    private int totalLosses;
    private int totalGames;
    private int totalMoney;
    private int totalTimePlayed;

    // Getters
    public int getId() {
        return id;
    }

    public int getPlayer() {
        return player;
    }

    public int getTotalWins() {
        return totalWins;
    }

    public int getTotalLosses() {
        return totalLosses;
    }

    public int getTotalGames() {
        return totalGames;
    }

    public int getTotalMoney() {
        return totalMoney;
    }

    public int getTotalTimePlayed() {
        return totalTimePlayed;
    }

    // Setters
    public void setPlayer(int player) {
        this.player = player;
    }

    public void setTotalWins(int totalWins) {
        this.totalWins = totalWins;
    }

    public void setTotalLosses(int totalLosses) {
        this.totalLosses = totalLosses;
    }

    public void setTotalGames(int totalGames) {
        this.totalGames = totalGames;
    }

    public void setTotalMoney(int totalMoney) {
        this.totalMoney = totalMoney;
    }

    public void setTotalTimePlayed(int totalTimePlayed) {
        this.totalTimePlayed = totalTimePlayed;
    }
}
