package com.example.Sindopoly_Java.service.orchestrator;

import com.example.Sindopoly_Java.service.GameStateService;
import com.example.Sindopoly_Java.service.PlayerStateService;
import com.example.Sindopoly_Java.service.core.*;
import com.example.Sindopoly_Java.service.core.MovementService.MovementResult;
import com.example.Sindopoly_Java.utils.ValidationUtils;
import org.springframework.stereotype.Service;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.time.Instant;
import java.util.*;

@Service
public class TurnService {

    private final GameStateService gameStateSvc;
    private final PlayerStateService playerStateSvc;
    private final ValidationUtils validationUtils;

    /* pure-logic helpers */
    private final DiceService diceSvc;
    private final MovementService moveSvc = new MovementService();


    private final BankruptcyService bankSvc;
    private final SquareActionService squareActionSvc;

    private final SimpMessagingTemplate broker;

    public TurnService(GameStateService g,
                    PlayerStateService p,
                    ValidationUtils v,
                    SquareActionService sq,
                    BankruptcyService bank,
                    DiceService diceSvc,
                    SimpMessagingTemplate broker) {

        this.gameStateSvc   = g;
        this.playerStateSvc = p;
        this.validationUtils= v;
        this.squareActionSvc= sq;
        this.bankSvc        = bank;
        this.diceSvc        = diceSvc;
        this.broker         = broker;
    }

    

    public TurnResponse playTurn(int gameId, int playerId) {

        /* ─── 0. look-ups / validation ───────────────────────────── */
        validationUtils.validatePlayerExists(playerId);

        Map<String,String> gameHash = gameStateSvc.getGame(gameId);
        if (!"inProgress".equalsIgnoreCase(gameHash.get("status")))
            throw new IllegalStateException("Game not in progress.");

        /* single helper */
        validationUtils.ensurePlayerTurn(gameId, playerId, gameHash);

        Map<String,Object> pHash = playerStateSvc.getPlayerState(playerId);

    
        /* clear AFK flag */
        pHash.put("afk", "false");
        playerStateSvc.savePlayerState(playerId, pHash);
    
        int money    = Integer.parseInt(pHash.get("money").toString());
        int position = Integer.parseInt(pHash.get("position").toString());
        boolean inJail = Boolean.parseBoolean(pHash.get("jail").toString());
        int jailTime   = Integer.parseInt(pHash.get("jailTime").toString());
    
        /* ─── 1. bankrupt before turn ─────────────────────────────── */
        if (bankSvc.isBankrupt(money)) {
            handleFullBankruptcy(gameId, playerId, pHash);
            rotateTurn(gameId);
            return publish(gameId, new TurnResponse(
                    0, position, money, false,
                    inJail, true, "Bankrupt"));
        }
    
        /* ─── 2. jail logic ───────────────────────────────────────── */
        if (inJail) {
            if (jailTime > 1) {
                pHash.put("jailTime", jailTime - 1);
                playerStateSvc.savePlayerState(playerId, pHash);
                rotateTurn(gameId);
                return publish(gameId, new TurnResponse(
                        0, position, money, false,
                        true, false, "Stayed in jail"));
            } else {
                pHash.put("jail", false);
                pHash.put("jailTime", 0);
            }
        }
    
        /* ─── 3. roll dice & move ─────────────────────────────────── */
        int dice = diceSvc.roll();
        MovementResult mv = moveSvc.move(position, dice);
        gameStateSvc.setGameField(gameId, "lastDice", String.valueOf(dice));
    
        position = mv.newPosition();
        if (mv.passedGo()) money += 200;
    
        pHash.put("position", position);
        pHash.put("money", money);
        playerStateSvc.savePlayerState(playerId, pHash);
    
        /* ─── 4. square action ───────────────────────────────────── */
        var tile = squareActionSvc.execute(playerId, position, gameId);
    
        /* teleport follow-up */
        if (tile.message().contains("moved to square")) {
            position = Integer.parseInt(
                    playerStateSvc.getPlayerState(playerId).get("position").toString());
    
            var dest = squareActionSvc.execute(playerId, position, gameId);
            money += dest.deltaMoney();
            pHash.put("money", money);
            playerStateSvc.savePlayerState(playerId, pHash);
    
            tile = new SquareActionService.TileResult(
                    tile.deltaMoney() + dest.deltaMoney(),
                    tile.message() + " | " + dest.message());
        }
    
        /* ─── 5. post-move bankruptcy ─────────────────────────────── */
        if (bankSvc.isBankrupt(money)) {
            handleFullBankruptcy(gameId, playerId, pHash);
            rotateTurn(gameId);
            return publish(gameId, new TurnResponse(
                    0, position, money, false,
                    false, true, "Bankrupt"));
        }
    
        /* ─── 6. timer, turn rotate, idle reset ───────────────────── */
        incrementGameTimer(gameId, gameHash);
        rotateTurn(gameId);
        gameStateSvc.setGameField(gameId, "turnAge", "0");
        gameStateSvc.setGameField(gameId, "turnTimeout", "60");
    
        /* ─── 7. build & broadcast result ─────────────────────────── */
        return publish(gameId, new TurnResponse(
                dice, position, money, mv.passedGo(),
                false, false, tile.message()));
    }
    
