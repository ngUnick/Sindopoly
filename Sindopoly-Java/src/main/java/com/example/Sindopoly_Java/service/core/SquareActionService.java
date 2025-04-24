package com.example.Sindopoly_Java.service.core;

import com.example.Sindopoly_Java.model.Square;
import com.example.Sindopoly_Java.model.Square.SquareType;
import com.example.Sindopoly_Java.repository.SquareRepository;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;
import com.example.Sindopoly_Java.model.Card;
import com.example.Sindopoly_Java.model.Card.CardType;


import java.util.Map;
import java.util.Optional;

@Service
public class SquareActionService {

    private final SquareRepository squareRepo;
    private final HashOperations<String,String,String> hashOps;
    private final CardService cardSvc;

    public SquareActionService(SquareRepository repo,
                               RedisTemplate<String,String> redis,
                               CardService cardSvc) {
        this.squareRepo = repo;
        this.hashOps    = redis.opsForHash();
        this.cardSvc    = cardSvc;
    }
    

    /** Executes action and returns (deltaMoney, message) */
    public TileResult execute(int playerId, int position, int gameId) {

        Optional<Square> opt = squareRepo.findById(position);
        if (opt.isEmpty()) return new TileResult(0, "Unknown square");

        Square sq = opt.get();
        SquareType cat = sq.getType();

        switch (cat) {
            case START     -> { return new TileResult(0, "Just visiting Start"); }

            case TAX       -> {                           // simple 200 tax
                return new TileResult(-200, "Paid university tax");
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
                return handleProperty(playerId, sq);
            }

            default -> { return new TileResult(0, "Parking/Empty"); }
        }
    }

    /* ============================================================ */
    /* property handling with ownership + rent                      */
    /* ============================================================ */
    private TileResult handleProperty(int playerId, Square sq) {

        String squareKey = "square:" + sq.getId();
        String owner = hashOps.get(squareKey, "owner");        // may be null

        /* (1) Un-owned tile → auto-buy if player can afford */
        if (owner == null) {
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
        int rent = sq.getRent() == null ? 0 : sq.getRent();
        int playerMoney = readMoney(playerId);

        if (playerMoney < rent) {
            // let TurnService’s bankruptcy handler mark him bankrupt
            writeMoney(playerId, 0);
            return new TileResult(-playerMoney,
                    "Could not pay full rent (" + rent + ") – bankrupt");
        }

        // debit tenant
        writeMoney(playerId, playerMoney - rent);

        // credit owner
        int ownerMoney = readMoney(Integer.parseInt(owner));
        writeMoney(Integer.parseInt(owner), ownerMoney + rent);

        return new TileResult(-rent,
                "Paid rent " + rent + " to player " + owner);
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
    

    /* ------------ small Redis helpers --------------------------- */
    private int readMoney(int pid) {
        String v = hashOps.get("player:" + pid, "money");
        return v == null ? 0 : Integer.parseInt(v);
    }
    private void writeMoney(int pid, int newAmount) {
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
