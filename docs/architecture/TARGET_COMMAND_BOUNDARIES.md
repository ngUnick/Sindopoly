# Target command boundaries and state ownership

## Intent

This is Sindopoly's canonical target-boundary model. It is an incremental destination, not a rewrite or an implementation of authentication, concurrency, or realtime transport. Current REST DTOs, Redis keys, MariaDB schemas, and WebSocket topics remain unchanged until a later approved migration.

The target is one server-authoritative command path for each game transition. No CQRS framework, event sourcing, microservices, interface-per-class rule, or message bus is required.

The decisions that refine this model are:

- [ADR 0001: Authenticated player identity and session](adr/0001-authenticated-player-identity-and-session.md)
- [ADR 0002: Per-game transition atomicity and idempotency](adr/0002-per-game-transition-atomicity-and-idempotency.md)
- [ADR 0003: Active game state versioning and Redis lifecycle](adr/0003-active-game-state-versioning-and-redis-lifecycle.md)
- [ADR 0004: Realtime delivery and recovery](adr/0004-realtime-delivery-and-recovery.md)

## Target responsibilities

| Layer | Owns | Does not own |
| --- | --- | --- |
| Transport | REST/STOMP parsing, transport validation, actor-context extraction, command construction, response/ack and error mapping | Rules, Redis keys, turn mutation, dice generation, authority from payload IDs, event sequencing |
| Application command service | Use-case coordination, authorization, state load, idempotency/concurrency boundary, domain invocation, persistence/event coordination | HTTP/STOMP types, raw Redis details, frontend state, rule calculations |
| Domain/game rules | Deterministic transition guards/outcomes: movement, dice interpretation, square/rent/tax/card/jail effects once canonicalized, phase, game end | HTTP, STOMP, Redis keys, MariaDB queries, browser state, retry semantics |
| Active game-state store | Redis keys, serialization, load/save, TTL/lifecycle, atomic primitives and later version/lock/CAS/Lua support | Client authorization and policy decisions |
| Persistent repositories | MariaDB access for players, board/card definitions, accumulated statistics | Active turn mutation or Redis ownership |
| Scheduler | Detects due work and submits timeout/cleanup commands | Independent rule mutation or broker events bypassing persistence |
| Event publisher/delivery | Application-created post-persistence events and STOMP delivery to authorized subscribers | State mutation and durable state |

## Canonical command flow

```text
Client intent
  -> REST controller or future inbound STOMP handler                     [transport]
  -> authenticated actor resolution                                      [transport/security]
  -> transport validation and command construction                       [transport]
  -> application command service                                         [application]
  -> membership / host / active-player / phase authorization             [application]
  -> command ID, idempotency, per-game concurrency boundary              [application + store]
  -> load authoritative active state and durable metadata                [infrastructure]
  -> deterministic domain transition                                     [domain]
  -> persist accepted authoritative state                                [store/repositories]
  -> construct/publish an authoritative event                            [application + publisher]
  -> STOMP delivery to authorized subscribers                            [transport]
  -> REST response or WebSocket acknowledgement                          [transport]
```

Only the application layer coordinates an accepted transition. Domain rules may reject it. Transport maps typed domain/application errors. A successful event exists only after authoritative persistence.

## Representative target traces

### Create lobby/game

The transport creates `CreateLobbyCommand`. The authenticated actor, not `GameCreationRequest.ownerId`, is creator. The application service verifies durable player existence, applies lobby policy, and asks the store to create Redis lobby, membership, and TTL together. MariaDB owns player identity; Redis owns the active lobby. The result maps to the existing response and may later emit `lobbyCreated`.

### Join lobby

`JoinLobbyCommand` accepts a game selector/invite and trusted actor. It owns duplicate-membership, visibility/invite, capacity, and lobby-phase checks in one place, replacing the split between `GameStateController#addPlayer` and `GameStateService`. The store atomically updates membership with the applicable game version; a resulting membership event follows persistence.

### Start game

`StartGameCommand(gameId, actor)` loads the lobby, proves host authority and minimum-player eligibility, invokes the domain start transition, and persists phase, turn metadata, and initialized active player state. Repositories provide only durable player/board metadata. The application layer then emits the game-start event while existing REST shape remains an adapter.

### Roll dice

`RollCommand(gameId, actor, commandId?)` accepts no dice, position, balance, or active-player claim as authority. The application service verifies membership, active player, and phase; establishes the per-game idempotency/concurrency boundary; loads state; obtains server-generated randomness; and invokes deterministic rules. It persists movement and pending/automatic outcome as one accepted transition, then emits the resulting event. This corrects the current inconsistency where `TurnService#throwDice` mutates Redis but publishes no broker event. Doubles and jail rules remain for REVAMP-014.

### Optional action / pass

The transport creates `ResolveOptionalActionCommand(gameId, actor, choice, commandId?)` from the path/destination and choice. It rejects mismatched body identity; bodies should eventually carry no authority IDs. The command checks actor, phase, and pending-action ownership; applies the rule; persists cleared pending state and turn advancement; then emits one authoritative completion/turn event. This replaces `TurnController#doAction` passing body IDs directly to `TurnService#applyAction`.

### Timeout, disconnect, reconnect, cleanup

The scheduler submits `TimeoutCommand` through the same application transition path. It cannot independently call `GameStateService#checkEndCondition` and broadcast. Disconnect/reconnect become commands when their rules are defined. Cleanup may follow an already-committed terminal transition, but cannot create a second terminal transition.

## Current-to-target corrections

