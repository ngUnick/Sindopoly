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
 * Handles a single “doTurn” call:
 *  - roll dice
 *  - move / pass GO
 *  - apply jail / bankruptcy
 *  - if landing square has an OPTIONAL follow-up → store it & return without rotating
 *  - otherwise rotate turn and return
 */
@Service
@RequiredArgsConstructor
public class TurnService {

    private final GameStateService       gameStateSvc;
    private final PlayerStateService     playerStateSvc;
    private final ValidationUtils        validationUtils;
    private final DiceService            diceSvc;
    private final MovementService        moveSvc      = new MovementService();
    private final BankruptcyService      bankSvc;
    private final SquareActionService    squareActionSvc;
    private final SimpMessagingTemplate  broker;
    private final ObjectMapper           mapper       = new ObjectMapper();

    private static final String K_OPTIONAL  = "optionalAction";
    private static final String K_DEADLINE  = "optionalDeadline";

    /**
     * Roll-and-move entrypoint.
     */
    public TurnResponse playTurn(int gameId, int playerId) {
        // 0. guard rails
        validationUtils.validatePlayerExists(playerId);
        Map<String,String> g = gameStateSvc.getGame(gameId);
        if (!"inProgress".equalsIgnoreCase(g.get("status")))
            throw new IllegalStateException("Game not in progress.");
        validationUtils.ensurePlayerTurn(gameId, playerId, g);
        if (g.containsKey(K_OPTIONAL))
            throw new IllegalStateException("Finish your pending action first.");

        // Clear AFK
        Map<String,Object> p = playerStateSvc.getPlayerState(playerId);
        p.put("afk","false");
        playerStateSvc.savePlayerState(playerId,p);

        int money    = asInt(p.get("money"));
        int pos      = asInt(p.get("position"));
        boolean jail = Boolean.parseBoolean(p.get("jail").toString());
        int jailTime = asInt(p.get("jailTime"));

        // 1️⃣ early bankruptcy
        if (bankSvc.isBankrupt(money)) {
            handleFullBankruptcy(gameId,playerId,p);
            rotateTurn(gameId);
            return publish(gameId, new TurnResponse(
                /*dice=*/0, pos, money, /*passedGo=*/false,
                /*wasInJail=*/jail, /*wentBankrupt=*/true,
                /*tileMessage=*/"Bankrupt",
                /*turnComplete=*/true,
                /*optional=*/Collections.emptyList()
            ));
        }

        // 2️⃣ still-in-jail logic
        if (jail) {
            if (jailTime > 1) {
                p.put("jailTime", jailTime-1);
                playerStateSvc.savePlayerState(playerId,p);
                rotateTurn(gameId);
                return publish(gameId, new TurnResponse(
                    /*dice=*/0, pos, money, /*passedGo=*/false,
                    /*wasInJail=*/true, /*wentBankrupt=*/false,
                    /*tileMessage=*/"Stayed in jail",
                    /*turnComplete=*/true,
                    /*optional=*/Collections.emptyList()
                ));
            }
            // serve complete → get out
            p.put("jail", false);
            p.put("jailTime", 0);
        }

        // 3️⃣ roll & move
        int dice = diceSvc.roll();
        MovementResult mv = moveSvc.move(pos, dice);
        gameStateSvc.setGameField(gameId, "lastDice", String.valueOf(dice));

        pos = mv.newPosition();
        if (mv.passedGo()) {
            money += 200;
        }
        p.put("position", pos);
        p.put("money", money);
        playerStateSvc.savePlayerState(playerId, p);

        // 4️⃣ landing‐square effect
        SquareActionService.TileResult tile = squareActionSvc.execute(playerId, pos, gameId);

        // teleport recursion if needed
        if (tile.message().contains("moved to square")) {
            pos = asInt(playerStateSvc.getPlayerState(playerId).get("position"));
            var extra = squareActionSvc.execute(playerId, pos, gameId);
            money += extra.deltaMoney();
            p.put("money", money);
            playerStateSvc.savePlayerState(playerId, p);
            tile = new SquareActionService.TileResult(
                tile.deltaMoney() + extra.deltaMoney(),
                tile.message() + " | " + extra.message(),
                tile.optional()
            );
        }

        // 5️⃣ post-move bankruptcy
        if (bankSvc.isBankrupt(money)) {
            handleFullBankruptcy(gameId, playerId, p);
            rotateTurn(gameId);
            return publish(gameId, new TurnResponse(
                dice, pos, money, mv.passedGo(),
                /*wasInJail=*/false, /*wentBankrupt=*/true,
                /*tileMessage=*/"Bankrupt",
                /*turnComplete=*/true,
                /*optional=*/Collections.emptyList()
            ));
        }

        // 6️⃣ optional follow-up?
        if (tile.optional().isPresent()) {
            storeOptionalAction(gameId, tile.optional().get());
            resetIdleTimer(gameId, g);
            return publish(gameId, new TurnResponse(
                dice, pos, money, mv.passedGo(),
                /*wasInJail=*/false, /*wentBankrupt=*/false,
                tile.message(),
                /*turnComplete=*/false,
                List.of(tile.optional().get())
            ));
        }

        // 7️⃣ normal end-of-turn
        finishAndRotate(gameId, g);
        return publish(gameId, new TurnResponse(
            dice, pos, money, mv.passedGo(),
            /*wasInJail=*/false, /*wentBankrupt=*/false,
            tile.message(),
            /*turnComplete=*/true,
            Collections.emptyList()
        ));
    }

