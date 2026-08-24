package com.example.Sindopoly_Java.model.dto;

import java.util.List;

/**
 * Response after the client’s action (buy/pass/ok):
 * new balance, list of any newly acquired propertyIds, and who is next.
 */
public record ActionResultDto(
    int newBalance,
    List<Integer> acquiredProperties,
    int nextPlayerId,
    long stateVersion,
    boolean replayed
) {
    public ActionResultDto(int newBalance, List<Integer> acquiredProperties, int nextPlayerId) {
        this(newBalance, acquiredProperties, nextPlayerId, 0, false);
    }
}
