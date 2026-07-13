# Current WebSocket flow

## Server configuration

| Item | Current value | Evidence |
| --- | --- | --- |
| Protocol | STOMP over WebSocket with SockJS fallback | `WebSocketConfig#registerStompEndpoints` |
| Handshake endpoint | `/ws` | `registry.addEndpoint("/ws")` |
| Allowed origins | `*` for WebSocket handshake | `setAllowedOriginPatterns("*")` |
| Broker | In-memory simple broker | `config.enableSimpleBroker("/topic")` |
| Application prefix | `/app` | `config.setApplicationDestinationPrefixes("/app")` |
| Inbound handlers | None found | `rg` found no active `@MessageMapping`. |

## Outbound topics/events

| Destination | Publisher | Payload evidence |
| --- | --- | --- |
| `/topic/game/{gameId}` | `TurnService#applyAction` | Map with `event=actionCompleted`, `next=playerTurn`. |
| `/topic/game/{gameId}` | `TurnService#finishTurn` | Map with `event=turnFinished`; maybe `event=gameOver`, `winner`. |
| `/topic/game/{gameId}` | `GameLoopScheduler#pollEndConditions` | Map with `event=gameEnded`, `gameId`, `winner`. |
| `/topic/game/{gameId}` | `TurnService#createResponse` | `TurnResponse` record; method appears unused in current active flow. |

## Frontend usage

The active frontend game screen does not currently subscribe.

Evidence:

- `sindopoly-front/src/pages/Game/Board.jsx` contains a STOMP/SockJS `useEffect` subscription to `/topic/game/${gameId}`, but the whole block is commented out.
- `Board.jsx` instead polls `handleTick` every 2s.
- `Lobby.jsx` polls players/game status every 1s.

## Message trace: current effective flow

```text
Client dice click
-> REST POST /api/turn/{gameId}/{playerId}/throw
-> TurnController#throwDice
-> TurnService#throwDice
-> Redis game/player mutations
-> HTTP ThrowResultDto response
-> Frontend modal
-> REST POST /api/turn/{gameId}/{playerId}/action
-> TurnController#doAction
-> TurnService#applyAction
-> Redis action mutations + turn rotation
-> SimpMessagingTemplate.convertAndSend("/topic/game/{gameId}", actionCompleted)
-> no confirmed active frontend subscriber
-> frontend refreshes via REST polling
```

## Risks

| Finding | Classification | Evidence |
| --- | --- | --- |
| Arbitrary topic subscription risk | P1 missing hardening | WebSocket origin pattern is `*`; no handshake authentication or subscription authorization is configured. |
| Events can be missed without recovery contract | P3 | Frontend subscription commented out; no message replay/idempotency markers documented. |
| Multiple event names for end game | P2 | `gameEnded` from scheduler, `gameOver` from `TurnService`. |
| In-memory broker is not multi-instance aware | P1/P3 | `enableSimpleBroker("/topic")`; no external STOMP broker relay. |
| No inbound destination validation because no inbound handlers | Missing hardening | `/app` prefix configured, but no active `@MessageMapping`; if added later, security config must cover it. |

