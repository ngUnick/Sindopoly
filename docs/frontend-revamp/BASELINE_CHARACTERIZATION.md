# Frontend revamp baseline characterization

Status: FE-REVAMP-001 BEFORE evidence captured on 2026-09-14 from
`frontend-revamp` at `43b5894565c9234d6a1b4e8dae362d481e252bf9`. This
document measures the retained implementation; it does not approve or contain a
stabilization fix.

## 1. Toolchain and production build

| Item | Measured value |
| --- | --- |
| Local Node / npm | Node 26.2.0 / npm 12.0.2 |
| Repository compatibility context | CI uses Node 20; frontend image uses Node 18 |
| React / React DOM | 18.2.0 / 18.2.0 |
| Vite / React plugin | 5.0.7 / 4.2.1 |
| Three.js | 0.159.0 |
| Build command | `npm.cmd run build` |
| Result | PASS; 2,986 modules; two successful runs took 13.38s and 29.57s |
| CSS | one chunk, 14.30kB raw / 3.38kB gzip |
| JavaScript | one chunk, 1,596.99kB raw / 480.37kB gzip |

Warnings: Browserslist/caniuse data is outdated; Rollup removes a misplaced
`/*#__PURE__*/` annotation in `rc-field-form`; the single JavaScript chunk
exceeds Vite's 500kB warning threshold. The initial sandboxed Vite invocation
cannot traverse the required resolver path; the approved unrestricted build is
the reproducible local result.

The current `npm.cmd run dev -- --host 127.0.0.1` reaches Vite readiness but the
browser fails before React mounts with `ReferenceError: global is not defined`
from eager `sockjs-client` evaluation. The current-checkout browser evidence
therefore uses the successfully built production preview; no dev-server fix was
made.

## 2. Production assets

| Source asset | Source bytes | Production result |
| --- | ---: | --- |
| `images/monopoly_bg.png` | 5,043,328 | `/assets/monopoly_bg-L59XVv2i.png`, 5,043.33kB; referenced and fetched on login |
| `audio/massobeats-honey_jam.mp3` | 3,031,386 | `/assets/massobeats-honey_jam-K0XxbSNt.mp3`, 3,031.39kB; imported URL is emitted, but the duplicate raw element path remains invalid |
| `models/board.glb` | 1,179,208 | `/assets/board-yR8-q6xp.glb`, 1,179.21kB; emitted URL is passed to `GLTFLoader` on game mount |
| `models/Dice.glb` | 429,856 | Not emitted; the bundle retains literal `src/assets/models/Dice.glb` |
| `images/monopoly_money.png` | 157,533 | `/assets/monopoly_money-UIhIMjB9.png`, 157.53kB |
| `images/monopoly_logo.png` | 69,673 | `/assets/monopoly_logo-Ex_F76wR.png`, 69.67kB |
| `pawns/Iron.glb` | 37,672 | Not emitted or loaded; pawn loader is commented out |
| `pawns/Thimble.glb` | 33,372 | Not emitted or loaded |
| `pawns/WheelBarrow.glb` | 27,688 | Not emitted or loaded |
| `pawns/TopHat.glb` | 17,956 | Not emitted or loaded |
| `public/favicon.ico` | 145,198 | copied unchanged to `/favicon.ico` |

FE-REVAMP-004 verification (2026-09-15): the historical baseline above is
preserved. The dice loader now consumes a Vite-resolved module URL and the
production build emits `/assets/Dice-Bt-FvjiW.glb` (429,856 bytes). Background
audio has one imported URL, emitted as
`/assets/massobeats-honey_jam-K0XxbSNt.mp3` (3,031,386 bytes); the duplicate raw
`<audio>` source was removed. This stabilizes asset loading only—the dice remain
hidden after preload and no dice animation was enabled.

The current background is measurement-only and remains visually unchanged. The
current board remains preserve-by-default.

## 3. Route-loading baseline

`App.jsx` eagerly imports every route. `Game.jsx` imports `Board.jsx`, which in
turn imports Three.js, `GLTFLoader`, game networking, board/audio/image URLs and
the HUD. The production output has one JavaScript chunk and no route chunks;
the minified initial chunk contains `WebGLRenderer`, the board/audio/background
URLs and the broken dice literal.