    /* ───────────────── helper: send over WebSocket & return ─────── */
    private TurnResponse publish(int gameId, TurnResponse resp) {
        broker.convertAndSend("/topic/game/" + gameId, resp);
        return resp;
    }
    

    /* =================================================================== */
    /* helper methods                                                      */
    /* =================================================================== */

    private void rotateTurn(int gameId) {
        Set<String> players = gameStateSvc.getPlayersInGame(gameId);
        List<Integer> ids   = players.stream().map(Integer::parseInt).sorted().toList();

        String current = gameStateSvc.getGame(gameId).get("playerTurn");
        int idx = ids.indexOf(Integer.parseInt(current));
        int next = ids.get((idx + 1) % ids.size());

        gameStateSvc.getGame(gameId).put("playerTurn", String.valueOf(next));
    }

    private void incrementGameTimer(int gameId, Map<String,String> gameHash) {
        int timer = Integer.parseInt(gameHash.getOrDefault("timer","0")) + 1;
        gameHash.put("timer", String.valueOf(timer));
        gameHash.put("lastMoveTime", Instant.now().toString());
        gameStateSvc.getGame(gameId).putAll(gameHash);
    }

    // private void handleBankruptcy(int gameId, int playerId, Map<String,Object> pHash) {
    //     pHash.put("bankrupt", true);
    //     playerStateSvc.savePlayerState(playerId, pHash);
    // }

    private void handleFullBankruptcy(int gameId,
                                  int playerId,
                                  Map<String,Object> pHash) {

    // 1. flag bankrupt in Redis
    pHash.put("bankrupt", true);
    playerStateSvc.savePlayerState(playerId, pHash);

    // 2. release properties
    bankSvc.releaseProperties(playerId);

    // 3. remove from players set
    gameStateSvc.getPlayersInGame(gameId)
                .forEach(id -> {});       // touch to init pipeline
    gameStateSvc.removePlayerFromGame(gameId, playerId);

    // 4. finalize stats (loss) – re-use existing method
    //   winner flag false, money could be zero
    gameStateSvc.finalizePlayerStats(playerId, false,
        Integer.parseInt(pHash.get("money").toString()), 0);

    // 5. if only one player left -> endGame
    if (gameStateSvc.getPlayersInGame(gameId).size() == 1) {
        gameStateSvc.endGame(gameId);
    }
}


    /* lightweight response */
    public record TurnResponse(
        int dice,
        int newPosition,
        int money,
        boolean passedGo,
        boolean wasInJail,
        boolean wentBankrupt,
        String tileMessage) {}


}
