# Current dice and turn-flow audit

## Who generates dice?

The server generates dice.

Evidence:

- Frontend calls `TurnAPI.throwDice(gameId, playerId)` without passing dice values.
- `TurnController#throwDice` delegates to `TurnService#throwDice`.
- `TurnService#performDiceMove` calls `DiceService#roll`.
- `DiceService#roll` calls `RandomIntGenerator#nextDie` twice and returns the sum.

## Dice source

- Default configured source is `secure` in `DiceSourceConfig` via `@Value("${dice.source:secure}")`.
- `SecureRandomGenerator#nextDie` uses `SecureRandom`.
- Optional random.org support exists with Redis list key `dice:entropy`, but only active when `dice.source=randomorg`.

## Current effective state machine

| Current state | Allowed command | Validation | Mutation | Published event | Next state / behavior |
| --- | --- | --- | --- | --- | --- |
| Game not in progress | `POST /api/turn/{gameId}/{playerId}/throw` | `TurnService` checks `status == inProgress` | None | None | Throws `IllegalStateException`. |
| In progress, wrong player | `throw` | `ValidationUtils#ensurePlayerTurn` compares `gameHash.playerTurn` to path `playerId` | None | None | Throws `IllegalStateException("Not your turn.")`. |
| In progress, optional action pending | `throw` | `game.containsKey("optionalAction")` | None | None | Throws `IllegalStateException("Finish your pending action first.")`. |
| In progress, active player not bankrupt/in jail | `throw` | Player exists; active player | Sets `player:{playerId}.afk=false`; sets `game:{gameId}.lastDice`; updates player position/money; stores `optionalAction` JSON if serializable | None in `throwDice` | Returns `ThrowResultDto`; frontend opens modal. |
| In jail with `jailTime > 1` | `throw` | Active player | Decrements `jailTime`, rotates turn | None | Returns dice `0`, position `-1`, square type `-1`. |
| Pending optional action | `POST /api/turn/{gameId}/{playerId}/action` | Reads `req.gameId` and `req.playerId` from body; path values are not compared | Applies buy/jail/automatic action; clears optional; rotates turn | `/topic/game/{gameId}` event `actionCompleted` | Returns `ActionResultDto`. |
| Pending optional action | `POST /api/turn/{gameId}/{playerId}/pass` | `GameStateService#assertOptionalAction(gameId, playerId)` | Clears optional; rotates turn via `finishTurn` | `/topic/game/{gameId}` event `turnFinished`; maybe `gameOver` | Returns `{status:"passed"}`. |

## Confirmed risks

| Finding | Classification | Evidence |
| --- | --- | --- |
| Duplicate roll requests are not idempotently rejected after the first roll unless `optionalAction` was stored. If `optionalJson` serialization fails or an event is informational, the player can potentially roll again before action. | P1, likely vulnerability / data corruption risk | `TurnService#throwDice` only checks `optionalAction`; no command ID, roll marker, transaction, or lock. |
| Path and body IDs can diverge for `/action`. | P1 security weakness | `TurnController#doAction` receives path `gameId/playerId` but calls `turnSvc.applyAction(req)`; `TurnService#applyAction` trusts `req.getGameId()` and `req.getPlayerId()`. |
| Dice/movement/optional storage is not atomic. | P1 concurrency risk | `TurnService#throwDice` uses several Redis writes through services without Redis transaction/Lua/lock. |
| Turn rotation uses sorted player IDs, not join order. | P2 game-flow risk | `TurnService#rotateTurn` sorts `getPlayersInGame(gameId)`; comment in `GameStateController#getPlayersDetailed` says join order, but Redis Set has no ordering guarantee. |
| `rentDue` applies money in the wrong direction. | P1 likely data corruption | `SquareActionService#applyAutomatic` for `"rentDue"` writes `player += rent` and owner `+= rent`; expected behavior likely payer decreases. Needs confirmation against intended rules, but current code increases both. |
| Go-to-jail handling is contradictory. | P2 | `SquareActionService#peekSquare` returns `jailOffer` for both `JAIL` and `GOJAIL`; `TurnService` maps `jailOffer` to default square type `4`, while frontend expects jail offer as square type `8`. |

## Doubles

Status: UNVERIFIED / not implemented.

`DiceService#roll` returns only a sum. It does not expose individual dice or doubles. `TurnService` has no doubles counter or extra-turn logic.

## Multi-instance behavior

Status: likely unsafe.

Redis is shared, but there are no per-game locks, atomic compare-and-set transitions, or idempotency keys. Multiple backend instances could process simultaneous roll/action requests for the same turn.

