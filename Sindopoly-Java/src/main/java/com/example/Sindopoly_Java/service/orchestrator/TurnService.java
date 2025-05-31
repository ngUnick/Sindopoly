package com.example.Sindopoly_Java.service.orchestrator;

import com.example.Sindopoly_Java.service.GameStateService;
import com.example.Sindopoly_Java.service.PlayerStateService;
import com.example.Sindopoly_Java.service.core.*;
import com.example.Sindopoly_Java.service.core.MovementService.MovementResult;
import com.example.Sindopoly_Java.utils.ValidationUtils;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;

import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;

/**
 * Handles the *first* half of a turn: dice-roll, movement, mandatory tile
 * effects. If the landing square produces an **optional** action (e.g. buy /
 * pay-jail / draw-decision) the service stores it in Redis and returns without
 * rotating the turn.  A follow-up controller ✱ must call {@link #finishTurn}
 * after the player decides, which finally rotates {@code playerTurn}.
 *
 * ✱  see TurnController in GameStateController.java
 */
@Service
@RequiredArgsConstructor
public class TurnService {

    private final GameStateService   gameStateSvc;
    private final PlayerStateService playerStateSvc;
    private final ValidationUtils    validationUtils;
    private final DiceService        diceSvc;
    private final MovementService    moveSvc      = new MovementService();
    private final BankruptcyService  bankSvc;
    private final SquareActionService squareActionSvc;
    private final SimpMessagingTemplate broker;
    private final ObjectMapper mapper = new ObjectMapper();   // json helper

    /* Redis keys inside game:{id} */
    private static final String K_OPTIONAL  = "optionalAction";
    private static final String K_DEADLINE  = "optionalDeadline";

    /* ─────────────────────────────────────────────────────────── play turn */
    public TurnResponse playTurn(int gameId, int playerId) {

        /* 0. basic validations */
        validationUtils.validatePlayerExists(playerId);

        Map<String,String> g = gameStateSvc.getGame(gameId);
        if (!"inProgress".equalsIgnoreCase(g.get("status")))
            throw new IllegalStateException("Game not in progress.");

        validationUtils.ensurePlayerTurn(gameId, playerId, g);

        /* pending decision guard – prevent re-roll spam */
        if (g.containsKey(K_OPTIONAL))
            throw new IllegalStateException("Finish your pending action first.");

        /* player hash */
        Map<String,Object> p = playerStateSvc.getPlayerState(playerId);
        p.put("afk","false");                      // clear AFK
        playerStateSvc.savePlayerState(playerId,p);

        int money     = asInt(p.get("money"));
        int pos       = asInt(p.get("position"));
        boolean jail  = Boolean.parseBoolean(p.get("jail").toString());
        int jailTime  = asInt(p.get("jailTime"));

        /* 1. early bankruptcy */
        if (bankSvc.isBankrupt(money)) {
            handleFullBankruptcy(gameId, playerId, p);
            rotateTurn(gameId);
            return publish(gameId,
                new TurnResponse(0,pos,money,false,jail,true,
                                "Bankrupt", Collections.emptyList())); // ← here
        }

        /* 2. jail logic */
        if (jail) {
            if (jailTime > 1) {             // stay in jail
                p.put("jailTime", jailTime-1);
                playerStateSvc.savePlayerState(playerId,p);
                rotateTurn(gameId);
                return publish(gameId,
                    new TurnResponse(0,pos,money,false,true,false,
                                    "Stayed in jail", Collections.emptyList())); // ← here
            }
            p.put("jail",false);
            p.put("jailTime",0);
        }

        /* 3. dice & move */
        int dice = diceSvc.roll();
        MovementResult mv = moveSvc.move(pos,dice);
        gameStateSvc.setGameField(gameId,"lastDice",String.valueOf(dice));

        pos = mv.newPosition();
        if (mv.passedGo()) money += 200;

        p.put("position",pos);
        p.put("money",money);
        playerStateSvc.savePlayerState(playerId,p);

        /* 4. square action */
        SquareActionService.TileResult tile = squareActionSvc.execute(playerId,pos,gameId);

        /* teleport recursion */
        if (tile.message().contains("moved to square")) {
            pos = asInt(playerStateSvc.getPlayerState(playerId).get("position"));
            var dest = squareActionSvc.execute(playerId,pos,gameId);
            money += dest.deltaMoney();
            p.put("money",money); playerStateSvc.savePlayerState(playerId,p);
            tile = new SquareActionService.TileResult(
                    tile.deltaMoney()+dest.deltaMoney(),
                    tile.message()+" | "+dest.message());
        }

        /* 5. post-move bankruptcy */
        if (bankSvc.isBankrupt(money)) {
            handleFullBankruptcy(gameId,playerId,p);
            rotateTurn(gameId);
            return publish(gameId,
                new TurnResponse(0,pos,money,false,false,true,
                                "Bankrupt", Collections.emptyList())); // ← here
        }

        /* 6. OPTIONAL decision? */
        if (tile.optional().isPresent()) {

            /* save to Redis so the follow-up /buy|/pay|/pass can validate */
            storeOptionalAction(gameId, tile.optional().get(), playerId);
            resetIdleTimer(gameId, g);

            /* -------- return with optional payload,  NO turn-rotate yet */
            return publish(gameId, new TurnResponse(
                    dice, pos, money, mv.passedGo(),
                    false, false, tile.message(),
                    List.of(tile.optional().get())         // ← ★ NEW ★
            ));
        }

        /* 7. normal end of turn (no optional) */
        finishAndRotate(gameId, g);
        return publish(gameId, new TurnResponse(
                dice, pos, money, mv.passedGo(),
                false, false, tile.message(),
                Collections.emptyList()                    // ← ★ NEW ★
        ));
    }

