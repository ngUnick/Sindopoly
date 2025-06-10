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

/**
 * Logic that fires when a player lands on a square (rent, tax, jail,
 * cards …).  If the square triggers a **decision** the optional payload is
 * returned so {@link com.example.Sindopoly_Java.service.orchestrator.TurnService}
 * can pause the turn.
 */
@Service
public class SquareActionService {

    /* injected collaborators */
    private final SquareRepository squareRepo;
    private final CardService      cardSvc;
    private final ValidationUtils  validationUtils;

    /* low-level Redis helper */
    private final HashOperations<String,String,String> hashOps;

    /* ------------------------------------------------------------------ */
    /* constructor                                                        */
    /* ------------------------------------------------------------------ */
    public SquareActionService(SquareRepository repo,
                               RedisTemplate<String,String> redis,
                               CardService cardSvc,
                               ValidationUtils v) {

        this.squareRepo      = repo;
        this.cardSvc         = cardSvc;
        this.validationUtils = v;
        this.hashOps         = redis.opsForHash();   // centralised ops handle
    }

    /* =============================================================== */
    /* public entry point                                              */
    /* =============================================================== */
    public TileResult execute(int playerId, int position, int gameId) {

        Square sq = squareRepo.findById(position)
                              .orElseThrow(() ->
                                      new IllegalArgumentException("Bad square id"));

        return switch (sq.getType()) {

            /* ─── simple tiles ─────────────────────────────────────── */
            case START   -> new TileResult(0,"Just visiting Start");
            case PARKING -> new TileResult(0,"Relaxing at Free Parking");

            /* ─── tax ──────────────────────────────────────────────── */
            case TAX -> {
                int amt = sq.getPrice()==null ? 0 : sq.getPrice();
                writeMoney(playerId, readMoney(playerId) - amt);
                yield new TileResult(-amt,"Paid tax");
            }

            /* ─── card ─────────────────────────────────────────────── */
            case CARD -> applyCard(playerId, cardSvc.drawCard(gameId));

            /* ─── jail squares ─────────────────────────────────────── */
            case JAIL, GOJAIL -> {
                sendPlayerToJail(playerId);
                // now signal “pay jail” is optional
                yield new TileResult(0,
                "Go to Jail – pay fine to get out",
                Optional.of(new JailOffer(gameId, /* your fee, e.g. */ 50)));
            }

            /* ─── properties / rent / offers ─────────────────────── */
            default -> handleProperty(playerId, sq, gameId);
        };
    }

    /* =============================================================== */
    /*  property handling                                              */
    /* =============================================================== */
    private TileResult handleProperty(int playerId, Square sq, int gameId) {

        String skey  = "square:" + sq.getId();
        String owner = hashOps.get(skey,"owner");          // nullable

        /* 1️⃣ Un-owned → send BUY-OFFER */
        if (owner == null) {
            int price   = sq.getPrice()==null ? 0 : sq.getPrice();
            int balance = readMoney(playerId);

            if (balance >= price) {
                return new TileResult(0,
                        "Un-owned property",
                        Optional.of(new BuyOffer(gameId, sq.getId(), price)));
            }
            return new TileResult(0,"Un-owned (insufficient funds)");
        }

        /* 2️⃣ Own property – nothing happens */
        if (owner.equals(String.valueOf(playerId)))
            return new TileResult(0,"Own property – no rent");

        /* 3️⃣ Pay rent to somebody else */
        int rent;
        if (sq.getType() == SquareType.UTILITY) {
            int dice = readLastDice(gameId);
            rent = ownsBothUtilities(owner) ? dice * 10 : dice * 4;

        } else if (sq.getType() == SquareType.TRAIN) {
            rent = rentForTrainsOwned(owner);

        } else {                                 // colour property
            rent = maybeDoubleForFullSet(sq, owner);
        }
        return processRent(playerId, owner, rent);
    }

    /* =============================================================== */
    /* helpers for CARD / JAIL                                         */
    /* =============================================================== */

