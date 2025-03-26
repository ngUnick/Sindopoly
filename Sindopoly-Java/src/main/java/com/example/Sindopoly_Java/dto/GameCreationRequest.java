package com.example.Sindopoly_Java.dto;

public class GameCreationRequest {
    private int ownerId;
    private String visibility;

    // Getters and setters
    public int getOwnerId() {
        return ownerId;
    }

    public void setOwnerId(int ownerId) {
        this.ownerId = ownerId;
    }

    public String getVisibility() {
        return visibility;
    }

    public void setVisibility(String visibility) {
        this.visibility = visibility;
    }
}
