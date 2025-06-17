package com.example.Sindopoly_Java.model.dto;

/**
 * STEP 1 response: roll & move.
 * @param dice        the dice total
 * @param newPosition the player’s new board index (0–39)
 * @param passedGo    true if the move passed Start
 * @param squareType  1=moveCard,2=moneyCard,3=rentOwed,4=ownProp,
 *                    5=buyOffer,6=tax,7=goToJail,8=jail,9=freeParking
 * @param data        related value (see docs)
 */
public record ThrowResultDto(
    int  dice,
    int  newPosition,
    boolean passedGo,
    int  squareType,
    int  data
) {}