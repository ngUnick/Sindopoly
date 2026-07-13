# Revamp backlog

Suggested implementation order is intentionally incremental.

## 1. Establish protected command model for player/game identity

- Priority: P1
- Evidence: `WebSecurityConfig` permits all; public mutation endpoints in `PlayerStateController`.
- Current behavior: client-provided IDs are trusted.
- Expected outcome: authenticated or signed session identity is available to REST and WebSocket paths; endpoints validate caller identity and membership.
- Affected files/components: security config, controllers, frontend auth context.
- Architectural boundary: authentication/authorization.
- Prerequisites: decide lightweight auth model.
- Required tests: unauthorized request rejected; player cannot mutate another player; host-only actions enforced.
- Security implications: closes IDOR and cheating paths.
- Runtime-performance implications: minimal.
- Redis implications: may add session/token keys if chosen.
- REST implications: all mutating endpoints require identity.
- WebSocket implications: handshake/subscription auth can reuse identity.
- MariaDB implications: may need player/session metadata.
- Backward-compatibility risk: high for clients using raw player IDs.
- Recommended branch: `codex/auth-command-identity`
- Suggested order: 1

## 2. Remove or quarantine direct player-state mutation APIs

- Priority: P1
- Evidence: `POST /api/player-state/{playerId}` and `/grant-money/{playerId}/{amount}`.
- Current behavior: arbitrary Redis state can be changed externally.
- Expected outcome: state changes happen through explicit game commands only.
- Affected files/components: `PlayerStateController`, `PlayerStateService`, frontend callers.
- Architectural boundary: REST vs domain/game-rule logic.
- Prerequisites: identity model or dev-only profile decision.
- Required tests: direct money/position mutation unavailable in production profile.
- Security implications: critical anti-cheat improvement.
- Runtime-performance implications: none.
- Redis implications: fewer arbitrary writes.
- REST implications: endpoint removal/deprecation plan.
- WebSocket implications: none direct.
- MariaDB implications: none.
- Backward-compatibility risk: medium/high.
- Recommended branch: `codex/quarantine-player-state-mutations`
- Suggested order: 2

## 3. Add idempotent atomic turn command handling

- Priority: P1
- Evidence: `TurnService#throwDice` multi-step writes; no command ID/lock.
- Current behavior: duplicate/concurrent roll/action can produce multiple transitions.
- Expected outcome: one command produces one state transition per turn.
- Affected files/components: `TurnService`, `GameStateService`, Redis schema.
- Architectural boundary: application service, Redis atomicity.
- Prerequisites: document current turn state machine.
- Required tests: duplicate roll, concurrent roll, wrong active player, duplicate action.
- Security implications: anti-cheat and replay resistance.
- Runtime-performance implications: may add Lua/transaction/lock overhead; safer per-game lock preferred.
- Redis implications: add per-game turn version/idempotency marker or Lua script.
- REST implications: command IDs or version preconditions.
- WebSocket implications: publish only after successful transition.
- MariaDB implications: none direct.
- Backward-compatibility risk: medium.
- Recommended branch: `codex/idempotent-turn-commands`
- Suggested order: 3

## 4. Fix REST action path/body validation contract

- Priority: P1
- Evidence: `TurnController#doAction` ignores path IDs and trusts `ActionRequestDto`.
- Current behavior: path and body can disagree.
- Expected outcome: path IDs are authoritative or body IDs removed.
- Affected files/components: `TurnController`, `ActionRequestDto`, `TurnAPI.jsx`.
- Architectural boundary: REST API contract.
- Prerequisites: tests for mismatch.
- Required tests: mismatched game/player rejected.
- Security implications: prevents request tampering.
- Runtime-performance implications: none.
- Redis implications: none.
- REST implications: possible DTO change.
- WebSocket implications: none.
- MariaDB implications: none.
- Backward-compatibility risk: low/medium.
- Recommended branch: `codex/validate-turn-action-ids`
- Suggested order: 4

## 5. Reconcile WebSocket architecture and frontend polling

- Priority: P2/P3
- Evidence: `WebSocketConfig`; commented STOMP subscription in `Board.jsx`; REST polling every 2s/1s.
- Current behavior: server broadcasts some events, frontend ignores them.
- Expected outcome: documented event contract and either active WebSocket updates with REST resync or explicit polling-only design.
- Affected files/components: `WebSocketConfig`, `TurnService`, `GameLoopScheduler`, `Board.jsx`, `Lobby.jsx`.
- Architectural boundary: event publication / client state management.
- Prerequisites: identity model for subscription auth.
- Required tests: subscription auth, reconnect resync, event after transition.
- Security implications: prevent arbitrary topic subscription.
- Runtime-performance implications: may reduce polling.
- Redis implications: optional event sequence/version.
- REST implications: snapshot endpoint remains recovery source.
- WebSocket implications: standardized destinations/events.
- MariaDB implications: none.
- Backward-compatibility risk: medium.
- Recommended branch: `codex/reconcile-websocket-flow`
- Suggested order: 5