A fresh current-checkout production preview at `/login` observed one script,
one stylesheet, favicon, logo, background and `GET /api/session/me`. The browser
did not fetch board/audio/model files on login, but their executable modules and
URL strings were already in the 1.60MB initial JavaScript download. Thus future
route splitting must compare both initial JS composition and asset requests.

The existing Docker project is named `sindopoly-play`; its frontend/backend
containers were created before the current baseline commit and its script hash
differs from the fresh build, so it was not used for code-sensitive numbers.

## 4. Current Three.js scene

One production effect execution creates one scene, perspective camera,
WebGLRenderer, ambient light, directional light, four primitive pawn meshes,
one board load, one dice load attempt and one permanent RAF loop. React
StrictMode may expose a second leaked effect execution during development.

- Renderer size starts at `innerWidth × innerHeight*0.99`; initial pixel ratio
  is the renderer default. Resize changes height to `innerHeight*0.92` and caps
  pixel ratio at `min(devicePixelRatio, 2)`.
- Camera: 75-degree perspective, initial aspect `innerWidth/innerHeight`, near
  0.1, far 100, positioned `(40,25,0)` looking at the origin.
- Lighting: white ambient intensity 1; warm directional intensity 6 with
  `castShadow=true`, but renderer shadow maps are not enabled.
- Controls: custom window-level horizontal mouse drag rotates the camera; no
  Three controls object, pointer listener or wheel listener exists.
- Pawns: red box, green sphere, blue torus and yellow cone. Pawn GLBs are unused.
- Board: Vite-emitted GLB, scale 0.035, Y rotation π/2.
- Dice: literal source-tree URL; the production build does not emit Dice.glb.
- Render loop: `renderer.render` followed by unconditional
  `requestAnimationFrame`, including visually idle periods.

Authenticated game access would require creating persistent player data in the
available shared MariaDB stack. That was intentionally avoided, so current
`renderer.info` draw-call, triangle, geometry and texture counts are unavailable
rather than estimated.

## 5. Remount and cleanup characterization

Reproducible future procedure: capture counters at login, mount one authenticated
game, remain idle for 30 seconds, leave/unmount, force an ordinary GC only when
DevTools exposes it, and repeat five times. After every cycle record active RAF,
registered listeners by type, STOMP frames/subscriptions, snapshot requests,
playing audio, renderer/context count, `renderer.info` and JS heap. The same
game/snapshot and viewport must be used for every comparison.

No live five-cycle run was made because the current shared runtime had no safe
disposable authenticated session and FE-REVAMP-001 permits no MariaDB impact.
Code-level accumulation evidence is conclusive for these registrations:

- Every Board render adds a new anonymous window `resize` listener; none is
  removed.
- Every scene-effect execution adds `mousedown`, `mousemove`, and `mouseup`
  listeners and starts one permanent RAF chain; none is removed or cancelled.
- Effect cleanup clears only its 15-second polling interval. It does not dispose
  the renderer, context, geometries, materials, textures or pending loaders.
- `useGameRealtime` does unsubscribe and deactivate its STOMP client.
- The observer's 12-second timeout is cleared. The audio effect has no unmount
  pause/cleanup, and dice animation timers have no cancellation path.

Consequently exact memory growth remains unmeasured, while listener/RAF/GPU
ownership defects are reproducible from lifecycle code and must be quantified
after an isolated authenticated fixture exists.

### FE-REVAMP-005 ownership and lifecycle update (2026-09-15)

Ownership now follows one derived path:

```text
accepted GameRealtimeSnapshot.players[].properties (number[])
  -> deriveOwnershipProjection(snapshot)
       -> frozen ownerBySquareId and propertiesByPlayerId records
       -> explicit invalid, duplicate and cross-player conflict signals
  -> propertyIdsForPlayer for the existing property-list modal
  -> applyOwnershipToSquares for the existing square display shape
```

