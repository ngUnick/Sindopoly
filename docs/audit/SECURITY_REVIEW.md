# Security review

## Executive security posture

Current backend is effectively unauthenticated and client-trusting. This is acceptable only for a closed prototype. It is not safe for untrusted multiplayer deployment.

Evidence: `WebSecurityConfig` disables CSRF and permits all requests; WebSocket endpoint allows all origins; frontend identity is stored client-side.

## Findings

| Finding | Classification | Priority | Evidence | Notes |
| --- | --- | --- | --- | --- |
| All HTTP endpoints are public. | Confirmed vulnerability | P1 | `WebSecurityConfig#apiSecurity`: `anyRequest().permitAll()` | Any caller can create/delete games, mutate players, grant money. |
| Arbitrary player state write endpoint. | Confirmed vulnerability | P1 | `PlayerStateController#savePlayer`; `PlayerStateService#savePlayerState` | Client can set position, money, properties, jail flags. |
| Money grant endpoint is public. | Confirmed vulnerability | P1 | `POST /api/player-state/grant-money/{playerId}/{amount}` | Direct cheating endpoint. |
| Game deletion/removal/check-end are public. | Confirmed vulnerability | P1 | `DELETE /api/game-state/{gameId}`, `remove-player`, `check-end` | Anyone can disrupt games. |
| Turn `/action` trusts body IDs over path IDs. | Likely vulnerability | P1 | `TurnController#doAction` ignores path values when calling `turnSvc.applyAction(req)`. | Enables request tampering if no auth. |
| WebSocket subscriptions have no auth/authorization. | Security weakness | P1 | `/ws` allowed origin `*`; no channel security. | Clients can subscribe to arbitrary `/topic/game/{id}`. |
| Game membership is not consistently validated on game-state reads/actions. | Security weakness | P1 | Public raw game/player reads; turn validates active player ID but not authenticated identity. | IDOR pattern. |
| Default credentials are committed. | Security weakness | P1/P4 depending deployment | `docker-compose.yml`, `application.properties` contain `nick`, `nick123`, `nick123root`. | Fine for local sample only if documented and overridden. |
| CORS rules conflict/are broad. | Missing hardening | P2 | `WebSecurityConfig` allows `http://localhost` for `/api/**`; `CorsConfig` allows dev origins for `/**`; WebSocket allows `*`. | Needs production profile. |
| CSRF disabled. | Needs further verification | P2 | `WebSecurityConfig` | If auth cookies are introduced, revisit. |
| No rate limiting/abuse control. | Missing hardening | P2 | No filters/interceptors found. | Relevant for create/join/turn endpoints. |
| Replay/duplicate commands not prevented. | Likely vulnerability | P1 | No idempotency key or lock in turn/action flow. | Core game integrity. |
| Error messages expose validation details. | Security weakness | P3 | `GlobalExceptionHandler#handleBadRequest` returns exception message. | Useful in dev; review for prod. |
| Logs can expose player/action details. | Missing hardening | P3 | `System.out.println` in services/controllers; debug pending event JSON in `TurnService#applyAction`. | Avoid logging sensitive command payloads in prod. |
| Redis and MariaDB ports exposed to host. | Missing hardening | P2 | `docker-compose.yml` publishes 3306 and 6379. | Local dev OK; not safe on shared host without firewall. |

## Client influence over game state

Confirmed unsafe:

- Clients can submit arbitrary `player:{playerId}` state through `POST /api/player-state/{playerId}`.
- Clients can directly grant money.
- Clients can trigger game deletion/removal/check-end.

Server-authoritative parts:

- Dice values are generated server-side by `DiceService`.
- Movement is computed server-side by `MovementService`.

But server authority is undermined by direct mutation endpoints and missing auth.

