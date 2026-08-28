# Sindopoly performance baseline and decisions

This is the canonical REVAMP-027 performance record. It describes measured or
structurally provable costs, the narrow optimization accepted from that evidence,
and the apparent inefficiencies deliberately left unchanged. It does not claim a
throughput or latency benchmark that was not run.

## Method and scale

The review used production call-path tracing, deterministic Redis command counts,
repository-query inspection, the existing frontend build-size output, fast tests,
and Redis 7 Testcontainers command statistics. Wall-clock thresholds are excluded
because they would be unstable across developer and CI hosts.

The supported game scale is small and bounded per game:

- one to four players in frozen join order;
- one game HASH, one membership SET, an optional deck LIST, and up to four player
  HASHes per active game;
- at most 4096 command replay fields per game, with O(1) HASH-field lookup;
- one small typed notification per applied transition;
- 10-second lobby and 15-second board recovery polling when realtime delivery is
  unavailable;
- no configured global active-game limit before Redis TTL expiry.

The missing global game bound is why an O(N) keyspace operation on the two-second
scheduler path is meaningful even though individual games are small.

## Inventory

| Area | Current cost/evidence | Classification | Decision |
| --- | --- | --- | --- |
| Redis discovery | Four production `RedisTemplate.keys(...)` calls; scheduler discovery runs every two seconds and public-lobby discovery is polled every ten seconds per search client. `KEYS` blocks Redis while traversing the matching keyspace. | P1 | Replaced with cursor `SCAN` over existing keys. |
| Redis command preflight | Authorization reads one game HASH and membership SET. A command snapshot reads the game HASH, membership SET, up to four player HASHes, and deck LIST; replay adds one command HASH-field read and commit is one Lua execution. | P2, bounded | Retained: collapsing security and command ownership would add trust ambiguity for small bounded savings. |
| Stable snapshots | A successful stable read uses two version `HGET`s around one `P+3` snapshot read, where `P <= 4`; at most three attempts. | P2, bounded | Retained; version bracketing is the recovery consistency contract. |
| Redis serialization | String serialization plus bounded JSON for order, optional action, terminal result, properties, and replay result. | P3 | Retained for compatibility; no format migration. |
| Lua CAS | One bounded script validates types, replay, version, plan, and TTL before writes. Replay lookup remains HASH-field based and command capacity is 4096. | P3/required correctness | Retained unchanged; no partial-write or atomicity tradeoff. |
| Scheduler | Discovery every two seconds; each candidate is then checked through transition-safe lifecycle/timeout services. Absolute deadlines avoid decrement writes. | P1 discovery, P2 follow-up reads | Discovery fixed. Shared lifecycle/timeout snapshot work remains a future measured candidate because CAS/race clarity outweighs an unmeasured refactor. |
| MariaDB | Player-detail endpoints and finalization perform bounded per-player reads (`<= 4`). Public lobby performs one creator lookup per returned lobby. Leaderboard refresh reads and sorts all Stats every 60 seconds. | P2 for leaderboard growth; otherwise P3/bounded | No query change without row-count/query-stat evidence. |
| JPA N+1/open-in-view | Player loops are bounded by four. `Stats.player` is eager, but actual leaderboard query count was not instrumented. No lazy web dependency was proven or disproven by inspection alone. | P2 requiring measurement | Open-in-view and fetch strategy retained; the warning alone is not evidence for a behavior change. |
| Card/Square lookups | Static rows are queried during selected turns and final asset calculation; a game has 40 Squares and 40 Cards. | P2 requiring measurement | No JVM cache or invalidation policy added. |
| Leaderboard Redis cache | Existing `stats:leaderboard` STRING has no TTL and is refreshed every 60 seconds. | P2 stale-data/scale concern, not a proven hot path | Key, value, and semantics unchanged. |
| Realtime delivery | Exactly one bounded envelope follows `APPLIED`; replay, stale, reuse, and no-op outcomes publish none. Snapshot remains authoritative. | P3/acceptable | No full snapshot in events and no broker redesign. |
| Frontend recovery | Event bursts coalesce while one snapshot is in flight and permit only one required follow-up; polling remains 10/15 seconds. | P3/acceptable | No polling removal, increase, or global client cache. |
| Frontend bundle | REVAMP-027 Vite output is 1,591.89 kB JavaScript / 477.76 kB gzip and warns above 500 kB; Three.js/UI/game assets are material contributors. | P2 download-size concern | No broad code splitting without a load-time target or route/profile evidence. Nginx already caches fingerprinted assets. |
| Blocking/threading | No global JVM game lock. Optional random.org refill calls `.block()` only when that dice source is enabled. | P3/configuration-specific | No new threads, reactive rewrite, or scheduler change. |
| Logging/allocation | No ordinary successful-turn INFO/WARN logging and bounded notification DTO allocation. | P3 | No micro-optimization or diagnostic loss. |
| Startup/test work | Flyway validation/legacy bridge is startup-only; Testcontainers setup and negative-path warnings are test-only. | Not production hot-path | Excluded from runtime optimization. |

