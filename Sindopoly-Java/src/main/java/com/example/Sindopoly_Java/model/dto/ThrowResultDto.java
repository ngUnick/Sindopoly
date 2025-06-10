package com.example.Sindopoly_Java.model.dto;

import com.example.Sindopoly_Java.model.dto.SquareEventDto;

/**
 * Response after rolling and moving: includes the dice value,
 * the new board position, and the SquareEvent describing what to show next.
 */
public record ThrowResultDto(
    int dice,
    int newPosition,
    SquareEventDto event
) {}