    // /* ────────────────────────────────────────────────── finish optional turn */
    // public void finishTurn(int gameId) {
    //     Map<String,String> g = gameStateSvc.getGame(gameId);
    //     g.remove(K_OPTIONAL);
    //     g.remove(K_DEADLINE);
    //     finishAndRotate(gameId,g);
    // }

    /* ───────────────────────────────────────── private helper utilities */

    private void finishAndRotate(int gameId, Map<String,String> g){
        resetIdleTimer(gameId,g);
        rotateTurn(gameId);
    }
    private void resetIdleTimer(int gameId, Map<String,String> g){
        int t = Integer.parseInt(g.getOrDefault("timer","0")) + 1;
        g.put("timer",String.valueOf(t));
        g.put("lastMoveTime",Instant.now().toString());
        g.put("turnAge","0");
        g.put("turnTimeout","60");
        gameStateSvc.getGame(gameId).putAll(g);
    }

    private void storeOptionalAction(int gameId,
                                     Object optionalPojo,
                                     int playerId){
        try {
            String json = mapper.writeValueAsString(optionalPojo);
            gameStateSvc.setGameField(gameId,K_OPTIONAL,json);
            gameStateSvc.setGameField(gameId,K_DEADLINE,
                    String.valueOf(Instant.now().plusSeconds(45).toEpochMilli()));
        } catch (Exception e){
            throw new IllegalStateException("Cannot serialize optional action",e);
        }
    }

    private TurnResponse publish(int gameId, TurnResponse resp){
        broker.convertAndSend("/topic/game/"+gameId,resp);
        return resp;
    }

    /** called by controller when the player has completed his optional action */
    public void finishTurn(int gameId) {

        Map<String,String> gameHash = gameStateSvc.getGame(gameId);

        /* timer bookkeeping */
        int t = Integer.parseInt(gameHash.getOrDefault("timer","0")) + 1;
        gameHash.put("timer", String.valueOf(t));
        gameHash.put("turnAge", "0");
        gameHash.put("turnTimeout", "60");
        gameStateSvc.getGame(gameId).putAll(gameHash);

        /* rotate turn */
        rotateTurn(gameId);

        /* broadcast simple “turn-finished” event –
        frontend doesn’t really need payload, but we keep structure */
        broker.convertAndSend("/topic/game/" + gameId,
                            Map.of("event","turnFinished"));
    }


    /* rotate to next active player (IDs are the Redis set order asc) */
    private void rotateTurn(int gameId){
        List<Integer> ids = gameStateSvc.getPlayersInGame(gameId)
                                        .stream().map(Integer::parseInt)
                                        .sorted().toList();
        int cur = Integer.parseInt(gameStateSvc.getGame(gameId)
                                              .get("playerTurn"));
        int next = ids.get((ids.indexOf(cur)+1)%ids.size());
        gameStateSvc.setGameField(gameId,"playerTurn",String.valueOf(next));
    }

    private void handleFullBankruptcy(int gameId,int playerId,Map<String,Object> p){
        p.put("bankrupt",true); playerStateSvc.savePlayerState(playerId,p);
        bankSvc.releaseProperties(playerId);
        gameStateSvc.removePlayerFromGame(gameId,playerId);
        gameStateSvc.finalizePlayerStats(playerId,false,
                asInt(p.get("money")),0);
        if (gameStateSvc.getPlayersInGame(gameId).size()==1)
            gameStateSvc.endGame(gameId);
    }

    private int asInt(Object o){ return Integer.parseInt(o.toString()); }

    /* slim payload sent over STOMP */
    public record TurnResponse(
            int dice,
            int newPosition,
            int money,
            boolean passedGo,
            boolean wasInJail,
            boolean wentBankrupt,
            String tileMessage,
            List<Object> optional          // ← ★ NEW FIELD ★
    ) {}

}
