package com.example.Sindopoly_Java.service.core;

import com.example.Sindopoly_Java.model.Card;
import com.example.Sindopoly_Java.model.Square;
import com.example.Sindopoly_Java.model.Square.SquareType;
import com.example.Sindopoly_Java.repository.SquareRepository;
import com.example.Sindopoly_Java.service.GameStateService;
import com.example.Sindopoly_Java.utils.ValidationUtils;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.util.*;
import com.example.Sindopoly_Java.model.dto.SquareEventDto;
import com.example.Sindopoly_Java.model.dto.ApplyResultDto;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class SquareActionService {

    private final SquareRepository      squareRepo;
    private final CardService           cardSvc;
    private final ValidationUtils       validationUtils;
    private final HashOperations<String,String,String> hashOps;
    private final ObjectMapper mapper;

    
    @Autowired
    private GameStateService gameStateService; 

    public SquareActionService(
        SquareRepository repo,
        RedisTemplate<String,String> redis,
        CardService cardSvc,
        ValidationUtils v,
        ObjectMapper mapper
    ) {
        this.squareRepo      = repo;
        this.cardSvc         = cardSvc;
        this.validationUtils = v;
        this.hashOps         = redis.opsForHash();
        this.mapper        = mapper;
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
                int tax = Math.abs(Optional.ofNullable(sq.getPrice()).orElse(0));
                return SquareEventDto.justInfo("tax", "Pay tax: €" + tax, tax);

            case CARD:
                Card c = cardSvc.drawCard(gameId);
                return SquareEventDto.card(
                    c.getTitle(),
                    c.getType().toString(),         // convert enum → String
                    (int) Math.round(c.getAmount()) // cast or round your float → int
                );

            case JAIL:
                return SquareEventDto.justInfo("jail", "Just visiting", 0);

            case GOJAIL:
                return SquareEventDto.justInfo("goToJail", "Go to Jail", 0);

            default:
                return peekProperty(playerId, sq, gameId);
        }
    }

    private SquareEventDto peekProperty(int playerId, Square sq, int gameId) {
        Integer ownerId = findOwner(gameId, sq.getId());
        String owner = ownerId == null ? null : String.valueOf(ownerId);   

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
            return rentForTrainsOwned(gameId, owner);
        }
        // color properties: base rent, doubled if full set
        else {
            return maybeDoubleForFullSet(gameId, sq, owner);
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

    private int rentForTrainsOwned(Integer gameId, String owner) {
        int n = 0;
        for (int id : List.of(5, 15, 25, 35))
            if (owner.equals(findOwner(gameId, id).toString())) n++;
        return switch (n) {
        case 1 -> 25;
        case 2 -> 50;
        case 3 -> 100;
        default -> 200;
        };
    }

    private int maybeDoubleForFullSet(Integer gameId, Square sq, String owner) {
        List<Integer> ids = squareRepo.findIdsByColour(sq.getType());
        boolean full = ids.stream()
            .allMatch(id -> owner.equals(findOwner(gameId, id).toString()));
        int base = sq.getRent() == null ? 0 : sq.getRent();
        return full ? base * 2 : base;
    }


    // ───────────────────────────────────────────────────────────────
    // 2) APPLY STAGE: client chose an action, now mutate state
    // ───────────────────────────────────────────────────────────────
    // public ApplyResultDto applySquareEvent(
    //     int playerId,
    //     boolean yes
    // ) {
    //     switch (opt.getType()) {
    //         case "buyOffer":
    //             if (yes) {
    //             // buy logic
    //             buyProperty(playerId, opt.getSquareId(), opt.getPrice());
    //             }
    //             // if no, we simply skip buying
    //             break;

    //         default:
    //             // for rent/tax/cards/goToJail/parking etc. yes==true means “OK” so apply it:
    //             applyAutomatic(opt);
    //             break;
    //         }

    //         // clear the pending in Redis
    //         clearOptionalAction(gameId);
    // }

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
    // private void buyProperty(int playerId, int squareId, int price) {
    //     int balance = readMoney(playerId);
    //     if (balance < price) {
    //         throw new IllegalStateException("Not enough funds to buy square " + squareId);
    //     }
    //     // deduct money
    //     writeMoney(playerId, balance - price);
    //     // set the owner of the square in Redis
    //     hashOps.put("square:" + squareId, "owner", String.valueOf(playerId));
    // }


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

     /** for buyOffer: squareId is the board position of the property */
    public void completeOptionalBuy(int gameId, int playerId, int squareId) {
        // 1) Deduct money & set square owner
        Square sq = squareRepo.findById(squareId)
                    .orElseThrow(() -> new IllegalArgumentException("Bad square id: " + squareId));
        int price = Optional.ofNullable(sq.getPrice()).orElse(0);

        int bal = Integer.parseInt(hashOps.get("player:" + playerId, "money"));
        if (bal < price) throw new IllegalStateException("Insufficient funds");
        hashOps.put("player:" + playerId, "money", String.valueOf(bal - price));

        // 2) Append to the player’s properties list
        String propsJson = hashOps.get("player:" + playerId, "properties");
        List<Integer> props;
        try {
            props = mapper.readValue(
                propsJson == null ? "[]" : propsJson,
                new TypeReference<List<Integer>>(){}
            );
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Malformed properties JSON", e);
        }
        if (!props.contains(squareId)) {
            props.add(squareId);
        }
        try {
            String updated = mapper.writeValueAsString(props);
            hashOps.put("player:" + playerId, "properties", updated);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Cannot serialize properties list", e);
        }
    }

    /** for jailOffer: fee extracted from ev.getFee() */
    public void completeOptionalJail(int gameId, int playerId, int fee) {
        int bal = readMoney(playerId);
        if (bal < fee) throw new IllegalStateException("Insufficient funds");
        writeMoney(playerId, bal - fee);
        // This compatibility helper now mirrors the approved pay-to-exit rule.
        hashOps.putAll("player:" + playerId, Map.of(
          "jail",     "false",
          "jailTime", "0"
        ));
    }

    /** applies all other automatic effects based on ev.getType() and ev.getAmount() */
    public void applyAutomatic(SquareEventDto ev, int playerId, int gameId) {
        switch (ev.getType()) {
          case "rentDue" -> {
            int rent = ev.getAmount();
            writeMoney(playerId, readMoney(playerId) - rent);
            int owner = Integer.parseInt(ev.getOwnerId());
            writeMoney(owner, readMoney(owner) + rent);
          }
          case "money" -> writeMoney(playerId, readMoney(playerId) + ev.getAmount());
          case "transport" ->
            hashOps.put("player:" + playerId,
                        "position",
                        String.valueOf(ev.getAmount()));
          case "tax" -> writeMoney(playerId, readMoney(playerId) - Math.abs(ev.getAmount()));
          case "goToJail" -> {
            hashOps.putAll("player:" + playerId, Map.of(
              "position", "10",
              "jail",     "true",
              "jailTime", "3"
            ));
          }
          // parking, jail (no-op), own property, etc.
          default -> {}
        }
    }

  // helper to move someone to jail
  private void sendPlayerToJail(int pid) {
    hashOps.putAll("player:" + pid, Map.of(
      "position", "10",
      "jail",     "true",
      "jailTime", "3"
    ));
  }

    // 1) helper to fetch and parse a player's properties
    private List<Integer> fetchProperties(int playerId) {
        String json = hashOps.get("player:" + playerId, "properties");
        try {
            return mapper.readValue(
                json == null ? "[]" : json,
                new TypeReference<List<Integer>>() {}
            );
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Bad properties JSON for player " + playerId, e);
        }
    }

    // 2) helper to find the owner by scanning all players in the game
    private Integer findOwner(int gameId, int squareId) {
        Set<String> pids = gameStateService.getPlayersInGame(gameId);
        for (String pidStr : pids) {
            int pid = Integer.parseInt(pidStr);
            if (fetchProperties(pid).contains(squareId)) {
                return pid;
            }
        }
        return null;
    }

}
