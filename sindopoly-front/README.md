# Sindopoly frontend

The frontend is a React 18/Vite 5 client for the Sindopoly Spring backend. It
uses credentialed REST requests, obtains the CSRF token through the authenticated
session contract, submits versioned command intent, and uses SockJS/STOMP
notifications to recover authoritative game snapshots.

## Windows PowerShell workflow

```powershell
Set-Location .\sindopoly-front
npm.cmd ci
npm.cmd run dev
```

The development server uses `VITE_API_BASE_URL` when set and otherwise targets
the repository's local backend default. This is public build-time browser
configuration; never place a secret in a `VITE_*` variable.

`apiClient` centralizes credentialed fetch and the in-memory CSRF token. The
server session recovered from `/api/session/me`, not `localStorage`, owns
identity. The game realtime hook creates one SockJS/STOMP subscription, then
recovers authoritative snapshots monotonically by `stateVersion`; notifications
are never applied as state deltas. Lobby and board polling remain intentional
10-second and 15-second fallbacks when realtime delivery/recovery is unavailable.

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run lint
```

The realtime test and production build are required local/CI gates. Lint retains
documented baseline failures and is not currently a passing required gate.

The container build uses Node 18 to build static assets and Nginx to serve them.
Nginx provides SPA fallback and cache/security headers; TLS is expected at the
external deployment boundary. See:

- [Windows and Docker development](../docs/getting-started/WINDOWS_DOCKER_DEVELOPMENT.md)
- [REST API](../docs/api/REST_API.md)
- [Realtime synchronization](../docs/architecture/REALTIME_SYNCHRONIZATION.md)
- [Deployment security](../docs/security/DEPLOYMENT_SECURITY.md)
