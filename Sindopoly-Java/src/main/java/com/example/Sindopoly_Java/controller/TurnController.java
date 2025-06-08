package com.example.Sindopoly_Java.controller;

import com.example.Sindopoly_Java.service.GameStateService;
import com.example.Sindopoly_Java.service.orchestrator.TurnService;
import lombok.RequiredArgsConstructor;

import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * All “turn‐flow” endpoints live here:
 *  • POST /api/turn/{gameId}/{playerId}        → roll / move / mandatory logic
 *  • POST /api/turn/{gameId}/{playerId}/pass   → skip / decline optional action
 */
@RestController
@RequestMapping("/api/turn")
@RequiredArgsConstructor
public class TurnController {

    private final TurnService      turnSvc;
    private final GameStateService gameStateSvc;

    /**
     * Roll the dice, move, apply any mandatory effects,
     * and—if there’s an optional follow-up—return with turnComplete=false.
     */
    @PostMapping("/{gameId}/{playerId}")
    public TurnService.TurnResponse playTurn(@PathVariable int gameId,
                                             @PathVariable int playerId) {
        return turnSvc.playTurn(gameId, playerId);
    }

    /**
     * The player has declined the optional action.
     * Clear it, rotate the turn, broadcast, and return a simple ACK.
     */
    @PostMapping("/{gameId}/{playerId}/pass")
    public ResponseEntity<?> passOptional(@PathVariable int gameId,
                                          @PathVariable int playerId) {

        // 1️⃣ must have a pending optional action for this player
        gameStateSvc.assertOptionalAction(gameId, playerId);

        // 2️⃣ clear both the stored optional payload and its deadline
        gameStateSvc.clearOptionalAction(gameId);

        // 3️⃣ finish the turn (bookkeeping + rotate + broadcast)
        turnSvc.finishTurn(gameId);

        // 4️⃣ tiny ACK
        return ResponseEntity.ok(Map.of("status","passed"));
    }
}
