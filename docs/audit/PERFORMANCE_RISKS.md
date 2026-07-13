# Performance risks

Classification terms:

- Confirmed performance problem: evidenced by code and/or command output.
- Probable risk: code pattern is likely costly at scale.
- Possible risk requiring measurement: plausible but needs profiling/load tests.
- Acceptable current implementation: fine for small prototype scale.

## Findings

| Finding | Classification | Evidence | Notes |
| --- | --- | --- | --- |
| Redis `KEYS` scans are used for membership, lobby listing, scheduler scans. | Probable risk | `GameStateService#isPlayerInAnyGame`, `getAllPublicLobbyGames`, `addPlayerToGameWithInviteCode`; `GameLoopScheduler` | Fine for tiny data, risky as game count grows. |
| Lobby polling every 1s. | Possible risk requiring measurement | `Lobby.jsx` uses `setInterval(fetchPlayers, 1000)` | Increases REST load with lobby count/client count. |
| Board polling every 2s. | Possible risk requiring measurement | `Board.jsx` uses `setInterval(handleTick, 2000)` | WebSocket path is inactive, so polling carries game updates. |
| `getPlayersDetailed` does N+1 MariaDB player lookups and N Redis hash reads per snapshot. | Probable risk | `GameStateController#getPlayersDetailed` loop | Small max 4 players reduces impact; acceptable short-term. |
| Property owner lookup scans every player properties JSON. | Probable risk | `SquareActionService#findOwner`, `fetchProperties` | Repeated JSON parse/Redis reads during rent calculations. |
| Train/full-set rent calls `findOwner(...).toString()` without null checks. | Functional risk with perf side effect | `SquareActionService#rentForTrainsOwned`, `maybeDoubleForFullSet` | Can throw before performance matters. |
| Frontend production JS chunk is large. | Confirmed build warning | Vite build: `index-*.js` 1,522.72 kB, gzip 455.23 kB; chunk > 500 kB warning. | Likely driven by Three.js/Ant Design/assets; defer optimization until functionality stabilizes. |
| Random.org refill blocks scheduler thread if enabled. | Possible risk requiring measurement | `DiceEntropyRefillJob#refill` calls `.block()` | Only active with `dice.source=randomorg`. |
| Leaderboard cache has no TTL. | Possible stale-data risk | `StatsService#refreshLeaderboard`, `getLeaderboard` | Scheduled refresh every 60s mitigates but no explicit expiry. |
| Docker/frontend includes large assets. | Confirmed build output | GLB/MP3/PNG sizes in Vite output | Acceptable for current 3D game, but should be budgeted. |

## Acceptable current implementation

- Redis string serialization is simple and workable for the current small schema.
- MariaDB N+1 player details are bounded by max 4 players, so this is not a top priority.
- Vite build warnings are not blockers.

