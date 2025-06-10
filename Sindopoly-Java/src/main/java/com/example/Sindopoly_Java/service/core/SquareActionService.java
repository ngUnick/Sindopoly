package com.example.Sindopoly_Java.service.core;

import com.example.Sindopoly_Java.model.Card;
import com.example.Sindopoly_Java.model.Square;
import com.example.Sindopoly_Java.model.Square.SquareType;
import com.example.Sindopoly_Java.repository.SquareRepository;
import com.example.Sindopoly_Java.utils.ValidationUtils;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.util.*;
import com.example.Sindopoly_Java.model.dto.SquareEventDto;
import com.example.Sindopoly_Java.model.dto.ApplyResultDto;

@Service
public class SquareActionService {

    private final SquareRepository      squareRepo;
    private final CardService           cardSvc;
    private final ValidationUtils       validationUtils;
    private final HashOperations<String,String,String> hashOps;

    public SquareActionService(
        SquareRepository repo,
        RedisTemplate<String,String> redis,
        CardService cardSvc,
        ValidationUtils v
    ) {
        this.squareRepo      = repo;
        this.cardSvc         = cardSvc;
        this.validationUtils = v;
        this.hashOps         = redis.opsForHash();
    }

    // ───────────────────────────────────────────────────────────────
    // 1) PEEK STAGE: figure out what event/modal to show
    // ───────────────────────────────────────────────────────────────
    public SquareEventDto peekSquare(int playerId, int position, int gameId) {
        Square sq = squareRepo.findById(position)
            .orElseThrow(() -> new IllegalArgumentException("Bad square id"));

        switch (sq.getType()) {
            case START:
                return SquareEventDto.justInfo("start", "Visiting Start", 0);

            case PARKING:
                return SquareEventDto.justInfo("parking", "Free Parking", 0);

            case TAX:
                int tax = Optional.ofNullable(sq.getPrice()).orElse(0);
                return SquareEventDto.justInfo("tax", "Pay tax: €" + tax, -tax);

            case CARD:
                Card c = cardSvc.drawCard(gameId);
                return SquareEventDto.card(
                    c.getTitle(),
                    c.getType().toString(),         // convert enum → String
                    (int) Math.round(c.getAmount()) // cast or round your float → int
                );

            case JAIL:
            case GOJAIL:
                int fee = 50;  // or sq.getFee()
                return SquareEventDto.jailOffer(fee);

            default:
                return peekProperty(playerId, sq, gameId);
        }
    }

    private SquareEventDto peekProperty(int playerId, Square sq, int gameId) {
        String skey = "square:" + sq.getId();
        String owner = hashOps.get(skey, "owner");

        if (owner == null) {
            int price = Optional.ofNullable(sq.getPrice()).orElse(0);
            int balance = readMoney(playerId);
            if (balance >= price) {
                return SquareEventDto.buyOffer(sq.getId(), price);
            } else {
                return SquareEventDto.justInfo("no-money", "Cannot afford: €" + price, 0);
            }
        }

        if (owner.equals(String.valueOf(playerId))) {
            return SquareEventDto.justInfo("own", "Your own property", 0);
        }

        int rent = calculateRent(owner, sq, gameId);
        return SquareEventDto.rentDue(owner, rent);
    }

    private int calculateRent(String owner, Square sq, int gameId) {
        // utilities: 4× or 10× the last dice roll
        if (sq.getType() == SquareType.UTILITY) {
            int dice = readLastDice(gameId);
            return ownsBothUtilities(owner)
                    ? dice * 10
                    : dice * 4;
        }
        // railroads/trains
        else if (sq.getType() == SquareType.TRAIN) {
            return rentForTrainsOwned(owner);
        }
        // color properties: base rent, doubled if full set
        else {
            return maybeDoubleForFullSet(sq, owner);
        }
    }

    /** returns last dice rolled for this game, or 0 if missing */
    private int readLastDice(int gid) {
        String v = hashOps.get("game:" + gid, "lastDice");
        return v == null ? 0 : Integer.parseInt(v);
    }

    private boolean ownsBothUtilities(String owner) {
        return owner.equals(hashOps.get("square:12","owner"))
            && owner.equals(hashOps.get("square:28","owner"));
    }

