package com.example.Sindopoly_Java.service.orchestrator;

import com.example.Sindopoly_Java.model.dto.ActionRequestDto;
import com.example.Sindopoly_Java.model.dto.ActionResultDto;
import com.example.Sindopoly_Java.model.dto.ApplyResultDto;
import com.example.Sindopoly_Java.model.dto.SquareEventDto;
import com.example.Sindopoly_Java.model.dto.ThrowResultDto;
import com.example.Sindopoly_Java.service.GameStateService;
import com.example.Sindopoly_Java.service.PlayerStateService;
import com.example.Sindopoly_Java.service.core.*;
import com.example.Sindopoly_Java.service.core.MovementService.MovementResult;
import com.example.Sindopoly_Java.model.dto.SquareEventDto;
import com.example.Sindopoly_Java.utils.ValidationUtils;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class TurnService {

    private final GameStateService      gameStateSvc;
    private final PlayerStateService    playerStateSvc;
    private final ValidationUtils       validationUtils;
    private final DiceService           diceSvc;
    private final MovementService       moveSvc      = new MovementService();
    private final BankruptcyService     bankSvc;
    private final SquareActionService   squareActionSvc;
    private final SimpMessagingTemplate broker;
    private final ObjectMapper          mapper       = new ObjectMapper();

    private static final String K_OPTIONAL = "optionalAction";
    private static final String K_DEADLINE = "optionalDeadline";

    /**
     * Main entry: roll dice, move pawn, apply tile logic, handle optional events and rotate turn.
     */
    public ThrowResultDto throwDice(int gameId, int playerId) {
        // 0. Guard rails
        validationUtils.validatePlayerExists(playerId);
        Map<String,String> game = gameStateSvc.getGame(gameId);
        if (!"inProgress".equalsIgnoreCase(game.get("status"))) {
            throw new IllegalStateException("Game not in progress.");
        }
        validationUtils.ensurePlayerTurn(gameId, playerId, game);
        if (game.containsKey(K_OPTIONAL)) {
            throw new IllegalStateException("Finish your pending action first.");
        }

        // Clear AFK
        var pstate = playerStateSvc.getPlayerState(playerId);
        pstate.put("afk", "false");
        playerStateSvc.savePlayerState(playerId, pstate);

        int money    = asInt(pstate.get("money"));
        int pos      = asInt(pstate.get("position"));
        boolean inJail = Boolean.parseBoolean(pstate.get("jail").toString());
        int jailTime   = asInt(pstate.get("jailTime"));

        // 1. Early bankruptcy
        if (bankSvc.isBankrupt(money)) {
            handleFullBankruptcy(gameId, playerId, pstate);
            rotateTurn(gameId);
            return new ThrowResultDto(0, -1, false, -2, -1);
        }

        // 2. Jail logic
        if (inJail) {
            if (jailTime > 1) {
                jailTime--;
                pstate.put("jailTime", jailTime);
                playerStateSvc.savePlayerState(playerId, pstate);
                rotateTurn(gameId);
                return new ThrowResultDto(0, -1, false, -1, jailTime);
            }
            // Release from jail
            pstate.put("jail", "false");
            pstate.put("jailTime", String.valueOf(jailTime));
        }

        // 3. Roll & compute move (in‐memory, not yet saved)
        var dm = performDiceMove(gameId, playerId, pos);
        int dice = dm.dice();
        MovementResult mv = dm.movement();
        pos = mv.newPosition();
        if (mv.passedGo()) {
            money += 200;
        }

        // 4. Peek the square for any optional follow-up
        SquareEventDto ev = squareActionSvc.peekSquare(playerId, pos, gameId);

        // 4a. Serialize optional event, but guard against errors
        String optionalJson = null;
        try {
            optionalJson = mapper.writeValueAsString(ev);
        } catch (JsonProcessingException e) {
            // Log and continue; we don't want to abort the entire turn
            System.err.printf(
                "Warning: could not serialize optional event for game %d player %d: %s%n",
                gameId, playerId, e.getMessage()
            );
        }

        // 5. Commit state and optional payload in one go
        pstate.put("position", String.valueOf(pos));
        pstate.put("money",    String.valueOf(money));
        playerStateSvc.savePlayerState(playerId, pstate);
        if (optionalJson != null) {
            gameStateSvc.setGameField(gameId, K_OPTIONAL, optionalJson);
        }

        // 6. Map ev.getType() → (squareType, data)
        int squareType, data;
        switch (ev.getType()) {
            case "transport" -> {
                squareType = 1;
                data       = ev.getAmount();
            }
            case "money" -> {
                squareType = 2;
                data       = (int) ev.getAmount();
            }
            case "buyOffer" -> {
                squareType = 5;
                data       = ev.getPrice();
            }
            case "rentDue" -> {
                squareType = 3;
                data       = ev.getAmount();
            }
            case "tax" -> {
                squareType = 6;
                data       = ev.getAmount();
            }
            case "goToJail" -> {
                squareType = 7;
                data       = -1;
            }
            case "jail" -> {
                squareType = 8;
                data       = -1;
            }
            case "parking" -> {
                squareType = 9;
                data       = -1;
            }
            default -> {
                // includes “own” or any informational tile
                squareType = 4;
                data       = -1;
            }
        }

        // 7. Return DTO
        return new ThrowResultDto(
            dice,
            pos,
            mv.passedGo(),
            squareType,
            data
        );
    }






    /** STEP 2: consume the event stored by throwDice and finish turn */
    public ActionResultDto applyAction(ActionRequestDto req) {
        int gameId   = req.getGameId();
        int playerId = req.getPlayerId();
        boolean yes  = req.getYes();

        // 1) fetch & deserialize the full SquareEventDto
        String raw = gameStateSvc.getGame(gameId).get(K_OPTIONAL);
        if (raw == null) throw new IllegalStateException("No pending action");

        // **DEBUG**: dump it out so we can inspect
        System.out.println("🔔 Pending event JSON: " + raw);

        SquareEventDto ev;
        try {
            ev = mapper.readValue(raw, SquareEventDto.class);
        } catch (JsonProcessingException e) {
            String msg = e.getOriginalMessage() != null
                ? e.getOriginalMessage()
                : e.getMessage();
            throw new IllegalStateException("Bad pending event: " + msg, e);
        }

        // 2) dispatch on ev.getType()
        switch (ev.getType()) {
        case "buyOffer":
            if (yes) {
            squareActionSvc.completeOptionalBuy(
                gameId,
                playerId,
                ev.getSquareId()  // squareId is just the board position
            );
            }
            break;

        case "jailOffer":
            if (yes) {
            squareActionSvc.completeOptionalJail(
                gameId,
                playerId,
                ev.getFee()       // fee from the jailOffer
            );
            }
            break;

        default:
            if (yes) {
            squareActionSvc.applyAutomatic(
                ev,              // full DTO (contains type, amount, ownerId, etc.)
                playerId,
                gameId
            );
            }
            break;
        }

        // 3) clear + rotate + broadcast
        gameStateSvc.clearOptionalAction(gameId);
        rotateTurn(gameId);
        broker.convertAndSend(
        "/topic/game/" + gameId,
        Map.of("event","actionCompleted",
                "next", gameStateSvc.getGame(gameId).get("playerTurn"))
        );

        // 4) build response
        int next       = Integer.parseInt(gameStateSvc.getGame(gameId).get("playerTurn"));
        Map<String,Object> p = playerStateSvc.getPlayerState(playerId);
        int newBalance = Integer.parseInt(p.get("money").toString());
        return new ActionResultDto(newBalance, List.of(), next);
    }










    private static record OptionalAction(
        String type,        // e.g. "buyOffer","payJail",…
        int    playerId,
        Integer squareId,   // nullable
        Integer price,      // nullable (for buyOffer)
        Integer fee         // nullable (for payJail)
    ) {}




    /**
     * Called by external schedulers or controllers to abort the current
     * pending action (if any), advance the turn, reset timers, and broadcast.
     */
    public void finishTurn(int gameId) {
        // 1) Clear any pending “optional” action
        gameStateSvc.setGameField(gameId, K_OPTIONAL, null);
        gameStateSvc.setGameField(gameId, K_DEADLINE, null);

        // 2) Reset the per-turn timers and rotate to the next player
        Map<String,String> game = gameStateSvc.getGame(gameId);
        finishAndRotate(gameId, game);

        // 3) Publish a “turnFinished” event so clients know about the skip
        broker.convertAndSend(
        "/topic/game/" + gameId,
        Map.of("event","turnFinished")
        );

        // 4) Now check for end-of-game and, if so, broadcast it
        if (gameStateSvc.checkEndCondition(gameId)) {
        // assume your gameHash has written the winner into "winner"
        String winnerId = gameStateSvc.getGame(gameId).get("winner");
        broker.convertAndSend(
            "/topic/game/" + gameId,
            Map.of(
            "event",  "gameOver",
            "winner", winnerId
            )
        );
    }
    }

    /**
    * Applies the client’s “buy” / “pass” / “ok” action for a pending optional,
    * clears it, rotates the turn, and returns the new state.
    */
    // public ActionResultDto handleAction(ActionRequestDto req) {
    //     // 1) sanity: path params match body
    //     if (req.getGameId() != req.getGameId() || req.getPlayerId() != req.getPlayerId()) {
    //         throw new IllegalArgumentException("Mismatched request");
    //     }

    //     // 2) deserialize and apply
    //     String raw = gameStateSvc.getGame(req.getGameId()).get(K_OPTIONAL);
    //     if (raw == null) throw new IllegalStateException("No pending action");
    //     SquareEventDto event;
    //     try {
    //         event = mapper.readValue(raw, SquareEventDto.class);
    //     } catch (Exception e) {
    //         throw new IllegalStateException("Bad optional payload", e);
    //     }

    //     // 3) apply business logic
    //     ApplyResultDto ar = squareActionSvc.applySquareEvent(
    //         req.getPlayerId(),
    //         event,
    //         req.getAction()
    //     );

    //     // 4) clear optional + rotate
    //     gameStateSvc.setGameField(req.getGameId(), K_OPTIONAL, null);
    //     rotateTurn(req.getGameId());

    //     // 5) broadcast
    //     broker.convertAndSend(
    //         "/topic/game/" + req.getGameId(),
    //         Map.of("event", "actionCompleted")
    //     );

    //     // 6) build result DTO
    //     int next = Integer.parseInt(
    //         gameStateSvc.getGame(req.getGameId()).get("playerTurn")
    //     );
    //     return new ActionResultDto(ar.getNewBalance(), ar.getAcquiredProperties(), next);
    // }


    //────────────────────────────────────────────────
    // Perform dice roll and movement in one helper
    //────────────────────────────────────────────────
    private DiceMoveResult performDiceMove(int gameId, int playerId, int position) {
        int dice = diceSvc.roll();
        gameStateSvc.setGameField(gameId, "lastDice", String.valueOf(dice));
        MovementResult mv = moveSvc.move(position, dice);
        return new DiceMoveResult(dice, mv);
    }
    private record DiceMoveResult(int dice, MovementResult movement) {}

    //────────────────────────────────────────────────
    // Create response and broadcast it
    //────────────────────────────────────────────────
    private TurnResponse createResponse(
        int   gameId,
        int   dice,
        int   newPos,
        int   balance,
        boolean passedGo,
        boolean wasInJail,
        boolean wentBankrupt,
        String message,
        boolean turnComplete,
        List<Object> optional
    ) {
        var resp = new TurnResponse(
            dice, newPos, balance,
            passedGo, wasInJail, wentBankrupt,
            message, turnComplete, optional
        );
        broker.convertAndSend("/topic/game/" + gameId, resp);
        return resp;
    }

    //────────────────────────────────────────────────
    // Private helpers
    //────────────────────────────────────────────────
    private void finishAndRotate(int gameId, Map<String,String> game) {
        resetIdleTimer(gameId, game);
        rotateTurn(gameId);
    }

    private void resetIdleTimer(int gameId, Map<String,String> game) {
        int t = Integer.parseInt(game.getOrDefault("timer","0")) + 1;
        game.put("timer", String.valueOf(t));
        game.put("lastMoveTime", Instant.now().toString());
        game.put("turnAge", "0");
        game.put("turnTimeout", "60");
        gameStateSvc.getGame(gameId).putAll(game);
    }

    private void storeOptionalAction(int gameId, Object optionalPojo) {
        try {
            String json = mapper.writeValueAsString(optionalPojo);
            gameStateSvc.setGameField(gameId, K_OPTIONAL, json);
            gameStateSvc.setGameField(gameId, K_DEADLINE,
                String.valueOf(Instant.now().plusSeconds(45).toEpochMilli())
            );
        } catch (Exception e) {
            throw new IllegalStateException("Cannot serialize optional action", e);
        }
    }

    private void rotateTurn(int gameId) {
        var ids = gameStateSvc.getPlayersInGame(gameId).stream()
            .map(Integer::parseInt).sorted().toList();
        int cur  = Integer.parseInt(gameStateSvc.getGame(gameId).get("playerTurn"));
        int next = ids.get((ids.indexOf(cur) + 1) % ids.size());
        gameStateSvc.setGameField(gameId, "playerTurn", String.valueOf(next));
    }

    private void handleFullBankruptcy(int gameId, int playerId, Map<String,Object> pstate) {
        pstate.put("bankrupt", true);
        playerStateSvc.savePlayerState(playerId, pstate);
        bankSvc.releaseProperties(playerId);
        gameStateSvc.removePlayerFromGame(gameId, playerId);
        gameStateSvc.finalizePlayerStats(playerId, false, asInt(pstate.get("money")), 0);
        if (gameStateSvc.getPlayersInGame(gameId).size() == 1) {
            gameStateSvc.endGame(gameId);
        }
    }

    private int asInt(Object o) {
    if (o == null) return 0;
    String raw = o == null ? "null" : o.toString();
    System.out.println("🔍 asInt raw value: [" + raw + "]");
    String s = o.toString().trim();
    // remove wrapping JSON quotes if present
    if (s.length() >= 2 && s.startsWith("\"") && s.endsWith("\"")) {
        s = s.substring(1, s.length()-1);
    }
    return Integer.parseInt(s);
    }


    /** Response DTO */
    public record TurnResponse(
        int dice,
        int newPosition,
        int money,
        boolean passedGo,
        boolean wasInJail,
        boolean wentBankrupt,
        String tileMessage,
        boolean turnComplete,
        List<Object> optional
    ) {}
}