## 6. Correct and test square action semantics

- Priority: P1/P2
- Evidence: likely rent direction issue, jail/gojail contradictions in `SquareActionService`/`TurnService`.
- Current behavior: rent appears to increase both payer and owner; jail offer mapping inconsistent.
- Expected outcome: documented Sindopoly rule outcomes for rent, tax, card, jail, buy/pass.
- Affected files/components: `SquareActionService`, `TurnService`, DTOs, frontend modal mapping.
- Architectural boundary: domain/game-rule logic.
- Prerequisites: confirm intended Sindopoly rules.
- Required tests: each square type effect; insufficient funds; ownership.
- Security implications: prevents client-assisted rule abuse.
- Runtime-performance implications: owner lookup can be improved later.
- Redis implications: property ownership representation may change.
- REST implications: turn response DTO may need richer event type.
- WebSocket implications: event payloads should match DTO.
- MariaDB implications: square/card metadata only unless ownership is persisted.
- Backward-compatibility risk: medium.
- Recommended branch: `codex/test-square-action-semantics`
- Suggested order: 6

## 7. Create reproducible Windows and Docker startup docs

- Priority: P3/P4
- Evidence: PowerShell npm issue, Maven wrapper cache issue, Docker config warning, native `mariadb` hostname caveat.
- Current behavior: startup path is implicit.
- Expected outcome: documented PowerShell and Docker Desktop workflows.
- Affected files/components: docs, possibly env examples in a later phase.
- Architectural boundary: developer experience.
- Prerequisites: decide supported local modes.
- Required tests: smoke command checklist.
- Security implications: document local-only credentials.
- Runtime-performance implications: none.
- Redis implications: document host/port.
- REST implications: document base URL.
- WebSocket implications: document `/ws`.
- MariaDB implications: document init behavior.
- Backward-compatibility risk: none.
- Recommended branch: `codex/windows-docker-startup-docs`
- Suggested order: 7

## 8. Add test scaffold for backend critical flows

- Priority: P0/P1
- Evidence: no test sources; Testcontainers dependencies already present.
- Current behavior: backend build passes without tests.
- Expected outcome: repeatable unit/integration tests for game lifecycle and turn flow.
- Affected files/components: `Sindopoly-Java/src/test/java`.
- Architectural boundary: testability.
- Prerequisites: isolate Redis/MariaDB test config.
- Required tests: create/join/start/roll/action/end/security.
- Security implications: proves guards.
- Runtime-performance implications: enables regression checks.
- Redis implications: test containers/embedded Redis.
- REST implications: controller tests.
- WebSocket implications: later STOMP tests.
- MariaDB implications: test container schema.
- Backward-compatibility risk: none.
- Recommended branch: `codex/backend-critical-flow-tests`
- Suggested order: 8

## 9. Clean up API mismatches and stale frontend wrappers

- Priority: P2/P4
- Evidence: frontend references `/buy` and `/pay-jail` endpoints not present in backend.
- Current behavior: exported wrappers can call nonexistent endpoints.
- Expected outcome: frontend wrappers match backend API or are clearly deprecated.
- Affected files/components: `GamePlayAPI.jsx`, backend controllers if compatibility endpoints are intentionally added.
- Architectural boundary: REST contract.
- Prerequisites: decide canonical buy/jail action path.
- Required tests: frontend API contract/unit tests.
- Security implications: avoid accidentally exposing unsafe compatibility endpoints.
- Runtime-performance implications: none.
- Redis implications: none.
- REST implications: contract clarity.
- WebSocket implications: none.
- MariaDB implications: none.
- Backward-compatibility risk: medium.
- Recommended branch: `codex/align-frontend-api-contract`
- Suggested order: 9

## 10. Replace Redis key scans with indexed membership/lobby structures

- Priority: P3
- Evidence: `redisTemplate.keys("game:*")` and `keys("game:*:players")`.
- Current behavior: full keyspace scans.
- Expected outcome: maintain explicit sets/indexes such as active games, lobby games, player-current-game.
- Affected files/components: `GameStateService`, `GameLoopScheduler`.
- Architectural boundary: Redis schema/performance.
- Prerequisites: tests for lifecycle cleanup.
- Required tests: create/join/leave/end cleanup preserves indexes.
- Security implications: helps membership checks.
- Runtime-performance implications: reduces Redis blocking scans.
- Redis implications: new index keys and cleanup rules.
- REST implications: no external change.
- WebSocket implications: none.
- MariaDB implications: none.
- Backward-compatibility risk: medium for existing runtime Redis data.
- Recommended branch: `codex/redis-game-indexes`
- Suggested order: 10

