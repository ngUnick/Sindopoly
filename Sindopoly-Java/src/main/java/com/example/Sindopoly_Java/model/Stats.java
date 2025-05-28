package com.example.Sindopoly_Java.model;

import jakarta.persistence.*;

@Entity
@Table(name = "`Stats`")
public class Stats {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private int id;

    @OneToOne
    @JoinColumn(name = "player", referencedColumnName = "id", nullable = false, unique = true)
    private Player player;

    @Column(name = "total_wins")
    private int totalWins;

    @Column(name = "total_losses")
    private int totalLosses;

    @Column(name = "total_games")
    private int totalGames;

    @Column(name = "total_money")
    private int totalMoney;

    @Column(name = "total_time_played")
    private int totalTimePlayed;

    // Getters
    public int getId() {
        return id;
    }

    public Player getPlayer() {
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
    public void setPlayer(Player player) {
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