No P0 performance/correctness finding was found.

## Redis discovery change

Before REVAMP-027, these live paths invoked blocking `KEYS`:

| Owner/path | Pattern | Frequency |
| --- | --- | --- |
| `RedisGameDiscovery.activeGameIds` → scheduler | `game:*` | Every two seconds. |
| `RedisGameDiscovery.activeGameIds` → invite lookup | `game:*` | Per invite metadata/join lookup. |
| `RedisGameDiscovery.isPlayerInAnyGame` → create/join | `game:*:players` | Per create/join capacity check. |
| `GameStateService.getAllPublicLobbyGames` | `game:*` | Per public-lobby request; frontend fallback is ten seconds. |
| `GameStateService.isPlayerInAnyGame` | `game:*:players` | Per authenticated membership-status request. |

The two facade paths now delegate to `RedisGameDiscovery`; the adapter uses
Spring Data Redis cursor `SCAN` with `MATCH` and a COUNT hint of 128. The hint is
not a limit or snapshot guarantee. Redis may return zero keys in a nonterminal
batch, repeat keys, or observe concurrent creation/expiry. The adapter consumes
the cursor to completion, deduplicates raw keys, sorts accepted game IDs, and
accepts only exact positive 32-bit decimal forms:

- `game:<id>` for active game discovery;
- `game:<id>:players` for membership discovery.

Zero, negative, non-numeric, overflow, empty, and suffix variants are ignored.
Discovery is only a candidate set: selected resources and mutations are still
validated through authoritative reads and Lua CAS, so SCAN weak consistency does
not grant membership, bypass versioning, or create state.

## Before/after evidence

| Finding | Before | Evidence | Change | After | Correctness risk | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| Blocking game discovery | One global-blocking `KEYS` command per discovery invocation; four production call sites. | Source search and scheduler/public polling traces. | Central cursor scan in `RedisGameDiscovery`; read facade delegates to it. | Zero production `.keys(...)` calls. Work remains O(N), but each Redis command is cursor-bounded and yields between batches. | SCAN is weakly consistent and can repeat keys. | Unit tests cover exact parsing and duplicate tolerance. Redis 7 integration populated 512 canonical games plus malformed/suffix keys, observed more than two `SCAN` calls and no `KEYS`, and returned the exact expected set. |

SCAN can use more Redis commands than one `KEYS`; the improvement is bounded
server blocking, not fewer commands or claimed lower elapsed time. No persistent
active-game index was introduced because maintaining index/key TTL consistency
would add a new schema and correctness path without evidence that SCAN is
insufficient.

## Redis round-trip baseline

The following are structural counts for a stable, non-retrying path:

- `activeGameIds`: before one blocking `KEYS`; after `C` cursor `SCAN` calls,
  where Redis controls `C` and COUNT 128 is only a hint.
- cross-game membership: discovery plus up to `G` `SISMEMBER` calls, stopping on
  the first match; `G` is discovered canonical membership sets.
- invite lookup: active-game discovery plus up to `G` invite-code `HGET`s.
- authoritative `load`: `P + 3` calls (`HGETALL` game, `SMEMBERS`, `P` player
  `HGETALL`, and deck `LRANGE`), with `P <= 4`.
- successful `loadStable`: `P + 5` calls per attempt because two version `HGET`s
  bracket `load`.
- authorization read: one game `HGETALL` plus one membership `SMEMBERS`.
- replay/commit: one command-record `HGET` when preflight is required and one
  atomic Lua execution for commit.

No pipelining was added. Player reads are independent and bounded by four, while
pipelining would complicate error/result mapping and cannot replace stable-read
version brackets or mutation CAS.

## Compatibility and intentionally unoptimized areas

- Redis names, types, serializers, TTLs, ownership, replay JSON, command capacity,
  and fail-closed semantics are unchanged. No active-game, rate-limit, Pub/Sub,
  Stream, or security key exists.
- MariaDB schema, indexes, Flyway V1, transaction/finalization behavior, REST
  paths/DTOs/headers, STOMP destinations/envelopes, game rules, timers, and
  frontend polling contracts are unchanged.
- No JVM authoritative cache, async/reactive stack, parallel stream, thread pool,
  Hikari tuning, SQL logging/statistics in production, or speculative DTO/JSON
  micro-optimization was added.
- Leaderboard query shape, bounded player-detail reads, static board lookups,
  scheduler follow-up reads, open-in-view, random.org blocking, and bundle
  splitting remain candidates only after workload/query/load-time evidence.
- The process-local broker and Redis-to-STOMP crash gap are architecture and
  reliability limitations, not REVAMP-027 performance changes.

## Reproduction

Fast discovery characterization:

```powershell
cd Sindopoly-Java
.\mvnw.cmd -Dtest=RedisGameDiscoveryTest test
```

The Docker-backed integration tier includes a Redis 7 characterization that
creates isolated synthetic keys, resets command statistics, verifies cursor
pagination and exact filtering, and confirms `cmdstat_keys` is absent. It runs
with the canonical integration command documented in `LOCAL_VERIFICATION.md`.
