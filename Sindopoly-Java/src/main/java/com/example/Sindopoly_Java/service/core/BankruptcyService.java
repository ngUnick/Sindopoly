package com.example.Sindopoly_Java.service.core;

public class BankruptcyService {

    /** Returns true if player is bankrupt according to current rule-set */
    public boolean isBankrupt(int money) {
        return money <= 0;                     // TODO: add property liquidation later
    }
}
