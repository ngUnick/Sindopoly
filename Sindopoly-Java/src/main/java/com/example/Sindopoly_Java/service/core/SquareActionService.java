package com.example.Sindopoly_Java.service.core;

import com.example.Sindopoly_Java.model.Square;
import com.example.Sindopoly_Java.model.Square.SquareType;
import com.example.Sindopoly_Java.repository.SquareRepository;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.Optional;

@Service
public class SquareActionService {

    private final SquareRepository squareRepo;
    private final HashOperations<String,String,String> hashOps;

    public SquareActionService(SquareRepository repo,
                               RedisTemplate<String,String> redis) {
        this.squareRepo = repo;
        this.hashOps    = redis.opsForHash();
    }

    /** Executes action and returns (deltaMoney, message) */
    public TileResult execute(int playerId, int position) {

        Optional<Square> opt = squareRepo.findById(position);
        if (opt.isEmpty()) return new TileResult(0, "Unknown square");

        Square sq = opt.get();
        SquareType cat = sq.getType();

        switch (cat) {
            case START     -> { return new TileResult(0, "Just visiting Start"); }

            case TAX       -> {                           // simple 200 tax
                return new TileResult(-200, "Paid university tax");
            }

            case CARD      -> {
                // TODO: draw card from deck later
                return new TileResult(+100, "Card: scholarship +100");
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

    private TileResult handleProperty(int playerId, Square sq) {
        String squareKey = "square:" + sq.getId();
        String owner = hashOps.get(squareKey, "owner");

        if (owner == null) {            // unowned → offer buy
            // For MVP auto-buy if player has cash
            return new TileResult(-sq.getPrice(),
                    "Bought property for " + sq.getPrice());
        }

        if (owner.equals(String.valueOf(playerId))) {
            return new TileResult(0, "Your own property");
        }

        // pay rent
        int rent = sq.getRent();
        // Add rent to owner’s money (simplified)
        String ownerPlayerKey = "player:" + owner;
        Integer ownerMoney = Integer.valueOf(
                hashOps.get(ownerPlayerKey, "money"));
        hashOps.put(ownerPlayerKey, "money",
                String.valueOf(ownerMoney + rent));

        return new TileResult(-rent, "Paid rent " + rent + " to P" + owner);
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