    private int rentForTrainsOwned(String owner) {
        int n = 0;
        for (int id : List.of(5, 15, 25, 35))
            if (owner.equals(hashOps.get("square:" + id, "owner"))) n++;
        return switch (n) {
        case 1 -> 25;
        case 2 -> 50;
        case 3 -> 100;
        default -> 200;
        };
    }

    private int maybeDoubleForFullSet(Square sq, String owner) {
        List<Integer> ids = squareRepo.findIdsByColour(sq.getType());
        boolean full = ids.stream()
            .allMatch(id -> owner.equals(hashOps.get("square:" + id, "owner")));
        int base = sq.getRent() == null ? 0 : sq.getRent();
        return full ? base * 2 : base;
    }


    // ───────────────────────────────────────────────────────────────
    // 2) APPLY STAGE: client chose an action, now mutate state
    // ───────────────────────────────────────────────────────────────
    public ApplyResultDto applySquareEvent(
        int playerId,
        SquareEventDto event,
        String action  // "buy", "pass", "ok"
    ) {
        switch (event.getType()) {
            case "tax":
                writeMoney(playerId, event.getAmount());
                return new ApplyResultDto(readMoney(playerId), List.of(), "Paid tax");

            case "start":
            case "parking":
                return new ApplyResultDto(readMoney(playerId), List.of(), event.getMessage());

            case "card":
                return applyCardEvent(playerId, event);

            case "jailOffer":
                if ("buy".equals(action)) {
                    payJailFee(playerId, event.getFee());
                    return new ApplyResultDto(readMoney(playerId), List.of(), "Paid jail €" + event.getFee());
                } else {
                    // maybe let them stay? or skip turn?
                    return new ApplyResultDto(readMoney(playerId), List.of(), "Stayed in Jail");
                }

            case "buyOffer":
                if ("buy".equals(action)) {
                    buyProperty(playerId, event.getSquareId(), event.getPrice());
                    return new ApplyResultDto(readMoney(playerId),
                         List.of(event.getSquareId()), "Bought property");
                } else {
                    return new ApplyResultDto(readMoney(playerId), List.of(), "Declined purchase");
                }

            case "rentDue":
                writeMoney(playerId, readMoney(playerId) - event.getAmount());
                writeMoney(Integer.parseInt(event.getOwnerId()), readMoney(Integer.parseInt(event.getOwnerId())) + event.getAmount());
                return new ApplyResultDto(readMoney(playerId), List.of(), "Paid rent €" + event.getAmount());

            default:
                throw new IllegalArgumentException("Unknown event type: " + event.getType());
        }
    }

    private ApplyResultDto applyCardEvent(int playerId, SquareEventDto event) {
        // mirror your old applyCard(): money-amount or movement.
        if ("money".equals(event.getCardType())) {
            writeMoney(playerId, readMoney(playerId) + event.getAmount());
            return new ApplyResultDto(readMoney(playerId), List.of(), event.getMessage());
        } else {
            // movement card
            hashOps.put("player:" + playerId, "position", String.valueOf(event.getAmount()));
            return new ApplyResultDto(readMoney(playerId), List.of(), event.getMessage());
        }
    }

    /**
     * Deducts the purchase price from the player and sets ownership in Redis.
     */
    private void buyProperty(int playerId, int squareId, int price) {
        int balance = readMoney(playerId);
        if (balance < price) {
            throw new IllegalStateException("Not enough funds to buy square " + squareId);
        }
        // deduct money
        writeMoney(playerId, balance - price);
        // set the owner of the square in Redis
        hashOps.put("square:" + squareId, "owner", String.valueOf(playerId));
    }


    // ───────────────────────────────────────────────────────────────
    // 3) Redis helpers (unchanged)
    // ───────────────────────────────────────────────────────────────
    private int readMoney(int pid) {
        String v = hashOps.get("player:" + pid, "money");
        return v == null ? 0 : Integer.parseInt(v);
    }

    private void writeMoney(int pid, int amount) {
        validationUtils.assertNonNegativeMoney(amount);
        hashOps.put("player:" + pid, "money", String.valueOf(amount));
    }

    private void payJailFee(int pid, int fee) {
        int m = readMoney(pid);
        if (m < fee) throw new IllegalStateException("Insufficient funds");
        writeMoney(pid, m - fee);
        hashOps.put("player:" + pid, "jail", "false");
    }

}