    private TileResult applyCard(int pid, Card c) {
        return switch (c.getType()) {
            case money -> {
                int delta = (int) c.getAmount();
                writeMoney(pid, readMoney(pid) + delta);
                yield new TileResult(delta,
                        c.getTitle() + " (" + delta + ")");
            }
            case transport -> {
                int dest = (int) c.getAmount();
                hashOps.put("player:" + pid, "position", String.valueOf(dest));
                yield new TileResult(0,
                        c.getTitle() + " – moved to " + dest);
            }
        };
    }

    private void sendPlayerToJail(int pid) {
        hashOps.putAll("player:" + pid, Map.of(
                "position", "10",
                "jail",     "true",
                "jailTime", "3"));
    }

    /* =============================================================== */
    /* rent helpers                                                    */
    /* =============================================================== */

    private TileResult processRent(int tenantId, String ownerId, int rent) {

        int tenantMoney = readMoney(tenantId);
        if (tenantMoney < rent) {
            writeMoney(tenantId, 0);
            return new TileResult(-tenantMoney,
                    "Could not pay full rent – bankrupt");
        }

        writeMoney(tenantId, tenantMoney - rent);
        writeMoney(Integer.parseInt(ownerId),
                   readMoney(Integer.parseInt(ownerId)) + rent);

        return new TileResult(-rent,
                "Paid rent " + rent + " to player " + ownerId);
    }

    private boolean ownsBothUtilities(String owner) {
        return owner.equals(hashOps.get("square:12","owner")) &&
               owner.equals(hashOps.get("square:28","owner"));
    }

    private int rentForTrainsOwned(String owner) {
        int n = 0;
        for (int id : List.of(5, 15, 25, 35))
            if (owner.equals(hashOps.get("square:" + id, "owner"))) n++;
        return switch (n) { case 1 -> 25; case 2 -> 50; case 3 -> 100; default -> 200; };
    }

    private int maybeDoubleForFullSet(Square sq, String owner) {
        List<Integer> ids = squareRepo.findIdsByColour(sq.getType());
        boolean full     = ids.stream()
                              .allMatch(id -> owner.equals(hashOps.get("square:" + id, "owner")));
        int base = sq.getRent() == null ? 0 : sq.getRent();
        return full ? base * 2 : base;
    }

    /* =============================================================== */
    /* tiny Redis utils                                                */
    /* =============================================================== */
    private int readMoney(int pid) {
        String v = hashOps.get("player:" + pid, "money");
        return v == null ? 0 : Integer.parseInt(v);
    }
    private void writeMoney(int pid, int amount) {
        validationUtils.assertNonNegativeMoney(amount);
        hashOps.put("player:" + pid, "money", String.valueOf(amount));
    }
    private int readLastDice(int gid) {
        String v = hashOps.get("game:" + gid, "lastDice");
        return v == null ? 0 : Integer.parseInt(v);
    }

    /* =============================================================== */
    /* DTOs returned to TurnService                                    */
    /* =============================================================== */

    /** Output of every square resolution. */
    public record TileResult(int deltaMoney,
                             String message,
                             Optional<Object> optional) {
        public TileResult(int delta, String msg) { this(delta, msg, Optional.empty()); }
    }

    /** Payload for an optional buy decision. */
    public record BuyOffer(int gameId, int squareId, int price) {}

    /** Payload for an optional pay-jail decision. */
    public record JailOffer(int gameId, int fee) {}

    /* --------------------------------------------------------------- */
    /* called by controller once the client accepted the offer         */
    /* --------------------------------------------------------------- */
    public void completeOptionalBuy(int gameId, int playerId, int squareId) {

        Square sq = squareRepo.findById(squareId + 1)
                              .orElseThrow(() -> new IllegalArgumentException("Bad square"));

        String skey = "square:" + squareId;
        if (hashOps.get(skey, "owner") != null)
            throw new IllegalStateException("Already owned");

        int price = sq.getPrice() == null ? 0 : sq.getPrice();
        int money = readMoney(playerId);
        if (money < price)
            throw new IllegalStateException("Not enough cash");

        writeMoney(playerId, money - price);
        hashOps.put(skey, "owner", String.valueOf(playerId));
    }
}
