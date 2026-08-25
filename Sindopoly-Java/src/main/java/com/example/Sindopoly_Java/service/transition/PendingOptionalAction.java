package com.example.Sindopoly_Java.service.transition;

/** Server-created choice bound to one game, active player, and committed version. */
public record PendingOptionalAction(
        Type type,
        int gameId,
        int playerId,
        long stateVersion,
        Integer squareId,
        int cost,
        boolean declinable) {

    public enum Type {
        PURCHASE_PROPERTY,
        PAY_JAIL_EXIT
    }

    static PendingOptionalAction purchase(int gameId, int playerId, long version, int squareId, int cost) {
        return new PendingOptionalAction(Type.PURCHASE_PROPERTY, gameId, playerId, version, squareId, cost, true);
    }

    static PendingOptionalAction jailPayment(int gameId, int playerId, long version) {
        return new PendingOptionalAction(Type.PAY_JAIL_EXIT, gameId, playerId, version, null, 50, true);
    }

    PendingOptionalAction atVersion(long version) {
        return new PendingOptionalAction(type, gameId, playerId, version, squareId, cost, declinable);
    }

    void validate() {
        if (type == null || gameId <= 0 || playerId <= 0 || stateVersion < 0 || cost <= 0 || !declinable) {
            throw new IllegalArgumentException("Invalid optional-action identity or bounds");
        }
        if (type == Type.PURCHASE_PROPERTY && (squareId == null || squareId < 0
                || squareId >= com.example.Sindopoly_Java.service.core.MovementService.BOARD_SIZE)) {
            throw new IllegalArgumentException("Invalid purchase square");
        }
        if (type == Type.PAY_JAIL_EXIT && (squareId != null || cost != 50)) {
            throw new IllegalArgumentException("Invalid jail-payment option");
        }
    }
}
