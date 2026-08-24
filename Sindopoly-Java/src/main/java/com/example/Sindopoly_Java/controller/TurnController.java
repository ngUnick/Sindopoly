package com.example.Sindopoly_Java.controller;

import com.example.Sindopoly_Java.model.dto.ActionRequestDto;
import com.example.Sindopoly_Java.model.dto.ActionResultDto;
import com.example.Sindopoly_Java.model.dto.ThrowResultDto;
import com.example.Sindopoly_Java.service.transition.CommandMetadata;
import com.example.Sindopoly_Java.service.transition.CommandMetadataResolver;
import com.example.Sindopoly_Java.service.transition.TurnCommandService;
import com.example.Sindopoly_Java.security.AuthenticatedPlayerResolver;
import lombok.RequiredArgsConstructor;


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
    private final TurnCommandService turnCommands;
    private final AuthenticatedPlayerResolver authenticatedPlayerResolver;
    private final CommandMetadataResolver commandMetadataResolver;

    /** STEP 1: roll & peek */
    @PostMapping("/{gameId}/{playerId}/throw")
    public ThrowResultDto throwDice(
        @PathVariable int gameId,
        @PathVariable int playerId,
        Authentication authentication,
        @RequestHeader(value = CommandMetadata.COMMAND_ID_HEADER, required = false) String commandId,
        @RequestHeader(value = CommandMetadata.EXPECTED_VERSION_HEADER, required = false) String expectedVersion
    ) {
        authenticatedPlayerResolver.requireMatchingPlayerId(playerId, authentication);
        return turnCommands.throwDice(gameId, playerId, commandMetadataResolver.resolve(commandId, expectedVersion));
    }

    /** STEP 2: apply buy/pass/ok */
    @PostMapping("/{gameId}/{playerId}/action")
    public ActionResultDto doAction(
        @PathVariable int gameId,
        @PathVariable int playerId,
        @RequestBody ActionRequestDto req,
        Authentication authentication,
        @RequestHeader(value = CommandMetadata.COMMAND_ID_HEADER, required = false) String commandId,
        @RequestHeader(value = CommandMetadata.EXPECTED_VERSION_HEADER, required = false) String expectedVersion
    ) {
        authenticatedPlayerResolver.requireMatchingPlayerId(playerId, authentication);
        if (req.getGameId() != gameId || req.getPlayerId() != playerId) {
            throw new AccessDeniedException("Action identity does not match its request path");
        }
        return turnCommands.action(gameId, playerId, req.getYes(), commandMetadataResolver.resolve(commandId, expectedVersion));
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
            Authentication authentication,
            @RequestHeader(value = CommandMetadata.COMMAND_ID_HEADER, required = false) String commandId,
            @RequestHeader(value = CommandMetadata.EXPECTED_VERSION_HEADER, required = false) String expectedVersion) {
        authenticatedPlayerResolver.requireMatchingPlayerId(playerId, authentication);
        return ResponseEntity.ok(turnCommands.pass(gameId, playerId,
                commandMetadataResolver.resolve(commandId, expectedVersion)));
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
