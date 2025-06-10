package com.example.Sindopoly_Java.service.orchestrator;

import com.example.Sindopoly_Java.model.dto.ActionRequestDto;
import com.example.Sindopoly_Java.model.dto.ActionResultDto;
import com.example.Sindopoly_Java.model.dto.ApplyResultDto;
import com.example.Sindopoly_Java.model.dto.SquareEventDto;
import com.example.Sindopoly_Java.service.GameStateService;
import com.example.Sindopoly_Java.service.PlayerStateService;
import com.example.Sindopoly_Java.service.core.*;
import com.example.Sindopoly_Java.service.core.MovementService.MovementResult;
import com.example.Sindopoly_Java.model.dto.SquareEventDto;
import com.example.Sindopoly_Java.utils.ValidationUtils;
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
    public TurnResponse playTurn(int gameId, int playerId) {
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

        int money     = asInt(pstate.get("money"));
        int pos       = asInt(pstate.get("position"));
        boolean inJail  = Boolean.parseBoolean(pstate.get("jail").toString());
        int jailTime    = asInt(pstate.get("jailTime"));

        // 1. Early bankruptcy
        if (bankSvc.isBankrupt(money)) {
            handleFullBankruptcy(gameId, playerId, pstate);
            rotateTurn(gameId);
            return createResponse(
                gameId,
                0, pos, money, false, inJail, true,
                "Bankrupt", true, Collections.emptyList()
            );
        }

        // 2. Jail logic
        if (inJail) {
            if (jailTime > 1) {
                pstate.put("jailTime", jailTime - 1);
                playerStateSvc.savePlayerState(playerId, pstate);
                rotateTurn(gameId);
                return createResponse(
                    gameId,
                    0, pos, money, false, true, false,
                    "Stayed in jail", true, Collections.emptyList()
                );
            }
            // Release from jail
            pstate.put("jail", false);
            pstate.put("jailTime", 0);
        }

        // 3. Roll dice and move
        var dm = performDiceMove(gameId, playerId, pos);
        int dice = dm.dice();
        MovementResult mv = dm.movement();

        pos = mv.newPosition();
        if (mv.passedGo()) {
            money += 200;
        }
        pstate.put("position", String.valueOf(pos));
        pstate.put("money",    String.valueOf(money));
        playerStateSvc.savePlayerState(playerId, pstate);

        // 4. Square effects (peek stage)
        SquareEventDto tile = squareActionSvc.peekSquare(playerId, pos, gameId);

        // 5. Post-move bankruptcy
        if (bankSvc.isBankrupt(money)) {
            handleFullBankruptcy(gameId, playerId, pstate);
            rotateTurn(gameId);
            return createResponse(
                gameId,
                dice, pos, money, mv.passedGo(), false, true,
                "Bankrupt", true, Collections.emptyList()
            );
        }

        // 6. Optional follow-up?
        if (tile.getOptional().isPresent()) {
            Object raw = tile.getOptional();
            storeOptionalAction(gameId, raw);
            return createResponse(
                gameId,
                dice, pos, money, mv.passedGo(), false, false,
                tile.getMessage(), false, List.of(raw)
            );
        }

        // 7. Normal end-of-turn
        finishAndRotate(gameId, game);
        return createResponse(
            gameId,
            dice, pos, money, mv.passedGo(), false, false,
            tile.getMessage(), true, Collections.emptyList()
        );
    }

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
    }

    /**
    * Applies the client’s “buy” / “pass” / “ok” action for a pending optional,
    * clears it, rotates the turn, and returns the new state.
    */
    public ActionResultDto handleAction(ActionRequestDto req) {
        // 1) sanity: path params match body
        if (req.getGameId() != req.getGameId() || req.getPlayerId() != req.getPlayerId()) {
            throw new IllegalArgumentException("Mismatched request");
        }

        // 2) deserialize and apply
        String raw = gameStateSvc.getGame(req.getGameId()).get(K_OPTIONAL);
        if (raw == null) throw new IllegalStateException("No pending action");
        SquareEventDto event;
        try {
            event = mapper.readValue(raw, SquareEventDto.class);
        } catch (Exception e) {
            throw new IllegalStateException("Bad optional payload", e);
        }

        // 3) apply business logic
        ApplyResultDto ar = squareActionSvc.applySquareEvent(
            req.getPlayerId(),
            event,
            req.getAction()
        );

        // 4) clear optional + rotate
        gameStateSvc.setGameField(req.getGameId(), K_OPTIONAL, null);
        rotateTurn(req.getGameId());

        // 5) broadcast
        broker.convertAndSend(
            "/topic/game/" + req.getGameId(),
            Map.of("event", "actionCompleted")
        );

        // 6) build result DTO
        int next = Integer.parseInt(
            gameStateSvc.getGame(req.getGameId()).get("playerTurn")
        );
        return new ActionResultDto(ar.getNewBalance(), ar.getAcquiredProperties(), next);
    }


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
        return Integer.parseInt(o.toString());
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
