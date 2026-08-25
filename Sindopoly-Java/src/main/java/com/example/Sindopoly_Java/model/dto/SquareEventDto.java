package com.example.Sindopoly_Java.model.dto;

import java.util.Optional;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * Describes what happens (or what choice is pending) when a player lands on a square.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class SquareEventDto {
    private String type;         // e.g. "buyOffer","rentDue","card","jailOffer","tax","start",…
    private String message;      // text to display
    private int    amount;       // signed card effect, positive domain cost, or destination
    private String ownerId;      // for rentDue
    private Integer squareId;    // for buyOffer
    private Integer price;       // for buyOffer
    private Integer fee;         // for jailOffer
    private String cardType;     // "money" or "transport"


    public SquareEventDto() {}

    // Full constructor
    public SquareEventDto(String type, String message, int amount,
                          String ownerId, Integer squareId,
                          Integer price, Integer fee, String cardType) {
        this.type      = type;
        this.message   = message;
        this.amount    = amount;
        this.ownerId   = ownerId;
        this.squareId  = squareId;
        this.price     = price;
        this.fee       = fee;
        this.cardType  = cardType;
    }

    // Getters & setters
    public String getType()       { return type; }
    public String getMessage()    { return message; }
    public int    getAmount()     { return amount; }
    public String getOwnerId()    { return ownerId; }
    public Integer getSquareId()  { return squareId; }
    public Integer getPrice()     { return price; }
    public Integer getFee()       { return fee; }
    public String getCardType()   { return cardType; }

    public void setType(String type)           { this.type      = type; }
    public void setMessage(String message)     { this.message   = message; }
    public void setAmount(int amount)          { this.amount    = amount; }
    public void setOwnerId(String ownerId)     { this.ownerId   = ownerId; }
    public void setSquareId(Integer squareId)  { this.squareId  = squareId; }
    public void setPrice(Integer price)        { this.price     = price; }
    public void setFee(Integer fee)            { this.fee       = fee; }
    public void setCardType(String cardType)   { this.cardType  = cardType; }

    // Factory methods for peek-stage
    public static SquareEventDto justInfo(String type, String msg, int amt) {
        return new SquareEventDto(type, msg, amt, null, null, null, null, null);
    }
    public static SquareEventDto buyOffer(int sqId, int price) {
        return new SquareEventDto("buyOffer", "Buy for €" + price, 0,
            null, sqId, price, null, null);
    }
    public static SquareEventDto rentDue(String owner, int rent) {
        return new SquareEventDto("rentDue", "Pay rent €" + rent, rent,
            owner, null, null, null, null);
    }
    public static SquareEventDto jailOffer(int fee) {
        return new SquareEventDto("jailOffer", "Pay jail €" + fee + " to get out",
            0, null, null, null, fee, null);
    }
    public static SquareEventDto card(String title, String cardType, int amt) {
        return new SquareEventDto("card", title, amt, null, null, null, null, cardType);
    }
}
