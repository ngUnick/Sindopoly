# Current limitations

This is the canonical consolidated residual-limitations list after REVAMP-027.
Historical audit documents may describe defects that have since been repaired.

## Runtime and deployment

- The STOMP simple broker and subscription authorization registry are
  process-local and non-durable. Cross-instance notification delivery is not
  supported; snapshot recovery and compatibility polling remain authoritative.
- Redis Pub/Sub, Redis Streams, and durable event history are not implemented.
- Cursor `SCAN` avoids one long-blocking `KEYS` traversal but still performs
  O(N)-style candidate discovery, may take multiple commands, and is weakly
  consistent. There is no maintained global active-game index.
- Lua CAS touches a game hash, membership/replay/deck keys, and player hashes
  without Redis Cluster hash tags. The current contract is a single Redis
  deployment; Redis Cluster slot-safe operation is not claimed.
- Active Redis state and MariaDB durable state do not share a transaction.
  Terminal finalization is protected by a frozen Redis result and idempotent
  MariaDB writes, but Redis loss before finalization remains an operational risk.
- Active `player:{id}` hashes are not game-namespaced. Authorization excludes
  known cross-game membership, but a distributed create/join race is not backed
  by a single global uniqueness transaction.
- The development Compose topology exposes Redis/MariaDB host ports, uses sample
  credentials, and declares no named MariaDB volume. It is not production-ready.
- Browser-authenticated servlet sessions are process-local: restarting the
  backend invalidates existing browser sessions and returns the SPA to login,
  even when Redis game state remains available.
- TLS termination, secret rotation, backups, monitoring, abuse rate limits, and
  production shared-broker/load-balancer topology are external operational work.
- The repository provides no production ingress/TLS manifest, external secret
  manager integration, or deployment-tailored Content Security Policy. HSTS and
  CSP belong at the verified HTTPS edge.
- Redis-to-STOMP has a post-commit crash gap: an applied transition remains
  recoverable by snapshot even if its best-effort notification is lost.

## Client and compatibility

- Polling remains as a slower compatibility fallback beside STOMP recovery.
- The production Docker board currently emits a non-fatal parser diagnostic for
  the relative Dice GLB asset path; authoritative turn state remains usable.
- The turn action body retains legacy `gameId`, `playerId`, and `squareType`
  fields. IDs must match the path/session and `squareType` is not authoritative;
  removal would require an intentional client contract migration.
- Two member-only player-list paths remain for compatibility.
- OpenAPI is a development convenience and is disabled by default in production.

## Engineering and verification

- Frontend lint retains known baseline failures and is not a required green CI
  job. Tests and the production build are required.
- The backend and frontend container builders use Java/Node versions that differ
  from CI's Java 21/Node 20 toolchains while producing Java 17-compatible backend
  bytecode. Aligning build images requires separate compatibility evidence.
- Integration coverage is server-level HTTP/STOMP coverage, not full rendered
  browser automation or cross-instance broker testing.
- The current frontend JavaScript bundle is about 1,591.89 kB (477.76 kB gzip)
  and retains a large-chunk warning. No code splitting was added without a
  measured load-time target.
- Leaderboard refresh reads/sorts all Stats every 60 seconds and caches JSON in
  `stats:leaderboard` without TTL. JPA open-in-view/fetch behavior and query
  counts remain measurement candidates, not proven defects.
- A clean, independent Windows/Docker Desktop checkout was verified for
  REVAMP-030; fixed host ports and the process-local session limitation remain
  operational constraints.

## Deliberately unsupported game scope

Auctions, mortgages, houses/hotels, trading, doubles gameplay, and Free Parking
rewards are not part of the approved revamp behavior. Property purchase is
optional without auction. See the canonical rule decisions rather than legacy
README or audit descriptions.
