package com.example.Sindopoly_Java.model.dto;


import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Payload sent by the client when they click a modal button
 * (buy / pass / ok).
 */
public class ActionRequestDto {
    @JsonProperty("gameId")
    private int gameId;
    @JsonProperty("playerId")
    private int playerId;
    @JsonProperty("action")
    private String action;       // "buy", "pass", "ok"
    @JsonProperty("squareId")
    private Integer squareId;    // only set for buy; null otherwise

    public ActionRequestDto() {}

    public ActionRequestDto(int gameId, int playerId, String action, Integer squareId) {
        this.gameId   = gameId;
        this.playerId = playerId;
        this.action   = action;
        this.squareId = squareId;
    }

    public int getGameId()       { return gameId; }
    public int getPlayerId()     { return playerId; }
    public String getAction()    { return action; }
    public Integer getSquareId() { return squareId; }

    public void setGameId(int gameId)         { this.gameId   = gameId; }
    public void setPlayerId(int playerId)     { this.playerId = playerId; }
    public void setAction(String action)      { this.action   = action; }
    public void setSquareId(Integer squareId) { this.squareId = squareId; }
}
