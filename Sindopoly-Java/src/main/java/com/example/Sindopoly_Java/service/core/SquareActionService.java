package com.example.Sindopoly_Java.service.core;

import com.example.Sindopoly_Java.model.Square;
import com.example.Sindopoly_Java.model.Square.SquareType;
import com.example.Sindopoly_Java.repository.SquareRepository;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;
import com.example.Sindopoly_Java.model.Card;
import com.example.Sindopoly_Java.model.Card.CardType;
import com.example.Sindopoly_Java.utils.ValidationUtils;


import java.util.Map;
import java.util.Optional;
import java.util.List;

@Service
public class SquareActionService {

    private final SquareRepository squareRepo;
    private final HashOperations<String,String,String> hashOps;
    private final CardService cardSvc;

    private final ValidationUtils validationUtils;

    public SquareActionService(SquareRepository repo,
                               RedisTemplate<String,String> redis,
                               CardService cardSvc,
                               ValidationUtils v) {
        this.squareRepo = repo;
        this.hashOps    = redis.opsForHash();
        this.cardSvc    = cardSvc;
        this.validationUtils = v;
    }
    
    /** Executes action and returns (deltaMoney, message) */
    public TileResult execute(int playerId, int position, int gameId) {

        Optional<Square> opt = squareRepo.findById(position);
        if (opt.isEmpty()) return new TileResult(0, "Unknown square");

        Square sq = opt.get();
        SquareType cat = sq.getType();

        switch (cat) {
            case START     -> { return new TileResult(0, "Just visiting Start"); }

            case TAX -> {
                int amount = sq.getPrice();          // amount is positive (e.g. 200)
                writeMoney(playerId, readMoney(playerId) - amount);
                return new TileResult(-amount, "Paid tax");
            }
            
            case CARD -> {
                Card c = cardSvc.drawCard(gameId);           // use passed id
                return applyCard(playerId, c);
            }

            case JAIL      -> {
                sendPlayerToJail(playerId);
                return new TileResult(0, "Go to Jail !");
            }

            case GOJAIL    -> {
                sendPlayerToJail(playerId);
                return new TileResult(0, "Sent to Jail");
            }

            case BROWN, CYAN, PURPLE, ORANGE, RED, YELLOW, GREEN, BLUE, TRAIN, UTILITY -> {
                return handleProperty(playerId, sq, gameId);
            }

            default -> { return new TileResult(0, "Parking/Empty"); }
        }
    }

    /* ============================================================ */
    /* property handling with ownership + rent                      */
    /* ============================================================ */
    private TileResult handleProperty(int playerId, Square sq, int gameId) {

        String squareKey = "square:" + sq.getId();
        String owner = hashOps.get(squareKey, "owner");        // may be null

        /* (1) Un-owned tile → auto-buy if player can afford */
        if (owner == null) {
            if (hashOps.get(squareKey, "owner") != null)
                throw new IllegalStateException("Property was purchased concurrently."); // This protects against race conditions if two requests hit simultaneously

            int price = sq.getPrice() == null ? 0 : sq.getPrice();
            int playerMoney = readMoney(playerId);

            if (playerMoney >= price) {
                writeMoney(playerId, playerMoney - price);
                hashOps.put(squareKey, "owner", String.valueOf(playerId));
                return new TileResult(-price,
                    "You bought this property for " + price);
            }
            // Can't afford → nothing happens for now
            return new TileResult(0, "Unowned property (insufficient funds)");
        }

        /* (2) Landing on own property */
        if (owner.equals(String.valueOf(playerId))) {
            return new TileResult(0, "Own property – no action");
        }

        /* (3) Pay rent to another player */
        int rent;
        if (sq.getType() == SquareType.UTILITY) {
            int dice = readLastDice(gameId);             // use the method arg
            rent = ownsBothUtilities(owner) ? dice * 10 : dice * 4;
        } else if (sq.getType() == SquareType.TRAIN) {
            rent = rentForTrainsOwned(owner);
        } else {
            rent = maybeDoubleForFullSet(sq, owner);
        }
        return processRentPayment(playerId, owner, rent);
    }


    private TileResult applyCard(int playerId, Card card) {
        return switch (card.getType()) {
            case money     -> {
                int delta = (int) card.getAmount();
                int money = readMoney(playerId) + delta;
                writeMoney(playerId, money);
                yield new TileResult(delta,
                        card.getTitle() + " (" + delta + ")");
            }
            case transport -> {
                int newPos = (int) card.getAmount();
                // update position directly; TurnService will re-execute square action
                hashOps.put("player:" + playerId, "position", String.valueOf(newPos));
                yield new TileResult(0,
                        card.getTitle() + " – moved to square " + newPos);
            }
        };
    }
    
    private TileResult processRentPayment(int tenantId, String ownerId, int rent) {
        int tenantMoney = readMoney(tenantId);
    
        if (tenantMoney < rent) {
            writeMoney(tenantId, 0);
            return new TileResult(-tenantMoney,
                    "Could not pay full rent (" + rent + ") – bankrupt");
        }
    
        writeMoney(tenantId, tenantMoney - rent);
        int ownerMoney = readMoney(Integer.parseInt(ownerId));
        writeMoney(Integer.parseInt(ownerId), ownerMoney + rent);
    
        return new TileResult(-rent,
                "Paid rent " + rent + " to player " + ownerId);
    }
    

    /* ----- rent helpers ----------------------------------------- */

    private boolean ownsBothUtilities(String ownerId) {
        // Monopoly board indices for the two utilities (adjust if different)
        return ownerId.equals(hashOps.get("square:12","owner")) &&
            ownerId.equals(hashOps.get("square:28","owner"));
    }

    private int rentForTrainsOwned(String ownerId) {
        int count = 0;
        for (int id : List.of(5,15,25,35)) {
            if (ownerId.equals(hashOps.get("square:" + id,"owner"))) count++;
        }
        return switch (count) {
            case 1 -> 25;
            case 2 -> 50;
            case 3 -> 100;
            default -> 200;   // owns all 4
        };
    }

    private int maybeDoubleForFullSet(Square sq, String ownerId) {
        SquareType colour = sq.getType();

        /* fetch all squares of same colour from DB once */
        List<Integer> sameColourIds = squareRepo.findIdsByColour(colour);
        boolean fullSet = sameColourIds.stream()
                .allMatch(id -> ownerId.equals(hashOps.get("square:" + id,"owner")));

        int base = sq.getRent() == null ? 0 : sq.getRent();
        return fullSet ? base * 2 : base;
    }

    private int readLastDice(int gameId) {
        String v = hashOps.get("game:" + gameId, "lastDice");
        return v == null ? 0 : Integer.parseInt(v);
    }


    /* ------------ small Redis helpers --------------------------- */
    private int readMoney(int pid) {
        String v = hashOps.get("player:" + pid, "money");
        return v == null ? 0 : Integer.parseInt(v);
    }
    private void writeMoney(int pid, int newAmount) {
        validationUtils.assertNonNegativeMoney(newAmount);
        hashOps.put("player:" + pid, "money", String.valueOf(newAmount));
    }
    


    private void sendPlayerToJail(int playerId) {
        String key = "player:" + playerId;
        hashOps.putAll(key, Map.of(
                "position", "10",        // jail tile
                "jail", "true",
                "jailTime", "3"
        ));
    }

    /* small record to bubble back results */
    public record TileResult(int deltaMoney, String message) {}
}
