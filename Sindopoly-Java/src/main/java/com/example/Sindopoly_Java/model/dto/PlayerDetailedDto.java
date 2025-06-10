package com.example.Sindopoly_Java.model.dto;

public class PlayerDetailedDto {
    private int player_id;
    private String nickname;
    private int position;
    private int money;
    private String properties; // JSON string or however you like

    // No-args constructor
    public PlayerDetailedDto() {}

    // All-args constructor
    public PlayerDetailedDto(int player_id, String nickname, int position, int money, String properties) {
        this.player_id = player_id;
        this.nickname = nickname;
        this.position = position;
        this.money = money;
        this.properties = properties;
    }

    // Getters
    public int getPlayer_id() {
        return player_id;
    }

    public String getNickname() {
        return nickname;
    }

    public int getPosition() {
        return position;
    }

    public int getMoney() {
        return money;
    }

    public String getProperties() {
        return properties;
    }

    // Setters
    public void setPlayer_id(int player_id) {
        this.player_id = player_id;
    }

    public void setNickname(String nickname) {
        this.nickname = nickname;
    }

    public void setPosition(int position) {
        this.position = position;
    }

    public void setMoney(int money) {
        this.money = money;
    }

    public void setProperties(String properties) {
        this.properties = properties;
    }
}