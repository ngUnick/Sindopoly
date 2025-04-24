package com.example.Sindopoly_Java.service.orchestrator;

import com.example.Sindopoly_Java.service.GameStateService;
import com.example.Sindopoly_Java.service.PlayerStateService;
import com.example.Sindopoly_Java.service.core.*;
import com.example.Sindopoly_Java.service.core.MovementService.MovementResult;
import com.example.Sindopoly_Java.utils.ValidationUtils;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;

@Service
public class TurnService {

    private final GameStateService gameStateSvc;
    private final PlayerStateService playerStateSvc;
    private final ValidationUtils validationUtils;

    /* pure-logic helpers */
    private final DiceService diceSvc           = new DiceService();
    private final MovementService moveSvc       = new MovementService();


    private final BankruptcyService bankSvc;
    private final SquareActionService squareActionSvc;

    public TurnService(GameStateService g,
                    PlayerStateService p,
                    ValidationUtils v,
                    SquareActionService sq,
                    BankruptcyService bank) {   // <-- add parameter
        this.gameStateSvc     = g;
        this.playerStateSvc   = p;
        this.validationUtils  = v;
        this.squareActionSvc  = sq;
        this.bankSvc          = bank;   // <-- store injected bean
    }

    

    public TurnResponse playTurn(int gameId, int playerId) {

        /* ─── 0. look-ups / validation ─────────────────────────────────── */
        validationUtils.validatePlayerExists(playerId);

        Map<String,String> gameHash = gameStateSvc.getGame(gameId);
        if (!"inProgress".equalsIgnoreCase(gameHash.get("status")))
            throw new IllegalStateException("Game not in progress.");

        if (!String.valueOf(playerId).equals(gameHash.get("playerTurn")))
            throw new IllegalStateException("Not this player's turn.");

        Map<String,Object> pHash = playerStateSvc.getPlayerState(playerId);

        int money     = Integer.parseInt(pHash.get("money").toString());
        int position  = Integer.parseInt(pHash.get("position").toString());
        boolean inJail= Boolean.parseBoolean(pHash.get("jail").toString());
        int jailTime  = Integer.parseInt(pHash.get("jailTime").toString());

        /* ─── 1. jail / bankrupt pre-checks ────────────────────────────── */
        if (bankSvc.isBankrupt(money)) {
            handleBankruptcy(gameId, playerId, pHash);
            rotateTurn(gameId);
            return new TurnResponse(
                0, position, money, false,
                true,   // wasInJail
                true,   // wentBankrupt
                "Bankrupt");   // tileMessage
        }

        if (inJail) {
            if (jailTime > 1) {
                pHash.put("jailTime", jailTime - 1);
                playerStateSvc.savePlayerState(playerId, pHash);
                rotateTurn(gameId);
                return new TurnResponse(
                    0, position, money, false,
                    true,   // wasInJail
                    false,  // wentBankrupt
                    "Stayed in jail");
            } else {
                // last round in jail – release
                pHash.put("jail", false);
                pHash.put("jailTime", 0);
            }
        }

        /* ─── 2. roll dice & move ──────────────────────────────────────── */
        int dice = diceSvc.roll();
        MovementResult mv = moveSvc.move(position, dice);
        position = mv.newPosition();
        if (mv.passedGo()) money += 200;

        pHash.put("position", position);
        pHash.put("money", money);
        playerStateSvc.savePlayerState(playerId, pHash);

        /* ─── 3. TODO square action / card etc. ───────────────────────── */
        SquareActionService.TileResult tile =
        squareActionSvc.execute(playerId, position, gameId);

        // ── if teleport card moved the player, re-evaluate destination square
        if (tile.message().contains("moved to square")) {
            position = Integer.parseInt(
                    playerStateSvc.getPlayerState(playerId).get("position").toString());

            var dest = squareActionSvc.execute(playerId, position, gameId);

            money += dest.deltaMoney();
            pHash.put("money", money);
            playerStateSvc.savePlayerState(playerId, pHash);

            // merge messages
            tile = new SquareActionService.TileResult(
                    tile.deltaMoney() + dest.deltaMoney(),
                    tile.message() + " | " + dest.message());
        }



        /* ─── 4. post-move bankruptcy? ────────────────────────────────── */
        if (bankSvc.isBankrupt(money)) {
            handleFullBankruptcy(gameId, playerId, pHash);
            rotateTurn(gameId);
            return new TurnService.TurnResponse(
                0, position, money, false,
                true,  // wasInJail
                true,  // wentBankrupt
                "Bankrupt");
        }
        

        /* ─── 5. increase timer + rotate turn ─────────────────────────── */
        incrementGameTimer(gameId, gameHash);
        rotateTurn(gameId);

        /* ─── 6. return response to client ────────────────────────────── */
        return new TurnResponse(
            dice,
            position,
            money,
            mv.passedGo(),
            inJail,
            false,              // wentBankrupt (post-move b/c bankrupt handled earlier)
            tile.message());    // tileMessage
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

    private void handleBankruptcy(int gameId, int playerId, Map<String,Object> pHash) {
        pHash.put("bankrupt", true);
        playerStateSvc.savePlayerState(playerId, pHash);
        // TODO: transfer properties to bank etc.
    }

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
