# Sindopoly threat model baseline

This is a lightweight, repository-specific threat model for Sindopoly. It is intended to guide future feature reviews, not to replace implementation-specific security analysis.

The initial evidence below is the pre-revamp threat baseline. Current identity,
authorization, CAS, realtime, and migration controls are documented in the
canonical security and architecture references; REVAMP-025 removes the
production-unwired `TurnService` and raw projection-service mutators without
removing those controls.

REVAMP-026 additionally replaces committed deployment credentials with explicit
development/production profiles, centralizes restrictive REST/WebSocket origins,
requires production Redis TLS and HTTPS browser origins, hardens cookies and
error/log disclosure, and bounds WebSocket transport resources. The canonical
current deployment contract and residual risks are in `DEPLOYMENT_SECURITY.md`;
older wildcard/default-credential observations below remain historical evidence.

Pre-revamp evidence baseline (historical; do not use as current architecture):

- REST controllers live under `Sindopoly-Java/src/main/java/com/example/Sindopoly_Java/controller`.
- WebSocket/STOMP is configured in `config/WebSocketConfig.java` with `/ws`, `/topic`, and `/app`.
- `WebSecurityConfig#apiSecurity` currently permits all requests.
- Active game state is stored in Redis through services such as `GameStateService`, `PlayerStateService`, `TurnService`, `SquareActionService`, `CardService`, and `StatsService`.
- MariaDB stores players, cards, squares, and stats through `model/*`, `repository/*`, and `MariaDB/init.sql`.
- Frontend player identity currently comes from browser storage and request parameters, for example `localStorage.getItem("player_id")` in `sindopoly-front/src/apis/GameAPI.jsx` and related pages.

## Actors

| Actor | Description | Security concern |
| --- | --- | --- |
| Unauthenticated external user | Anyone who can reach REST or WebSocket endpoints. | May create, read, mutate, or delete game state if endpoints are public. |
| Authenticated player | A legitimate player in the system. | May attempt actions outside their game or turn. |
| Malicious authenticated player | A valid player intentionally cheating or disrupting games. | May forge IDs, replay commands, spam joins, manipulate state, or subscribe to private topics. |
| Disconnected or reconnecting player | A player whose browser or network drops and later resumes. | May miss events, replay stale commands, or rejoin during cleanup. |
| Game host | Player who creates/starts a lobby. | Has elevated lobby actions; host powers must be explicit and bounded. |
| Administrator, if applicable | No confirmed admin role in current code. | Future admin operations require separate authorization and auditability. |
| Compromised or buggy frontend | Browser code, storage, or API calls cannot be trusted as authority. | May send forged player IDs, dice values, balances, positions, or stale commands. |
| Duplicate or delayed message producer | Browser retry, double-click, network retry, scheduler, or messaging layer. | May cause duplicate rolls/actions/events without idempotency. |
| Multiple backend instances | Future scaled deployment with more than one Spring Boot instance. | May process the same command concurrently or publish inconsistent events. |
| Internal infrastructure failure | Redis, MariaDB, WebSocket broker, Docker/network, or external random.org failure. | May cause partial state, dropped events, stale data, or unsafe retries. |

## Protected assets

- Authoritative game state.
- Player identity and session-to-player mapping.
- Turn ownership.
- Active player.
- Turn phase and state version.
- Dice results.
- Player positions.
- Balances.
- Property ownership.
- Rent, penalties, and rewards.
- Private lobby information and invite codes.
- Tokens, cookies, credentials, and connection strings.
- Redis state and Redis key lifecycle.
- MariaDB player/stats/card/square data.
- Event ordering and deduplication.
- Game integrity and fairness.
- Availability of public entry points and game sessions.

## Main trust boundaries

### Browser/client ↔ REST backend

Data crossing:

- Path variables such as `gameId` and `playerId`.
- Query parameters such as `playerId`, `inviteCode`, and `propertyId`.
- Request bodies such as nickname, game creation request, turn action request.
- Response DTOs and raw Redis-derived maps.

Authentication expectation:

- Future implementation should derive the actor from trusted authenticated context, not from `playerId` supplied by the browser.

Authorization expectation:

- Check game membership, host rights, resource ownership, active-player ownership, and turn phase before every state-changing operation.

Validation expectation:

- Validate types, ranges, allowed values, malformed IDs, unexpected fields, payload size, and unsupported state combinations.

Failure risks:

- Spoofing another player by changing `playerId`.
- Tampering with balances/positions through permissive endpoints.
- Information disclosure through raw game/player state.
- Denial of service through repeated lobby creation, joins, deletes, or invalid commands.
- Elevation of privilege through host/admin-like operations exposed as public endpoints.

Current evidence after REVAMP-017:

- Arbitrary player-state overwrite/deletion and direct money-grant routes are
  removed; REVAMP-025 also removes the unused raw `PlayerStateService` mutation
  helpers. Server-owned writes use the authoritative transition store.
- Client-triggered game deletion and `check-end` completion evaluation are
  removed. Authenticated self-leave and explicit lobby-host kick remain bounded
  membership commands.

### Browser/client ↔ WebSocket endpoint

Data crossing:

- WebSocket/SockJS handshake.
- STOMP CONNECT headers if introduced.
- Inbound `/app/**` commands if introduced.
- Outbound subscriptions such as `/topic/game/{gameId}`.
- Game event payloads.

Authentication expectation:

- WebSocket session must map to an authenticated user/player. Token expiry and reconnect must be handled deliberately.

Authorization expectation:

- Guessing or knowing a game ID must not automatically authorize subscription to that game's private events.

Validation expectation:

- Validate inbound destinations, payload shape, claimed player IDs, message size, and supported command type.