| Concern | Current owner(s) | Problem | Target owner | Relevant work |
| --- | --- | --- | --- | --- |
| Lobby validation | `GameStateController` + `GameStateService` | Duplicate/capacity policy split | Lobby command service | REVAMP-015–018 |
| Actor authority | Path/query/body IDs | Client IDs treated as proof | Actor resolver + command authorization | REVAMP-015, 016 |
| Turn flow | Controller, `TurnService`, `GameStateService` | Orchestration, state, events coupled | Turn command service, rules, store | REVAMP-018–020 |
| Dice rules | `TurnService` + `DiceService` | Entangled with orchestration | Dice collaborator + domain transition | REVAMP-010, 014 |
| Redis access | Multiple services build raw keys | Ownership/atomicity scattered | Active game-state store | REVAMP-011, 018, 021 |
| End/timeout | Scheduler, `TurnService`, `GameStateService` | Duplicate terminal paths/events | Timeout/end command | REVAMP-019, 020 |
| WebSocket events | Turn/scheduler broker calls | Partial/inconsistent post-state events | Event publisher then STOMP adapter | REVAMP-013, 021, 022 |

## State ownership

- **Redis:** the active game-state store owns active game hashes, membership, active player state, pending action, deck, turn/lifecycle metadata, TTL, and atomicity. Redis remains authoritative for in-progress games.
- **MariaDB:** repositories own durable players/identity metadata, board/card definitions, and accumulated/end-game statistics. It is not a second live turn-state writer.
- **Transport:** REST responses and STOMP messages are derived representations, never authoritative state. The verified broker is Spring's in-memory STOMP simple broker.
- **Frontend:** browser storage, polling snapshots, and UI state are display/input only; they cannot authorize or set game state authoritatively.

This makes no Redis schema decision; the owner-as-game-ID convention, player-key scope, and any key migration require a later ADR.

## Security, idempotency, concurrency

Authentication resolves the actor at REST and future STOMP entry. The command boundary applies membership, host, active-player, and turn-phase authorization. Path/query/body IDs are selectors or consistency checks, never proof. Frontend claims are input only; WebSocket subscription authorization remains a distinct transport concern.

Invariants: server-derived identity; membership before access; host authority for lobby operations; active-player/phase authority for turns; server-generated dice; no client-authoritative balances/positions/ownership/state; replay protection below transport parsing.

Transport accepts a stable command ID for retryable intents. The application service deduplicates and the store retains bounded markers/results with explicit lifecycle. Domain rules do not implement HTTP retry semantics; ADR 0002 defines the contract and leaves encoding/TTL configuration to implementation.

Controllers do not solve concurrency and rules only express valid transitions. Per ADRs 0002 and 0003, the application/store boundary uses an expected state version and a centralized atomic Redis compare-and-commit, initially directed toward Lua on the current topology. Exact scripts/key shapes remain implementation details; global locking is excluded.

## Event ownership and transport convergence

An accepted application transition decides an event exists. After state-store and necessary durable repository work succeeds, the application layer constructs the authoritative event and the publisher hands it to a STOMP adapter. Delivery does not decide state mutation. Current behavior is recorded, not endorsed: dice throw sends no broker event while optional action sends `actionCompleted`. REVAMP-021/022 repair consistency, ordering, recovery, and delivery.

Redis Pub/Sub is not assumed; current delivery is Spring's in-memory STOMP simple broker. REST and future inbound WebSocket commands must invoke the same application command and domain transition. This does not choose a preferred transport.

## Error ownership

| Failure | Owner | Transport behavior |
| --- | --- | --- |
| Malformed path/body/message | Transport | Protocol-safe validation error |
| Missing/expired identity | Security/actor resolution | Authentication failure |
| Membership/host/turn/phase denial | Application authorization | Safe authorization/conflict response |
| Invalid rule transition | Domain | Stable rejection translated by transport |
| Stale/concurrent state | Application/store | Conflict/retry-safe result; no partial event |
| Duplicate command | Application idempotency | Prior result or explicit duplicate outcome |
| Redis/MariaDB/broker failure | Infrastructure | Safe service failure, no raw internals |

## Test and documentation implications

**REVAMP-010:** deterministic seams and unit tests target domain rules and focused application collaborators, not Redis/STOMP. Rent/jail/doubles remain unapproved until REVAMP-014.

**REVAMP-011:** integration fixtures test state-store/application edges: Redis lifecycle/cleanup, MariaDB initialization/metadata, and REST command contracts—not browser E2E. Dedicated WebSocket coverage is REVAMP-022.

Future code should comment non-obvious concurrency/idempotency, persist-before-event ordering, server-derived identity, timer reuse, and Redis atomicity/lifecycle invariants.

## Configurable and implementation-level non-decisions

| Deferred decision | Later owner |
| --- | --- |
| Exact session store, cookie tuning, and authorization implementation | ADR 0001; REVAMP-015/016 |
| Lua operation, command encoding, and active-lifecycle marker TTL | Implemented by REVAMP-018; timer/stats refinements remain REVAMP-020 |
| Final Redis key shapes and migration schedule | ADR 0003; REVAMP-021/024 |
| Exact event field encoding and any later multi-instance broker | ADR 0004; REVAMP-021/022 |
| REST versus WebSocket command preference | ADR 0004 leaves both as adapters |
| Redis Pub/Sub/Streams/broker relay | ADR 0004 defers until demonstrated need |
| Doubles, rent, jail, turn order, optional-action rules | REVAMP-010 and REVAMP-014 |
| Deployment topology/multi-instance strategy | Later ADR/release work |

## Incremental adoption check

Adopt by vertical slice: record ADRs, introduce trusted identity, route one command at a time through the boundary, centralize only needed state-store operations, then add integration/event tests. Existing controllers, DTOs, and simple broker remain adapters. No broad rewrite or distributed architecture is required.
