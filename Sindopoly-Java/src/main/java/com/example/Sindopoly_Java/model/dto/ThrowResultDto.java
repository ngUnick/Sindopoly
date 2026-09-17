package com.example.Sindopoly_Java.model.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * STEP 1 response: roll & move.
 * @param dice        compatibility alias for {@code total}; zero for a no-roll jail offer
 * @param die1        first authoritative die, or null when this command only creates a jail offer
 * @param die2        second authoritative die, or null when this command only creates a jail offer
 * @param total       authoritative sum, or null when no dice were generated
 * @param newPosition the player’s new board index (0–39)
 * @param passedGo    true if the move passed Start
 * @param squareType  1=moveCard,2=moneyCard,3=rentOwed,4=ownProp,
 *                    5=buyOffer,6=tax,7=goToJail,8=jail,9=freeParking
 * @param data        related value (see docs)
 * @param card        MariaDB-backed thematic card and effect, or null for non-card squares
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ThrowResultDto(
    int  dice,
    Integer die1,
    Integer die2,
    Integer total,
    int  newPosition,
    boolean passedGo,
    int  squareType,
    int  data,
    long stateVersion,
    boolean replayed,
    CardDrawDto card
) {
    public ThrowResultDto {
        boolean noPair = die1 == null && die2 == null && total == null;
        boolean completePair = die1 != null && die2 != null && total != null;
        if (!noPair && !completePair) {
            throw new IllegalArgumentException("Dice pair fields must be all present or all absent");
        }
        if (completePair && (die1 < 1 || die1 > 6 || die2 < 1 || die2 > 6
                || total != die1 + die2 || dice != total)) {
            throw new IllegalArgumentException("Invalid authoritative dice pair");
        }
    }
}