Player ID is ownership identity; nickname is display-only. Invalid property IDs
are filtered and reported, duplicate same-player claims are deduplicated, and a
cross-player conflict leaves the square unowned in the projection instead of
letting array order choose an owner. Snapshot and metadata arrays are not
mutated. `boardFromSnapshot` remains a compatibility boundary for positions,
money, turn state, optional actions and completion. Its stringified properties
remain only in the separately backlogged completion-capital path. No Three.js
material or marker currently consumes property ownership.

The active mount/unmount boundary is now characterized as follows:

| Resource | Current owner / creation | Lifetime | Current cleanup | Remaining risk | Future owner |
| --- | --- | --- | --- | --- | --- |
| Main render RAF | Board scene effect; `animate` | Game-route mount | Latest frame ID is cancelled on effect cleanup | Still renders continuously while idle | `BoardSceneAdapter` |
| Window resize listener | Board scene effect; named `onResize` | Game-route mount | Removed on effect cleanup | Still global rather than canvas/layout scoped | `BoardSceneAdapter` |
| Window mouse drag listeners | Board scene effect; named down/move/up callbacks | Game-route mount | All three removed on effect cleanup | Global input scope remains | `BoardSceneAdapter` |
| STOMP client/subscription | `useGameRealtime` effect | Mounted `gameId` | Subscription unsubscribed and client deactivated | Recovery ownership remains split from polling | Authoritative controller |
| Snapshot recovery poll | Board scene effect; 15-second interval | Game-route mount | Interval cleared on effect cleanup | In-flight HTTP read is not aborted | Authoritative controller |
| Observer notification timeout | Board observer effect; 12 seconds | Active notification | Timeout cleared on dependency change/unmount | None known for the active timeout | Presentation coordinator |
| Command delay | `throwDiceAction`; one-second promise timer | One roll command presentation | Not cancelled | May resume after route unmount | Presentation coordinator |
| Dormant dice RAF and hide timer | `randomDiceThrow` | Only if currently disabled call is re-enabled | No retained IDs or cancellation | Would outlive unmount if enabled | `BoardSceneAdapter` |
| Audio instance | Board component `useState(() => new Audio(...))` | Board component instance | Play/pause follows local mute state; no unmount cleanup | Playing audio may retain the route instance | Audio settings/service |
| Renderer and WebGL context | Board scene effect | Game-route mount | Not disposed or context-released | GPU/context retention across remounts | `BoardSceneAdapter` |
| Scene, lights and primitive pawn geometry/materials | Board scene effect | Game-route mount | Not traversed or disposed | CPU/GPU resource retention | `BoardSceneAdapter` |
| Board and Dice GLTF scenes/resources | Async loaders in Board scene effect | Game-route mount and loader completion | No abort/stale-callback guard or disposal | Late callbacks and retained GPU resources | `BoardSceneAdapter` |
| Pawn player-ID map | Board component ref | Board component instance | Replaced from accepted snapshots; otherwise GC-dependent | Coupled to legacy pawn slots | `BoardSceneAdapter` |
| Version/refresh maps and set | `gameCommandState.js` module scope | Application session/per game | Explicit clear API exists; Board does not call it | Entries intentionally outlive route mounts today | Authoritative controller |

There are no active Board keyboard listeners, pointer listeners or Three.js
controls. A reliable repeated DOM/WebGL mount harness is not available in the
current Node-only test setup, so FE-REVAMP-005 uses source-contract coverage for
the listener/RAF cleanup rather than pretending to measure browser resources.
The later scene-adapter acceptance test must mount/unmount repeatedly and prove
zero Board RAFs, listeners, polls, STOMP subscriptions, playing audio,
route-specific timers and undisposed scene-owned resources after unmount.

## 6. Authoritative fixtures

Sanitized importable fixtures live in
`sindopoly-front/src/test-fixtures/gameRealtimeFixtures.js`. They cover lobby,
active/inactive viewer context, purchase option, jail option, ended state,
ordinary turn, card, rent, tax and timeout. IDs/names are synthetic; shapes and
types come from current Java records, transition tests and realtime contracts.