Failure risks:

- Arbitrary topic subscription.
- Cross-game information disclosure.
- Forged player IDs in WebSocket commands.
- Replay or duplicate commands.
- Lost/out-of-order events without snapshot recovery.
- Multi-instance inconsistency with an in-memory broker.

Current evidence:

- `WebSocketConfig` registers `/ws`, enables `/topic`, sets application prefix `/app`, and uses `setAllowedOriginPatterns("*")`.
- `Board.jsx` contains commented STOMP subscription code to `/topic/game/${gameId}`; active gameplay currently polls REST.

### Backend ↔ Redis

Data crossing:

- Game hashes such as `game:{gameId}`.
- Player hashes such as `player:{playerId}`.
- Game membership sets such as `game:{gameId}:players`.
- Deck lists such as `game:{gameId}:deck`.
- Leaderboard cache `stats:leaderboard`.
- Optional dice entropy `dice:entropy`.

Authentication expectation:

- Backend service credentials/configuration should not be exposed to clients.

Authorization expectation:

- Application services must authorize before reading or mutating Redis state for externally triggered operations.

Validation expectation:

- Redis values must be parsed defensively. Deserialized JSON such as player `properties` and `optionalAction` must be validated before use.

Failure risks:

- Tampering through unsafe endpoints.
- Key collisions or cross-game access through predictable IDs.
- Partial writes across multiple keys.
- Stale state overwriting newer state.
- Missing TTL/cleanup causing abandoned game data.
- Redis Pub/Sub, if introduced, losing messages for disconnected subscribers.

Current evidence:

- `GameStateService`, `PlayerStateService`, `SquareActionService`, `CardService`, `StatsService`, and `DiceEntropyRefillJob` construct/read/write Redis keys directly.
- `TurnService#throwDice` updates multiple pieces of Redis-backed state without a visible lock, transaction, state version, or idempotency marker.

### Backend ↔ MariaDB

Data crossing:

- Player records.
- Card and square metadata.
- Stats rows.

Authentication expectation:

- Database credentials are server-side only and must be environment-specific outside local development.

Authorization expectation:

- Repository access does not itself prove that a caller may view or mutate the resource.

Validation expectation:

- Use parameterized/ORM-safe queries, validate IDs before repository calls, avoid entity overexposure, and align constraints with domain ownership.

Failure risks:

- Duplicate or conflicting state between Redis and MariaDB.
- Missing unique/foreign-key constraints.
- Unsafe migrations.
- Data retention issues.
- Entity overexposure through REST DTOs.

Current evidence:

- `Stats` maps `player` as `@OneToOne(unique = true)`, while `MariaDB/init.sql` also has a stats trigger and explicit seed stats inserts.

### Backend instance ↔ backend instance through Redis

Data crossing:

- Shared Redis game/player state.
- Future locks, command markers, event markers, or Pub/Sub messages.

Authentication expectation:

- Only trusted backend instances should access production Redis.

Authorization expectation:

- Each instance must enforce the same application authorization before mutation.

Validation expectation:

- Shared state transitions must use command IDs, state versions, locks, transactions, or Lua scripts where required.

Failure risks:

- Two instances accepting the same roll.
- Timer and player action racing.
- Duplicate events.
- Lost Pub/Sub messages.
- Stale state transitions.

Current evidence:

- The current WebSocket broker is in-memory (`enableSimpleBroker("/topic")`), and no cross-instance event relay is documented.

### Development environment ↔ production environment

Data crossing:

- Docker Compose values.
- Application properties.
- Ports and exposed services.
- Example credentials.
- Logs.

Authentication expectation:

- Development defaults must not be treated as production credentials.

Authorization expectation:

- Production services should not expose Redis/MariaDB ports or permissive CORS/WebSocket origins without deliberate controls.

Validation expectation:

- Configuration should distinguish local-only settings from production settings.

Failure risks:

- Default passwords reused.
- Redis/MariaDB reachable from untrusted networks.
- Permissive CORS/WebSocket origin settings.
- Debug logs exposing internals.

Current evidence:

- `docker-compose.yml` contains MariaDB credentials and exposes Redis/MariaDB ports.
- `application.properties` contains datasource credentials.

## Practical STRIDE view

| Category | Sindopoly-specific examples |
| --- | --- |
| Spoofing | Client supplies another `playerId`; WebSocket command claims a different player; unauthenticated caller invokes host operation. |
| Tampering | Client submits position, balance, properties, dice total, or next player; stale command overwrites current state. |
| Repudiation | No command IDs, event IDs, or structured audit logs make it hard to prove who rolled or bought. |
| Information disclosure | Unauthorized `/topic/game/{gameId}` subscription; raw Redis maps returned; logs reveal private invite/game state. |
| Denial of service | Repeated create/join/leave/delete; WebSocket connection/subscription floods; Redis `KEYS` scans on public paths. |
| Elevation of privilege | Non-host removes players or deletes game; non-active player rolls; player grants money. |

## Baseline security invariants

Every future feature review should preserve or explicitly address these invariants:

- The backend is authoritative for dice, movement, balances, positions, ownership, turn, phase, timers, and game completion.
- Authentication is not authorization.
- Client-supplied `playerId`, `gameId`, and resource IDs are selectors, not proof of authority.
- Only the active player may perform active-turn commands.
- A command may change authoritative game state at most once.
- A stale command or event must not overwrite newer state.
- A timer must not complete a turn that has already advanced.
- A player may subscribe only to games they are authorized to view.
- Redis Pub/Sub, if introduced, is not durable authoritative state.
- Development credentials and permissive origins must not become production defaults.
