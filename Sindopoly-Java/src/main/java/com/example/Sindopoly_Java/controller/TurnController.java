package com.example.Sindopoly_Java.controller;

import com.example.Sindopoly_Java.model.dto.ActionRequestDto;
import com.example.Sindopoly_Java.model.dto.ActionResultDto;
import com.example.Sindopoly_Java.model.dto.ThrowResultDto;
import com.example.Sindopoly_Java.service.orchestrator.TurnService;
import com.example.Sindopoly_Java.security.AuthenticatedPlayerResolver;
import lombok.RequiredArgsConstructor;

import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
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
    private final AuthenticatedPlayerResolver authenticatedPlayerResolver;

    /** STEP 1: roll & peek */
    @PostMapping("/{gameId}/{playerId}/throw")
    public ThrowResultDto throwDice(
        @PathVariable int gameId,
        @PathVariable int playerId,
        Authentication authentication
    ) {
        authenticatedPlayerResolver.requireMatchingPlayerId(playerId, authentication);
        return turnSvc.throwDice(gameId, playerId);
    }

    /** STEP 2: apply buy/pass/ok */
    @PostMapping("/{gameId}/{playerId}/action")
    public ActionResultDto doAction(
        @PathVariable int gameId,
        @PathVariable int playerId,
        @RequestBody ActionRequestDto req,
        Authentication authentication
    ) {
        authenticatedPlayerResolver.requireMatchingPlayerId(playerId, authentication);
        if (req.getGameId() != gameId || req.getPlayerId() != playerId) {
            throw new AccessDeniedException("Action identity does not match its request path");
        }
        return turnSvc.applyAction(gameId, playerId, req.getYes());
    }

    /** old endpoint left untouched, or remove it when you’re ready */
    // @PostMapping("/{gameId}/{playerId}")
    // public TurnService.TurnResponse playTurn(
    //     @PathVariable int gameId,
    //     @PathVariable int playerId
    // ) {
    //     return turnSvc.playTurn(gameId, playerId);
    // }

    /** ② Decline optional (old “pass”). */
    @PostMapping("/{gameId}/{playerId}/pass")
    public ResponseEntity<?> passOptional(
            @PathVariable int gameId,
            @PathVariable int playerId,
            Authentication authentication) {
        authenticatedPlayerResolver.requireMatchingPlayerId(playerId, authentication);
        turnSvc.passOptional(gameId, playerId);
        return ResponseEntity.ok(Map.of("status","passed"));
    }

    // /** ③ Apply the user’s choice (buy/pay/ok). */
    // @PostMapping("/{gameId}/{playerId}/action")
    // public ActionResultDto doAction(
    //         @PathVariable int gameId,
    //         @PathVariable int playerId,
    //         @RequestBody ActionRequestDto req
    // ) {
    //     // you may want to validate req.gameId == gameId etc.
    //     return turnSvc.handleAction(req);
    // }
}
