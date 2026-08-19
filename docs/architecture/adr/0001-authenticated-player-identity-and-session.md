# ADR 0001: Authenticated player identity and session

- Status: Proposed

## Context

HTTP is currently permitted without authentication, the browser stores a raw
`playerId`, and REST/STOMP boundaries do not establish a trusted actor. The
existing `Player` record represents a game participant, not a credentialed
account. Sindopoly is a browser application with Spring Security already
present and no demonstrated third-party/mobile API requirement.

## Decision

Use a server-managed, opaque browser session represented by a secure cookie.
The backend binds that session to one logical `Player` and resolves the same
actor for REST and future inbound STOMP commands. Client `playerId` values are
selectors or consistency checks only, never authentication.

Application commands authorize membership, host rights, active-player rights,
and phase after actor resolution. WebSocket handshake/CONNECT establishes the
same session actor; subscription authorization additionally proves game
membership. Reconnect reuses a valid session and otherwise requires a new
identity flow. Expired/revoked sessions cannot silently reattach as another
player.

For the current game, `Player` remains the logical identity; no separate
account entity is required. A future durable account can be introduced without
changing the command actor contract. Cookie flags, session duration, rotation,
and whether sessions are stored in-memory or through Spring Session remain
deployment configuration, but production cookies must be HttpOnly, Secure, and
have a deliberate SameSite/CSRF policy.

## Decision drivers

- Lowest migration burden for the current browser/Spring application.
- Avoids exposing bearer credentials to React storage.
- Gives REST, SockJS/STOMP, reconnect, expiry, and revocation one identity basis.
- Keeps authentication separate from game authorization.

## Alternatives considered

- **Browser-held bearer/JWT:** rejected for now because token storage,
  refresh/revocation, STOMP propagation, and logout add complexity without a
  current external-client requirement.
- **Continue trusting `playerId`:** rejected because it permits impersonation.
- **Create a full account system now:** rejected as speculative; the command
  actor contract supports it later.

## Consequences

REST and WebSocket adapters need a shared actor resolver. Existing public calls
must migrate from raw browser identity to session establishment. Authentication
does not itself grant game access.

## Security implications

Forged IDs, cross-game access, non-host start, and non-active commands are
rejected at command entry. Subscription destinations require session identity
and membership. Session fixation, CSRF, cookie theft, expiry, logout, and safe
logging require tests and configuration in REVAMP-015/016.

## Performance implications

Actor resolution must be bounded. A shared session store is only required when
multi-instance deployment is real; it must not add repeated MariaDB lookups to
every step of one command.

## Testing implications

Test unauthenticated/expired sessions, actor mapping, forged IDs, host/member/
active-player/phase denial, reconnect, logout, CSRF policy, and unauthorized
subscriptions. Command tests should inject a deterministic actor context.

## Redis and MariaDB implications

Redis may later store sessions if Spring Session is selected; such keys need
explicit TTL and ownership and must remain separate from game state. No MariaDB
schema change is required now. A future account/player distinction requires a
separate migration decision.

## REST/WebSocket implications

REST uses the session cookie and no longer derives authority from request IDs.
STOMP handshake/CONNECT maps to the same actor; inbound destinations and
subscriptions apply command/membership policy.

## Compatibility and migration

Introduce session establishment, route existing REST endpoints through actor
resolution while temporarily retaining selector IDs, migrate React, then reject
unauthenticated and mismatched calls. Do not maintain an insecure fallback once
the migration is complete.

## Follow-up backlog items

REVAMP-015, REVAMP-016, REVAMP-017, and REVAMP-021.

## Explicit non-goals

Choosing the exact Spring Session store, adding social login, defining a full
account product, or implementing authentication in this ADR.