The fixtures intentionally omit future `die1`, `die2`, snapshot
`turnDeadlineEpochMs` and `finalResult`. A Node characterization test guards
the current keys, optional-action types, event validation and the fact that
viewer context does not alter the server snapshot contract.

## 7. REST, STOMP and recovery baseline

```text
POST /api/turn/{gameId}/{playerId}/throw
  -> ThrowResultDto (dice total, position, square result, version, replay, card)
  -> one committed /topic/game/{gameId} TURN_UPDATED envelope
  -> validated notification requests GET /api/game-state/{gameId}/snapshot
  -> monotonic snapshot adapter updates the visible Board
```

- SockJS/STOMP endpoint `/ws`; subscription `/topic/game/{gameId}`.
- Subscribe occurs before the recovery snapshot read.
- STOMP reconnect delay 2s; incoming/outgoing heartbeat 10s.
- Board fallback poll 15s; lobby fallback poll 10s.
- Module-scoped maps separate observed command version and accepted snapshot
  version. Stale responses set a refresh-required gate.
- Snapshots older than the accepted version are rejected. Equal versions are
  accepted; display events must be at least current and newer than the last
  displayed event.
- Event bursts coalesce; a newer version racing an in-flight read produces one
  follow-up read. STOMP cleanup unsubscribes and deactivates on unmount.
- `commandHeaders` creates a new UUID per wrapper invocation; preserving one ID
  across a logical retry is not centrally orchestrated by the current frontend.

## 8. Responsive baseline

Live fresh-build login measurements:

| Viewport | Document client/scroll width | Observable result |
| --- | --- | --- |
| 1920×1080 | 1920 / 1920 | no horizontal overflow |
| 1366×768 | 1366 / 1366 | no horizontal overflow |
| 768×1024 | 753 / 800 | 47px beyond viewport client width |
| 390×844 | 375 / 611 | 236px beyond viewport client width; 662px logo clipped |

Game-route evidence is code-level because no persistent player/session was
created. `Game` and major login/home containers use fixed 800px widths, Lobby
uses 600px and Search uses `min-width:700px`. Board uses a full-screen root and
canvas but sits inside the fixed 800px game wrapper. The renderer requests
`viewport width × 99% viewport height` initially (1,920×1,069.2,
1,366×760.32, 768×1,013.76 and 390×835.56 respectively at DPR 1), then uses 92%
height after a resize event. The game HUD is absolutely positioned at 10%, 17%
and 25% viewport height with no gameplay breakpoint. Tablet/phone horizontal
clipping and control crowding are therefore expected, but no fabricated
game-route document measurements are recorded.

## 9. Accessibility baseline

- Login exposes a named `Start` button and logo alternative text; its narrow
  layout horizontally overflows.
- Gameplay audio, property and dice buttons are native keyboard-focusable
  buttons, but are icon-only with no explicit accessible names.
- Canvas has no role, label, fallback description or DOM board equivalent.
- Active-result dialog has `role=dialog`, `aria-modal=true` and a label, but no
  focus placement, trap or restoration. The property overlay has no dialog
  semantics.
- Observer notification uses `role=status` and a named Greek close button.
- No `prefers-reduced-motion` handling exists. Permanent WebGL rendering and
  fireworks do not respond to reduced-motion preference.
- Primary roll is structurally keyboard-operable when enabled, but its missing
  name and the absence of a safe authenticated fixture prevented a live game
  keyboard sequence.

## 10. Verification and comparison contract

Before adding the fixture guard, the supported suite passed 21/21 tests. Final
verification passed 24/24 after adding three characterization tests. Lint ran
before and after and retained the same known 31 findings: 25 errors and 6
warnings. Two production builds emitted identical filenames and sizes; the
fixture/test/documentation additions did not enter the runtime bundle.

Future checkpoints compare: module count; CSS/JS raw and gzip; route chunks and
initial requests; each GLB/audio/image size; idle RAF; renderer info; listener,
STOMP and timer counts; remount memory; document/overflow/board dimensions at
the four viewports; keyboard names/focus; and reduced-motion behavior.

Redis schema impact: **None**. REST/STOMP impact: **None**. MariaDB impact:
**None**. Application behavior change: **None**.