    /** Called by follow-up controllers to clear the pending action & rotate */
    public void finishTurn(int gameId) {
        Map<String,String> g = gameStateSvc.getGame(gameId);
        // clear optional & deadline
        gameStateSvc.setGameField(gameId, K_OPTIONAL, null);
        gameStateSvc.setGameField(gameId, K_DEADLINE, null);

        // bookkeeping + rotate
        int t = Integer.parseInt(g.getOrDefault("timer","0")) + 1;
        g.put("timer", String.valueOf(t));
        g.put("turnAge","0");
        g.put("turnTimeout","60");
        gameStateSvc.getGame(gameId).putAll(g);
        rotateTurn(gameId);

        // broadcast
        broker.convertAndSend("/topic/game/" + gameId,
                              Map.of("event","turnFinished"));
    }

    // ──────────────────────────────────── private helpers

    private void finishAndRotate(int gameId, Map<String,String> g) {
        resetIdleTimer(gameId, g);
        rotateTurn(gameId);
    }

    private void resetIdleTimer(int gameId, Map<String,String> g) {
        int t = Integer.parseInt(g.getOrDefault("timer","0")) + 1;
        g.put("timer",      String.valueOf(t));
        g.put("lastMoveTime", Instant.now().toString());
        g.put("turnAge",    "0");
        g.put("turnTimeout","60");
        gameStateSvc.getGame(gameId).putAll(g);
    }

    private void storeOptionalAction(int gameId, Object optionalPojo) {
        try {
            String json = mapper.writeValueAsString(optionalPojo);
            gameStateSvc.setGameField(gameId, K_OPTIONAL, json);
            gameStateSvc.setGameField(gameId, K_DEADLINE,
                String.valueOf(Instant.now().plusSeconds(45).toEpochMilli()));
        } catch (Exception e) {
            throw new IllegalStateException("Cannot serialize optional action", e);
        }
    }

    private TurnResponse publish(int gameId, TurnResponse resp) {
        broker.convertAndSend("/topic/game/" + gameId, resp);
        return resp;
    }

    private void rotateTurn(int gameId) {
        List<Integer> ids = gameStateSvc.getPlayersInGame(gameId).stream()
                                        .map(Integer::parseInt).sorted().toList();
        int cur  = Integer.parseInt(gameStateSvc.getGame(gameId).get("playerTurn"));
        int next = ids.get((ids.indexOf(cur)+1) % ids.size());
        gameStateSvc.setGameField(gameId,"playerTurn", String.valueOf(next));
    }

    private void handleFullBankruptcy(int gameId, int playerId, Map<String,Object> p) {
        p.put("bankrupt", true);
        playerStateSvc.savePlayerState(playerId,p);
        bankSvc.releaseProperties(playerId);
        gameStateSvc.removePlayerFromGame(gameId, playerId);
        gameStateSvc.finalizePlayerStats(playerId,false, asInt(p.get("money")),0);
        if (gameStateSvc.getPlayersInGame(gameId).size() == 1)
            gameStateSvc.endGame(gameId);
    }

    private int asInt(Object o) {
        return Integer.parseInt(o.toString());
    }

    /**
     * New DTO: includes turnComplete flag + optional list (empty if none).
     */
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
