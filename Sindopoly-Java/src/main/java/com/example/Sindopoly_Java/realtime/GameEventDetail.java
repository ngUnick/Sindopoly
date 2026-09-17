package com.example.Sindopoly_Java.realtime;

import com.example.Sindopoly_Java.model.dto.CardDrawDto;
import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.Objects;

/**
 * Bounded public event detail. Nullable fields are type-specific and deliberately exclude
 * Redis maps, command identifiers, and executable/action-authority data.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record GameEventDetail(
        GameEventDetailType type,
        Integer dice,
        Integer die1,
        Integer die2,
        Integer total,
        Integer fromPosition,
        Integer toPosition,
        Integer squareId,
        Integer amount,
        Integer counterpartyPlayerId,
        Integer nextPlayerId,
        CardDrawDto card) {

    public GameEventDetail {
        Objects.requireNonNull(type, "type");
    }

    public static GameEventDetail diceRolled(int die1, int die2, int total) {
        if (die1 < 1 || die1 > 6 || die2 < 1 || die2 > 6 || total != die1 + die2) {
            throw new IllegalArgumentException("Invalid authoritative dice pair");
        }
        return detail(GameEventDetailType.DICE_ROLLED, total, die1, die2, total,
                null, null, null, null, null, null, null);
    }

    public static GameEventDetail playerMoved(int from, int to) {
        return detail(GameEventDetailType.PLAYER_MOVED, null, null, null, null,
                from, to, null, null, null, null, null);
    }

    public static GameEventDetail landedOn(int squareId) {
        return detail(GameEventDetailType.LANDED_ON_TILE, null, null, null, null,
                null, null, squareId, null, null, null, null);
    }

    public static GameEventDetail propertyAvailable(int squareId, int price) {
        return detail(GameEventDetailType.PROPERTY_AVAILABLE, null, null, null, null,
                null, null, squareId, price, null, null, null);
    }

    public static GameEventDetail propertyPurchased(int squareId, int price) {
        return detail(GameEventDetailType.PROPERTY_PURCHASED, null, null, null, null,
                null, null, squareId, price, null, null, null);
    }

    public static GameEventDetail propertyDeclined(int squareId) {
        return detail(GameEventDetailType.PROPERTY_DECLINED, null, null, null, null,
                null, null, squareId, null, null, null, null);
    }

    public static GameEventDetail rentPaid(int squareId, int amount, int ownerId) {
        return detail(GameEventDetailType.RENT_PAID, null, null, null, null,
                null, null, squareId, amount, ownerId, null, null);
    }

    public static GameEventDetail taxPaid(int squareId, int amount) {
        return detail(GameEventDetailType.TAX_PAID, null, null, null, null,
                null, null, squareId, amount, null, null, null);
    }

    public static GameEventDetail cardDrawn(int squareId, CardDrawDto card) {
        return detail(GameEventDetailType.CARD_DRAWN, null, null, null, null,
                null, null, squareId, card.amount(), null, null, card);
    }

    public static GameEventDetail moneyReceived(int amount) {
        return detail(GameEventDetailType.MONEY_RECEIVED, null, null, null, null,
                null, null, null, amount, null, null, null);
    }

    public static GameEventDetail turnChanged(int nextPlayerId) {
        return detail(GameEventDetailType.TURN_CHANGED, null, null, null, null,
                null, null, null, null, null, nextPlayerId, null);
    }

    public static GameEventDetail playerJailed(int squareId) {
        return detail(GameEventDetailType.PLAYER_JAILED, null, null, null, null,
                null, null, squareId, null, null, null, null);
    }

    public static GameEventDetail playerReleased(int amount) {
        return detail(GameEventDetailType.PLAYER_RELEASED, null, null, null, null,
                null, null, null, amount, null, null, null);
    }

    public static GameEventDetail jailExitAvailable(int amount) {
        return detail(GameEventDetailType.JAIL_EXIT_AVAILABLE, null, null, null, null,
                null, null, null, amount, null, null, null);
    }

    private static GameEventDetail detail(GameEventDetailType type, Integer dice, Integer die1, Integer die2,
                                          Integer total, Integer from, Integer to,
                                          Integer squareId, Integer amount, Integer counterparty,
                                          Integer nextPlayer, CardDrawDto card) {
        return new GameEventDetail(type, dice, die1, die2, total, from, to, squareId, amount,
                counterparty, nextPlayer, card);
    }
}
