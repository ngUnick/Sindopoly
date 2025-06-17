package com.example.Sindopoly_Java.model.dto;


import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Payload sent by the client when they click a modal button
 * (buy / pass / ok).
 */
public class ActionRequestDto {
    private int  gameId;
    private int  playerId;
    private int  squareType;  // from ThrowResultDto
    private boolean yes;      // true = “Yes/OK”, false = “No”

    public ActionRequestDto() {}

    public ActionRequestDto(int gameId, int playerId, int squareType, boolean yes) {
        this.gameId   = gameId;
        this.playerId = playerId;
        this.squareType = squareType;
        this.yes   = yes;
    }

    public int getGameId()       { return gameId; }
    public int getPlayerId()     { return playerId; }
    public int getSquareType()     { return squareType; }
    public boolean getYes()    { return yes; }

    public void setGameId(int gameId)         { this.gameId   = gameId; }
    public void setPlayerId(int playerId)     { this.playerId = playerId; }
    public void setSquareType(int squareType)     { this.squareType = squareType; }
    public void setYes(boolean yes)      { this.yes   = yes; }
}
