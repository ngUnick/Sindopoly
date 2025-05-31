package com.example.Sindopoly_Java.controller;

import com.example.Sindopoly_Java.service.GameStateService;
import com.example.Sindopoly_Java.service.orchestrator.TurnService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * All “turn-flow” endpoints live here:
 *  • POST /api/turn/{gameId}/{playerId}           → roll / move / mandatory logic
 *  • POST /api/turn/{gameId}/{playerId}/pass      → skip / decline optional action
 */
@RestController
@RequestMapping("/api/turn")
@RequiredArgsConstructor
public class TurnController {

    private final TurnService      turnSvc;
    private final GameStateService gameStateSvc;

    /* ───────────────────────────────────────────────── play main turn ── */
    @PostMapping("/{gameId}/{playerId}")
    public TurnService.TurnResponse playTurn(@PathVariable int gameId,
                                             @PathVariable int playerId) {
        return turnSvc.playTurn(gameId, playerId);
    }

    /* ────────────────────────────────────────────────────── PASS / SKIP */
    @PostMapping("/{gameId}/{playerId}/pass")
    public ResponseEntity<?> passOptional(@PathVariable int gameId,
                                          @PathVariable int playerId) {

        /* 1️⃣ make sure an optional action exists and belongs to this player */
        gameStateSvc.assertOptionalAction(gameId, playerId);     // generic check
        /* 2️⃣ simply clear it … */
        gameStateSvc.clearOptionalAction(gameId);
        /* 3️⃣ …and rotate the turn */
        turnSvc.finishTurn(gameId);

        return ResponseEntity.ok().body(
                java.util.Map.of("status", "passed"));           // tiny ack
    }
}
