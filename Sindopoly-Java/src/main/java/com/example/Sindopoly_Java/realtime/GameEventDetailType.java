package com.example.Sindopoly_Java.realtime;

/** UI-meaningful facts produced by one committed game transition. */
public enum GameEventDetailType {
    DICE_ROLLED,
    PLAYER_MOVED,
    LANDED_ON_TILE,
    PROPERTY_AVAILABLE,
    PROPERTY_PURCHASED,
    PROPERTY_DECLINED,
    RENT_PAID,
    TAX_PAID,
    CARD_DRAWN,
    MONEY_RECEIVED,
    TURN_CHANGED,
    PLAYER_JAILED,
    PLAYER_RELEASED,
    JAIL_EXIT_AVAILABLE
}
