# Security review checklist

Use this checklist in Codex prompts, code reviews, merge requests, and release verification. It is intentionally concise; see `FEATURE_SECURITY_REVIEW_STANDARD.md` for the full process and rationale.

Classification:

- `MANDATORY`: Must be answered for every non-trivial change.
- `REQUIRED_WHEN_APPLICABLE`: Must be answered when the changed attack surface includes the area.
- `RECOMMENDED`: Strongly encouraged; may be deferred with reason.
- `NOT_APPLICABLE_WITH_REASON`: Acceptable only with a concrete reason.

## Core checklist

| Item | Classification | Review prompt |
| --- | --- | --- |
| Attack surface identified | MANDATORY | Does the change touch REST, WebSocket, Redis, Pub/Sub/events, MariaDB, auth, game state, timers, frontend input, config, or logging? |
| Authentication reviewed | MANDATORY | Does the entry point require an authenticated actor where appropriate? |
| Authenticated identity mapped to server-side player | MANDATORY | Is the acting player derived from trusted server context rather than only client-supplied `playerId`? |
| Game membership checked | REQUIRED_WHEN_APPLICABLE | Is the actor a member of the requested game before reading/mutating private game state? |
| Resource ownership checked | REQUIRED_WHEN_APPLICABLE | Does the actor own or have rights to the property/card/stat/resource being accessed? |
| Active-player ownership checked | REQUIRED_WHEN_APPLICABLE | Is the command limited to the current active player when required? |
| Turn phase checked | REQUIRED_WHEN_APPLICABLE | Is the command valid for the current game status and turn phase? |
| Administrative/host authorization checked | REQUIRED_WHEN_APPLICABLE | Are host/admin-only actions protected server-side? |
| WebSocket subscription authorization considered | REQUIRED_WHEN_APPLICABLE | Can unauthorized clients subscribe to or infer private game topics? |
| Client-provided authoritative state rejected | MANDATORY | Are dice, position, balance, ownership, next player, timers, and winner calculated server-side? |
| Input validation applied | MANDATORY | Are path variables, query params, bodies, headers, WebSocket messages, and destinations validated? |
| Payload size considered | REQUIRED_WHEN_APPLICABLE | Could a large message, nickname, command body, or event cause resource exhaustion? |
| Unexpected fields considered | REQUIRED_WHEN_APPLICABLE | Are unexpected/mass-assigned fields rejected or safely ignored? |
| Idempotency considered | MANDATORY | Can this command be double-clicked, retried, or delivered twice? |
| Replay considered | MANDATORY | Can an old command be replayed after state changed? |
| Concurrency considered | MANDATORY | Can two requests/timers/instances process the same transition? |
| Multi-instance behavior considered | REQUIRED_WHEN_APPLICABLE | Is behavior safe if more than one backend instance is running? |
| Redis atomicity considered | REQUIRED_WHEN_APPLICABLE | Are multi-key or multi-field Redis state changes atomic enough? |
| Redis TTL/cleanup considered | REQUIRED_WHEN_APPLICABLE | Are key lifecycle and cleanup rules documented? |
| MariaDB constraints/transactions considered | REQUIRED_WHEN_APPLICABLE | Are uniqueness, foreign keys, ownership, and transaction boundaries adequate? |
| Event duplication considered | REQUIRED_WHEN_APPLICABLE | Can clients/consumers deduplicate repeated events? |
| Event ordering considered | REQUIRED_WHEN_APPLICABLE | Can stale/out-of-order events overwrite newer state? |
| Event data exposure reviewed | REQUIRED_WHEN_APPLICABLE | Does the event reveal private or cross-game data? |
| Pub/Sub durability considered | REQUIRED_WHEN_APPLICABLE | Is Pub/Sub treated as notification rather than durable authoritative state? |
| Sensitive response fields reviewed | MANDATORY | Do responses avoid secrets, internal Redis payloads, stack traces, and private cross-game data? |
| Logs reviewed | MANDATORY | Do logs avoid passwords, tokens, cookies, connection strings, full request bodies, and sensitive payloads? |
| Secrets reviewed | REQUIRED_WHEN_APPLICABLE | Are secrets externalized and placeholders used in examples? |
| Error messages reviewed | MANDATORY | Are auth, validation, conflict, duplicate, and internal failures safely reported? |
| Abuse/resource exhaustion considered | REQUIRED_WHEN_APPLICABLE | Can the endpoint be spammed or used to create unbounded Redis/database work? |
| Security comments added | REQUIRED_WHEN_APPLICABLE | Are non-obvious security invariants documented per the commenting standard? |
| Tests added | MANDATORY | Were relevant security tests added or explicitly deferred with reason? |
| Residual risks documented | MANDATORY | What is not addressed, and why is that acceptable for this change? |

## Mandatory tests for core game commands

For commands that mutate authoritative game state, add or update tests for:

- Unauthenticated request.
- Authenticated user acting as a different `playerId`.
- Player not in game.
- Player not active.
- Invalid game status.
- Invalid turn phase.
- Duplicate command ID/request.
- Stale state version.
- Concurrent command/timer race, where testable.
- Malformed payload.
- Client-submitted authoritative fields ignored or rejected.
- Sensitive data not returned in response.

If the repository does not yet have the required test harness, record the test gap and avoid broad behavior changes until characterization tests exist.

## WebSocket-specific checklist

| Item | Classification | Review prompt |
| --- | --- | --- |
| Handshake authentication | REQUIRED_WHEN_APPLICABLE | Is the WebSocket session tied to an authenticated actor? |
| STOMP CONNECT validation | REQUIRED_WHEN_APPLICABLE | Are tokens/headers validated safely? |
| Subscription authorization | REQUIRED_WHEN_APPLICABLE | Is the actor authorized for the requested destination? |
| Inbound destination authorization | REQUIRED_WHEN_APPLICABLE | Are `/app/**` commands authorized by game membership and phase? |
| User-specific error queues | RECOMMENDED | Are private errors sent only to the right user/session? |
| Payload validation | REQUIRED_WHEN_APPLICABLE | Are message type, size, IDs, and enum values validated? |
| Reconnect recovery | REQUIRED_WHEN_APPLICABLE | Can a reconnecting client recover missed state from a snapshot? |
| Event deduplication | REQUIRED_WHEN_APPLICABLE | Are event IDs or state versions available when duplicates can occur? |

## Merge request security section template

```text
## Security review

Attack surface changed:
...

Protected invariants:
...

Authorization checks:
...

Validation:
...

Replay/idempotency:
...

Concurrency:
...

Redis/database implications:
...

WebSocket implications:
...

Sensitive data/logging:
...

Tests:
...

Residual risks:
...
```

