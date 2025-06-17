// src/main/java/com/example/Sindopoly_Java/dto/ApplyResultDto.java
package com.example.Sindopoly_Java.model.dto;

import java.util.List;

/**
 * Response after applying a SquareEvent (e.g. tax paid, property bought, rent paid).
 */
public class ApplyResultDto {
    private int newBalance;
    private List<Integer> acquiredProperties;
    private String message;

    public ApplyResultDto() {}

    public ApplyResultDto(int newBalance, List<Integer> acquiredProperties, String message) {
        this.newBalance = newBalance;
        this.acquiredProperties = acquiredProperties;
        this.message = message;
    }

    public int getNewBalance() {
        return newBalance;
    }

    public List<Integer> getAcquiredProperties() {
        return acquiredProperties;
    }

    public String getMessage() {
        return message;
    }

    public void setNewBalance(int newBalance) {
        this.newBalance = newBalance;
    }

    public void setAcquiredProperties(List<Integer> acquiredProperties) {
        this.acquiredProperties = acquiredProperties;
    }

    public void setMessage(String message) {
        this.message = message;
    }
}
