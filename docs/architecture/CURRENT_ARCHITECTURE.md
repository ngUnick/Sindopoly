# Current architecture

## Runtime topology

The browser client talks to one Spring Boot application over credentialed REST
and SockJS/STOMP. Redis is authoritative for transient active-game state and
MariaDB for durable player metadata, board/card reference data, statistics, and
finalization records. The Docker Desktop development topology adds Nginx for the
built frontend.

```text
React browser
  |-- credentialed REST --> Spring Security/controllers --> command services
  |                                                       --> Redis Lua CAS
  |                                                       --> MariaDB reads/writes
  |<-- versioned STOMP notification ---------------------- event publisher
  |-- recover member snapshot ---------------------------> read projection

Schedulers --> timeout/completion commands --> same transition boundary
```

## Authoritative mutation path

Controllers authenticate the opaque HTTP session and adapt transport input.
Application command services derive the actor server-side and enforce game
membership, host/active-player/phase authority, command UUID, and expected state
version. `RedisGameTransitionStore` compares and commits all affected Redis
values plus the replay result atomically with Lua. Repeated equivalent commands
return the recorded result; a reused UUID with different intent or stale version
does not mutate state.

Domain services calculate server-owned dice, movement, square effects, typed
optional actions, rotation, completion, and cleanup. Timers invoke the same
versioned boundary rather than mutating Redis independently. Notifications are
published only after an applied commit and are not state.

The complete command path is: client intent → REST adapter → authenticated
session actor → command UUID/expected-version parsing → input validation →
authoritative state load and authorization → domain transition plan → Redis Lua
compare-and-set → post-commit event → semantic HTTP response. Replay returns the
recorded response without a second event; stale version, command-ID collision,
capacity, and no-op outcomes do not apply a second mutation.

## Read and recovery path

Member-only snapshots project lifecycle, active turn, version, typed optional
action, winner, and bounded player data from Redis. Reads bracket the multi-key
projection with `stateVersion` and retry changing state. The frontend subscribes
to `/topic/game/{gameId}`, then reads a snapshot; any newer/gapped notification
causes another snapshot. Polling remains a compatibility fallback.

## State ownership

| Concern | Current owner |
| --- | --- |
| Active game, membership, turn order, gameplay fields, deck | Redis |
| Atomic transitions and command replay | Redis Lua via `RedisGameTransitionStore` |
| Lifecycle/turn rules | Application command/domain services |
| Identity | Opaque HTTP session bound to durable player ID |
| Player/reference/statistics/finalization data | MariaDB |
| Schema/reference-data evolution | Flyway migrations |
| Event delivery | Spring in-memory STOMP simple broker |
| Missed-event recovery | Authenticated REST snapshot |

The broker and subscription registry are process-local, so cross-instance
realtime delivery is not claimed. Redis Pub/Sub/Streams are not used. Redis and
MariaDB do not form one transaction; terminal results are frozen in Redis and
MariaDB finalization is idempotently retried before Redis expiry. TLS termination
is external to the application/Nginx containers.

See `AUTHORITATIVE_GAME_TRANSITIONS.md`, `TRANSITION_SAFE_GAME_LIFECYCLE.md`,
`REALTIME_SYNCHRONIZATION.md`, `DATABASE_MIGRATION_OWNERSHIP.md`, and
`../operations/CURRENT_LIMITATIONS.md` for the detailed contracts.
