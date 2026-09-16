# Frontend revamp implementation architecture

Status: approved planning baseline for implementation review. This document does
not authorize production implementation by itself. The controlled sequence is
characterize, stabilize, extract, migrate, verify, and only then remove legacy
paths.

The visual direction is **Το Τραπέζι της Σίνδου**, with the information
discipline of **Άτλαντας ΔΙΠΑΕ**. Greek-only UI, the current background, the
current board, Three.js, backend authority, and the current REST/STOMP recovery
model remain constraints. No spectator mode or unsupported Monopoly mechanics
are introduced.

## 1. Current migration map

`Board.jsx` currently owns these responsibilities:

| Area | Current evidence | State class | Target owner |
| --- | --- | --- | --- |
| Route identity | Parses `game` and `player` query parameters; navigates to completion | Network/legacy compatibility | `GamePage` route boundary; authenticated player comes from `AuthContext` |
| Snapshot and polling | `handleTick`, `GamePlayAPI.getBoard`, 15-second poll | Authoritative/network | `useAuthoritativeGame` |
| STOMP recovery | `useGameRealtime` callback integration | Authoritative/network | `useAuthoritativeGame` over retained realtime primitives |
| Version and command headers | `gameCommandState.js` module maps | Authoritative/network | Controller-owned per-game reducer/service |
| Snapshot adaptation | `boardFromSnapshot` converts typed players to a legacy first-row blob | Legacy compatibility | Boundary decoder, then remove adapter |
| Player projections | `playersData`, `selfIdx`, `turnIdx`, pawn-ref allocation | Derived view and 3D | Presentation selectors plus scene adapter |
| Optional actions | Parses stringified `optionalAction`, opens result modal | Authoritative plus UI | Controller retains typed fact; `ActionViewModel` renders it |
| Commands | `throwDiceAction`, `handleModalChoice` | Network/command | Controller command methods |
| Property metadata | Hard-coded 40-square array, ownership mutation and mixed JSON/comma parsing | Derived/legacy | Backend metadata projection plus pure selectors |
| Three.js lifecycle | Renderer, scene, camera, board load, lights, primitives | 3D presentation | `BoardSceneAdapter` |
| Movement | Mutable `stepCounter`/`caseNumber`, edge step sizes | 3D presentation | Board-anchor map and coordinator instructions |
| Dice | Local variables, broken literal load path, random visual transform | 3D presentation/legacy | Scene adapter driven by confirmed `die1`/`die2` |
| Camera/input | Global mouse listeners and position updates | 3D presentation | Scene adapter bound to its canvas |
| Rendering | Permanent RAF | 3D presentation/performance | Invalidation plus bounded animation scheduler |
| Resize/disposal | Anonymous resize listener; no full GPU/listener/RAF cleanup | 3D lifecycle defect | Scene adapter lifecycle |
| Audio | `Audio(honeyJam)` plus a second broken raw path | Ephemeral UI | `useAudioPreferences`/`AudioSettings` |
| Result/card UI | Blocking `TurnResultModal`, observer FIFO, dead imperative card helpers | Ephemeral UI/legacy | `ActionTray`, non-blocking `CardReveal`, `EventHistory` |
| Completion | Finds winner and estimates asset value with an incomplete client map | Incorrect derived authority | Additive authoritative completion projection |

Responsibility graph:

```text
Game route + authenticated session
  -> authoritative controller
       -> HTTP command/snapshot gateway
       -> authenticated STOMP gateway
       -> accepted snapshot + command lifecycle + validated events
  -> pure presentation selectors
       -> GameViewModel slices -> DOM gameplay components
  -> presentation coordinator
       -> versioned presentation instructions -> BoardSceneAdapter
```

State classification:

- **Authoritative data:** accepted snapshot, `stateVersion`, player positions,
  balances, ownership, active player, lifecycle status, optional action, winner,
  future deadline and final-result projection.
- **Derived game view data:** self/active flags, formatted balance, property
  count, Greek copy keys, allowed visible command derived strictly from the
  server-exposed optional action and command readiness.
- **Ephemeral UI state:** disclosure state, selected property, dismissed card,
  audio preference, focus restoration, bounded session event history.
- **3D presentation state:** loaded objects, anchor lookup, camera, highlighted
  square, current animation generation and displayed dice orientation.
- **Network/command state:** connection status, in-flight command, request ID,
  stale-refresh gate, last accepted version and recovery generation.
- **Legacy compatibility state:** first-row board blob, `dice` total, query-string
  player selector, stringified optional action and comma/JSON property parsing.

Concrete extraction inventory:

- Imports/boundaries: React state/effect/ref hooks; Three.js and `GLTFLoader`;
  `GamePlayAPI`/`boardFromSnapshot`; `useGameRealtime` and game-event helpers;
  `TurnAPI`; router search/navigation; feedback/icons; board, audio and image
  assets.
- Refs/state: canvas, scene, camera, renderer, four pawn refs, player-to-pawn
  map and optional-prompt key; player/turn projections, dice result, property
  list/modal, outcome modal, observer queue and audio preference. `posInput` and
  `my_sira` are currently unused compatibility state.
- Effects/imperative work: audio setup; observer-message timeout; one large
  scene/load/poll effect; permanent RAF; 15-second snapshot poll; window
  mouse/wheel handlers; an anonymous resize handler registered outside an
  effect; and dead direct-DOM card helpers targeting missing elements.
- Commands/navigation: REST board/snapshot read; versioned roll/action/pass;
  STOMP-triggered reconciliation; `game`/`player` query parameters; and
  query-parameter completion navigation. Ownership and completion projections
  currently mix hard-coded metadata with mutable/string-parsed player data.

## 2. Target layers and dependency direction

1. **Route/page layer** resolves `gameId`, reads authenticated identity, handles
   missing/current-game recovery, and owns navigation only.
2. **Application controller** owns authoritative snapshot acceptance, HTTP/STOMP
   lifecycle, command idempotency metadata and recovery.
3. **Boundary decoders/gateways** validate transport payloads and translate HTTP
   failures to stable internal error codes.
4. **Pure presentation model** derives immutable UI-facing data without creating
   a second authoritative store.
5. **Presentation coordinator** converts confirmed facts into cancellable visual
   instructions.
6. **DOM components** render view-model slices and submit intents.
7. **Three.js scene adapter** executes high-level visual instructions and owns
   all WebGL resources.

Dependencies point downward. The controller has no dependency on copy, CSS,
React DOM or Three.js. The scene adapter has no dependency on REST, STOMP,
authentication, Redis concepts, money, ownership rules or completion rules.

## 3. Authoritative controller

Working API:

```text
useAuthoritativeGame({ gameId, authenticatedPlayerId }, dependencies?)
  -> snapshot
  -> stateVersion
  -> connection
  -> commandLifecycle
  -> commandReady
  -> validatedEvents
  -> refresh()
  -> roll()
  -> acceptOptionalAction()
  -> passOptionalAction()
  -> leave()
```

The public command methods do not accept a caller-supplied player ID. The
controller uses the authenticated identity supplied by the session boundary;
legacy path/body IDs remain selectors and the backend continues to verify them.

Responsibilities:

- Subscribe before the first snapshot read.
- Accept snapshots monotonically by `stateVersion`.
- Coalesce event-triggered reads and perform one follow-up read when a newer
  event races an in-flight read.
- Retain a bounded 15-second polling fallback while STOMP is unhealthy or as a
  compatibility safeguard.
- Generate one command UUID per logical intent and preserve it for retries.
- Supply the accepted expected version; never blind-retry a stale command with a
  newer version.
- On stale conflict, block commands, refresh, expose a safe conflict state, and
  require a new user intent.
- Detect an event version gap, record it for history, and recover by snapshot.
- Retain the last accepted snapshot during transient network failure.
- Abort HTTP work, unsubscribe/deactivate STOMP and clear timers on game change
  or unmount.

It must not own Three.js, animation, Greek copy, CSS, game-rule calculation,
property affordability, pricing, winner calculation or timers derived from the
local clock without a server deadline.

Implementation should keep a pure controller reducer and injectable gateways
(`snapshotGateway`, `commandGateway`, `realtimeGateway`, clock, scheduler and ID
factory). React is a thin lifecycle wrapper. Unit/integration tests therefore
need no canvas or Three.js scene.

## 4. Presentation model

Suggested immutable models:

- `GameViewModel`: game ID, lifecycle key, version, players, turn, action,
  context, outcome and connection slices.
- `PlayerViewModel`: ID, nickname, balance, property count, position, pawn slot,
  self/active/jail/bankrupt/AFK flags and a display-status key.
- `TurnViewModel`: `self`, `other`, `unavailable` or `completed`; active player;
  optional deadline; command-readiness reason.
- `ActionViewModel`: `roll`, `purchase`, `jailExit`, `waiting`, `pending`,
  `recovery` or `none`, derived only from accepted server facts.
- `PropertyViewModel`: metadata, owner and display facts; never purchase legality.
- `OutcomeViewModel`: normalized confirmed event/command result for emphasis.
- `ConnectionViewModel`: stable state and safe content key.

Rules:

- If the server does not expose an optional action, the UI never invents one,
  even when local money appears sufficient.
- Second-person copy is selected only when authenticated player ID equals active
  player ID. Other players always receive third-person presentation.
- Unknown enums/details disable related actions, retain the last valid snapshot,
  show safe generic copy and produce only bounded developer diagnostics.
- Mapping is pure. Memoize at the accepted snapshot identity/version and pass
  narrow slices to components; do not memoize trivial formatting prematurely.
- Greek terminology is selected by content keys, not embedded in selectors.

## 5. Presentation coordinator

The coordinator is stateful but non-authoritative. It consumes accepted
snapshots, validated event envelopes, command responses, reduced-motion policy
and scene readiness. It emits instructions such as:

```text
ROLL_CONFIRMED -> MOVE_PAWN -> FOCUS_TILE -> SHOW_CARD/SHOW_OUTCOME -> HANDOFF
```

Each sequence is keyed by `gameId`, `stateVersion`, event ID and an internal
generation. Duplicate/replayed commands do not replay presentation. Card reveal
is dismissible with `Απόκρυψη`/`Κλείσιμο`, but never blocks commands, turn
progression or state correctness.

On a newer accepted snapshot, reconnect, game change or unmount, the coordinator
cancels the current generation, asks the scene to skip, snaps all objects to the
new snapshot, clears obsolete emphasis and starts only presentation supported by
new confirmed facts. A recovery snapshot never fabricates missed dice/card
animations. Reduced motion collapses the sequence to immediate positions,
settled dice, focus and textual outcome.

## 6. Three.js scene adapter

A class best fits the existing imperative lifecycle. `BoardViewport` creates one
adapter in a ref and owns only its mount/unmount bridge.

```text
initialize(canvas, assets, layout, quality)
setSnapshotPositions(players)
setActivePlayer(playerId)
rollDice({ die1, die2, seed, reducedMotion })
movePawn({ playerId, route, reducedMotion })
focusSquare(squareId)
showRoute(squareIds)
clearHighlights()
resetCamera(preset)
resize(width, height, pixelRatio)
skipAnimation()
dispose()
```

The adapter owns renderer, scene, camera, canvas-scoped controls, model loading,
pawn/dice instances, lights, highlights, animation-frame IDs, invalidation,
resize and complete disposal. It uses one bounded scheduler: render on explicit
invalidation and during active animation, never a permanent idle RAF.

All loader callbacks check an adapter generation/disposed flag. `dispose()`
cancels RAF/timeouts, removes listeners, aborts or ignores pending loads, walks
the scene once to dispose geometries/materials/textures, removes the canvas
bindings and disposes the renderer.

## 7. Session event history

- Source: validated server event envelopes only; never optimistic UI entries.
- Reuse/extend `parseGameEvent`; reject malformed, cross-game, excessive or
  unknown details before storage.
- Deduplicate by event ID with a bounded 256-ID LRU set.
- Retain at most 100 visible entries in browser memory.
- Order by state version, then server `occurredAt`, then event ID as a stable
  tie-breaker. Never reorder an already announced event backwards.
- Group entries by committed transition/state version and optionally by turn.
- Insert one non-authoritative “Χάθηκαν ενδιάμεσες ενημερώσεις· η κατάσταση
  συγχρονίστηκε” marker when a snapshot/event jump proves a gap.
- A reload intentionally resets history. The recovered snapshot supplies current
  state but no invented historical entries.
- Announce one concise newest-event summary through a throttled polite live
  region; browsing the history itself does not retrigger announcements.
- No Redis, MariaDB or localStorage persistence.

## 8. Greek content boundary

Use small frontend-owned dictionaries and formatter functions under
`src/features/game/content/el.js` (and corresponding shared app content only
when needed). Keys cover turn, command, connection, outcome, error and
accessibility copy. Property names ultimately come from board metadata; card
text remains backend/MariaDB content with bounded rendering.

Transport errors map to internal codes such as `unauthenticated`, `forbidden`,
`notFound`, `stale`, `conflict`, `network`, `server`, `invalidPayload` and
`unknown`. Raw backend exception text is never rendered directly. The fallback
is a safe Greek message plus a retry/recovery action where valid.

A full i18n framework is not justified while Greek is the sole locale.

## 9. Design tokens and UI libraries

Canonical ownership:

1. `src/styles/tokens.css` owns semantic CSS custom properties.
2. Tailwind configuration maps approved utility names to those variables.
3. One app-level Ant Design `ConfigProvider` maps retained Ant tokens to the
   same variables.
4. Gameplay components use co-located CSS modules; `index.css` retains reset,
   font and token imports only.
5. Inline styles are reserved for genuinely dynamic scene dimensions,
   transforms and metadata-driven band/player values exposed as CSS variables.

The initial semantic palette maps Mission 6 values once: surface `#FFF8E8`,
elevated surface `#FFFCF4`, strong surface `#233D38`, primary text `#1B2927`,
secondary text `#435754`, subdued text `#5F706D`, action `#0F6B62`, hover
`#0B5B54`, pressed `#084A45`, and focus `#075EE8`. `Noto Sans` remains a
candidate until a later mission explicitly approves font assets/loading.

Ant Design classification:

- **KEEP:** `Input`, `Radio`, `Table`, `Spin`, and future `Switch`/`Slider`.
- **WRAP/RESTYLE:** `Button`, `Modal`, `message`, `Tooltip`, `Avatar` and the
  single root `ConfigProvider`.
- **REMOVE EVENTUALLY:** page-local `ConfigProvider` instances, global `.ant-*`
  overrides, and Ant components used only to imitate custom gameplay surfaces.

Tailwind remains useful for simple page flow, alignment and responsive display.
Avoid arbitrary color/spacing values, complex gameplay component styling,
dynamic state selectors and any utility that duplicates semantic tokens. No new
UI framework is introduced and neither library is removed wholesale.

## 10. Route and bundle architecture

`App.jsx` currently imports every route eagerly, so importing `Game` also pulls
`Board`, Three.js and `GLTFLoader` into the initial graph. Use `React.lazy` at
route boundaries:

- Non-game chunks: login, home, search/join, lobby, statistics, completion.
- Game chunk: `GamePage`, controller, HUD, Three.js, `GLTFLoader`, board/model
  URLs and game audio.

`App` retains Router, session provider, protected-route handling and a Greek
`Suspense` fallback. Lobby may preload the game chunk only after a confirmed
start/navigation intent. Do not add manual vendor chunks until Vite output is
measured; the acceptance condition is that login/home requests do not fetch
Three.js or GLBs.

## 11. Target component tree and state

```text
App
└─ Router + AuthProvider
   ├─ LoginRoute
   ├─ HomeRoute
   ├─ SearchGameRoute
   ├─ LobbyRoute
   ├─ StatisticsRoute
   ├─ CompletedGameRoute
   │  └─ CompletedGameView
   └─ GameRoute (lazy game chunk)
      └─ GamePage
         └─ GameShell
            ├─ MatchStatusHeader
            │  ├─ ConnectionStatus
            │  └─ AudioSettings
            ├─ PlayerRail
            │  └─ PlayerCard × 1–4
            ├─ BoardViewport -> BoardSceneAdapter ref
            ├─ ContextPanel
            │  ├─ PropertySummary / PropertyDetails
            │  └─ EventHistory
            ├─ ActionTray -> controller command intents
            └─ GameDialogLayer
               ├─ CardReveal (non-blocking)
               └─ recoverable error/leave dialogs
```

`GamePage` owns the controller, presentation selector and coordinator. It passes
narrow immutable slices and callbacks to direct children. Start with one
`useReducer` for authoritative/network lifecycle, local state for disclosures
and audio, and refs for Three state. Existing `AuthContext` remains. Do not add a
game Context or external Redux/Zustand-style store unless measured prop depth or
render fan-out later proves it necessary.

## 12. Stabilization workstream

| Defect | Root cause and impact | Smallest safe fix and test | Timing |
| --- | --- | --- | --- |
| Continue Game loses `gameId` | Home reads a boolean and navigates with only `player`; Board requires `game` | Add authenticated current-game projection, navigate with returned ID; controller/route test | **Before extraction** |
| `/getToken` stale/broken | Route calls absent `AuthAPI` OAuth methods and can expose token material | Confirm no supported caller, remove route/component; protected-route/session regression test | **Before extraction** |
| Dice GLB path | `GLTFLoader` receives a literal source-tree path instead of a Vite asset URL | Import `Dice.glb?url`, characterize load success and production URL | **Before scene extraction** |
| Raw audio path | Imported `Audio(honeyJam)` coexists with unused broken raw `<audio src>` | Remove duplicate raw element; one imported URL and gesture-gated test | **Before shell extraction** |
| Completion capital | Client uses an intentionally incomplete hard-coded price map and query parameters | Stop estimating; consume additive final-result projection; backend calculation and component tests | **Before CompletedGameView** |
| Property ownership parsing | Typed arrays are stringified, then comma-split; owner uses `name` while rows expose `nickname` | Characterize current inputs, move to typed view model and remove mutation adapter | **During presentation-model extraction** |
| Listeners/RAF/resources | Resize listener is installed on every render; global drag listeners, RAF, timers and GPU resources are not fully cleaned | First characterize mount/unmount and stop duplicate listeners/RAF; complete disposal in adapter tests | **Before and during scene extraction** |

## 13. Preserved Redis contract and additive backend contract plan

All existing keys and values use the current String Redis serializers. The
frontend never reads them directly; they are recorded here to prevent a UI
migration from quietly changing authoritative storage.

| Key | Existing type/value format | TTL/lifecycle and purpose |
| --- | --- | --- |
| `game:{gameId}` | HASH; fields include `status`, `creationTime`, `visibility`, `inviteCode`, `playerTurn`, `turnOrder` JSON, `timer`, `startTime`, `maxTime`, `maxMoney`, `winner`, `lastDice`, `optionalAction` JSON, `optionalDeadline`, `stateVersion`, `turnDeadlineEpochMs`, `terminalResult` JSON | 24h at lobby creation; configurable 300s default after completion; authoritative active-game metadata |
| `game:{gameId}:players` | SET of decimal player-ID strings; never an ordering source | Game/terminal lifecycle; membership (`turnOrder` owns order) |
| `player:{playerId}` | HASH with `position`, `money`, `jail`, `jailTime`, `bankrupt`, `properties`, `afk` | 2h at initialization; shared player state is not shortened by old-game cleanup |
| `game:{gameId}:deck` | LIST of card-ID strings, cycled head-to-tail atomically with card effects | Aligned to game lifecycle; per-game deterministic deck |
| `game:{gameId}:commands` | HASH; normalized UUID field to JSON `{fingerprint,stateVersion,resultJson}`; legacy `{result}` remains readable; maximum 4096 IDs | Game lifecycle; terminal 300s default; owner-lobby deletion leaves 30s tombstone; exact replay/collision evidence |
| `stats:leaderboard` | STRING containing JSON `LeaderboardEntryDto[]` | No TTL; auxiliary cache |
| `dice:entropy` | LIST of external die-value strings when random.org mode is enabled | No TTL; auxiliary entropy pool |

Expected revamp Redis schema impact is **None**. No cosmetic key, durable event
history or client presentation state is added.

| Contract | Exact boundary | Service/storage impact | Compatibility and tests |
| --- | --- | --- | --- |
| Dice pair | Add `die1`, `die2`, `total` to `ThrowResultDto` and `DICE_ROLLED` `GameEventDetail`; temporarily retain `dice=total` | `DiceService` returns a pair; command replay stores the expanded existing result JSON; `lastDice` may remain total | Additive JSON; old clients use `dice`; rule, DTO, replay, event and frontend decoder tests. Redis schema: **None**. MariaDB: **None** |
| Turn deadline | Add nullable `turnDeadlineEpochMs` to `GameRealtimeSnapshot` | Snapshot service reads existing `game:{gameId}` field | Additive; snapshot authorization/absent/completed tests. Redis schema: **None**. MariaDB: **None** |
| Current game | Add `GET /api/session/current-game` returning `CurrentGameDto(gameId,status,stateVersion,visibility)` or 204; visibility preserves the existing public/private lobby route | Authenticated discovery returns candidates then validates membership/stable game snapshots | Keep boolean endpoint for compatibility; self-session, none, stale candidate and multi-game race tests. Redis schema: **None**. MariaDB: **None** |
| Board metadata | Add `GET /api/board/squares` returning ordered `BoardSquareDto(id,type,displayNameEl,price,rent)` | New read service/repository projection; add Flyway migration for `square.display_name_el` and seed 40 names | Additive endpoint; order/completeness/auth/cache tests. Redis schema: **None**. MariaDB: **add nullable-then-backfilled name column, then enforce non-null if verified** |
| Completion | Add nullable `finalResult` to ended `GameRealtimeSnapshot`, with ordered `{playerId,nickname,cash,propertyValue,totalValue,rank,winner}` | Server derives values from retained authoritative player state and existing Square prices; fetch prices in one query | Additive; winner/rank/tie/reconnect/terminal TTL tests. Redis schema: **None**. MariaDB schema: **None** |
| Greek nicknames | Replace map request with typed create-player DTO and define NFC normalization, allowed categories, grapheme/code-point limit, case/uniqueness and compatibility policy | Validation/session boundary plus `Player.p_name`; no active-state copy | Existing names are not silently rewritten. MariaDB migration only if collation/uniqueness policy requires it. Redis schema: **None** |

Do not add cosmetic Redis fields. Individual dice do not need new game-hash
fields: their authoritative command replay is already held in the existing
commands hash, and missed visual events recover to current state without replay.

## 14. Test architecture and Playwright

- **Unit:** decoders, selectors/view models, event grouping/deduplication, Greek
  content mapping, 40-anchor routes, dice orientation lookup.
- **Component:** ActionTray, PlayerRail, ContextPanel, non-blocking CardReveal,
  connection/error states, focus and live-region semantics.
- **Integration:** controller with injected HTTP/STOMP fakes; stale conflict,
  monotonic acceptance, connect/read race, coalescing, gap, reconnect, cleanup.
- **Browser/E2E:** two isolated authenticated players through create/join/start,
  roll, purchase/decline, inactive-player flow, cards, jail, timeout, reconnect,
  completion, keyboard and reduced motion.
- **Visual:** approved 1920×1080, 1366×768, tablet and functional-phone states.
- **Performance:** route requests, idle RAF, draw calls/triangles, asset sizes,
  frame time, mount/unmount memory and interaction delay.
- **Accessibility:** later automated axe-compatible checks, keyboard E2E, focus
  restoration, live status and reduced motion.

Playwright is recommended later as a development dependency. Place configuration
at `sindopoly-front/playwright.config.js` and tests under
`sindopoly-front/e2e/`. Reuse the documented Docker Compose stack, wait on
explicit readiness, and create two independent `BrowserContext` instances with
deterministic unique Greek-safe player names. Every test creates a disposable
game through public APIs; terminal TTL/server cleanup owns state cleanup, while
contexts and traces are always closed. Capture screenshot, trace and console on
failure. CI can run a Chromium project first; Firefox/WebKit become a separate
compatibility gate only after stability and runtime budget are proven.

## 15. 3D asset, coordinate and dice architecture

Asset pipeline:

```text
original source + provenance/license
  -> DCC export with agreed axes/origin/scale
  -> geometry/material/texture optimization
  -> glTF Validator + size/triangle inspection
  -> isolated test scene
  -> .glb in src/assets/models/{board,dice,pawns}
  -> Vite ?url import
  -> loader/cache with clone policy
  -> adapter-owned disposal
```

Targets: 8–20k triangles per pawn, at most two materials, 512px pawn texture or
vertex colors, approximately 100KB per pawn; dice around the current 430KB or
smaller unless evidence justifies more; board retained and measured before any
polish. Every asset records author/source/license, modification history, units,
up/forward axes and export tool/version.

For the current board, use a **calibrated generated-anchor map** as the canonical
source: a small board-bounds/edge calibration generates all 40 explicit anchors
and four player-slot offsets, then tests freeze the resulting coordinates and
clockwise ID order. This replaces mutable step counters without requiring a GLB
edit. Named GLB nodes may later validate or override calibration only after the
current model is proven suitable; runtime traversal must not depend on mesh
vertex order.

Routes use forward modulo ordering for ordinary confirmed movement. Start
crossing, transport/card destinations and Go To Jail are selected from confirmed
event/command detail, not inferred to create money or rule outcomes. Card
transport may use a direct lifted route; Go To Jail uses a dedicated visual arc.
Reconnect/newer snapshots snap to the authoritative anchor. Player slots are
stable by immutable player ID/turn order and rotate with the edge tangent so up
to four pawns remain distinct.

Dice presentation uses a validated quaternion lookup for faces 1–6 per chosen
asset. A visual tumble may be seeded by event ID for stable replayable imagery,
but always snaps to the server-provided pair. Skip completes immediately;
reduced motion sets settled orientations directly. A recovered snapshot does not
replay missed dice. Observers animate only a validated event they received.
Physics, if later retained, is visual-only and cannot select or alter results.

## 16. Performance checkpoints

Record raw/gzip JS, game/non-game chunks, request count, GLB/texture transfer,
draw calls, triangles, texture memory, frame time, idle RAF count, interaction
delay and memory after repeated mount/unmount at:

1. Before implementation.
2. After tokens/shell/components.
3. After route splitting.
4. After the Three adapter.
5. After pawn/dice animation.
6. Final hardening.

The retained baseline is approximately 1,591.89KB raw and 477.76KB gzip with a
large-chunk warning; remeasure at M1. Quality tiers cap pixel ratio, shadows,
antialiasing and texture resolution, never rules or information. Optimize only
after a checkpoint identifies a regression.

## 17. Incremental migration milestones

Every milestone leaves the supported game runnable.

| Milestone | Scope / likely files | Verification and acceptance | Redis schema impact | REST/STOMP impact | MariaDB impact | Risk / rollback |
| --- | --- | --- | --- | --- | --- | --- |
| M0 Plan baseline | This document and branch | Clean baseline and reviewed plan | None | None | None | Low; revert docs/branch |
| M1 Characterize/stabilize | Existing Board/APIs/tests; defects in section 12 | Current flow tests; valid asset URLs; bounded cleanup; suppress incorrect client capital | None | Add authenticated `GET /api/session/current-game`; STOMP none | None | Medium; revert individual fixes; endpoint is additive |
| M2 Pure seams | New decoders, content keys, view models, event history; legacy Board consumes adapters | Unit tests; rendered behavior unchanged | None | None | None | Low; legacy adapter remains rollback |
| M3 Tokens and shell scaffold | `styles/`, `GameShell`, static layout behind a feature switch | Visual/accessibility snapshots; old Board remains selectable | None | None | None | Medium; switch back to legacy shell |
| M4 Authoritative controller | Controller/reducer/gateways, reuse realtime primitives | Mock HTTP/STOMP race/reconnect suite; old Board can consume controller snapshot | None | None | None | High; retain old hook/API path |
| M5 DOM HUD extraction | Header, rail, action/context/history components | Component and current-mechanics tests | None | None | None | Medium; legacy HUD switch |
| M6 Scene adapter | Move renderer/assets/input/RAF/disposal behind adapter | Idle RAF=0; mount/unmount resource checks; visual parity | None | None | None | High; legacy scene kept until parity |
| M7 Contract projections | Dice pair, deadline, board metadata, final result | Backend/contract compatibility tests | None | Add `die1`/`die2`/`total` while retaining `dice`; add snapshot deadline/final result; add `GET /api/board/squares`; no destination removal | Add/backfill `square.display_name_el`, then enforce non-null only after verification | High; additive fields ignored by old client |
| M8 First vertical slice | Confirmed roll through two-player handoff | Two-context integration/E2E, reduced motion, reconnect interruption | None | None; consumes M1/M7 additions | None | High; feature switch to legacy flow |
| M9 Full current mechanics | Purchase/decline, cards, tax, rent, jail, timeout, completion | Current rule matrix plus browser flows | None | None | None | High; per-outcome rollback |
| M10 Responsive/accessibility | Desktop, tablet, functional phone, focus/live regions | Keyboard, reduced motion, visual baselines | None | None | None | Medium; component-level rollback |
| M11 Asset/motion/audio polish | Pawns, evaluated dice, choreography, gesture-gated audio | glTF validation, frame budgets, autoplay tests | None | None | None | Medium; asset manifest selects old assets |
| M12 Route split/secondary screens | Lazy routes, Greek non-game screens, completion | Login/home do not request Three; full build/E2E | None | None | None | Medium; revert lazy boundary |
| M13 Hardening | Performance, memory, error/security review, remove proven legacy paths | Full CI/E2E/perf/a11y and final diff review | None | None | None | Medium; remove legacy only after acceptance |

## 18. First vertical slice

The first successful slice is a two-player, server-authoritative turn:

1. Player A sees “Η σειρά σου”.
2. Keyboard/pointer roll sends one idempotent command and shows pending state.
3. Confirmed `die1`/`die2` drive visual dice only.
4. The coordinator moves A along canonical anchors and focuses the confirmed
   landing square.
5. Automatic outcome/card presentation is informative and non-blocking.
6. If the snapshot exposes a purchase choice, A can purchase or decline; no
   affordability rule is inferred locally.
7. Turn handoff is rendered from the accepted snapshot.
8. Player B sees the corresponding third-person dice, movement, outcome and
   handoff without actionable A-only controls.
9. Reduced motion produces an equivalent immediate sequence.
10. A newer snapshot/reconnect cancels presentation, snaps to authority and does
    not regress stale handling.

The legacy property list, secondary screens, full completion styling, final pawn
assets, advanced camera polish and non-slice outcome visuals may remain outside
this slice. Existing current mechanics must remain runnable through the legacy
path until M9 parity.

## 19. Ordered implementation backlog

| ID | Phase / title | Dependencies | Acceptance / tests | Backend, Redis, MariaDB | Risk |
| --- | --- | --- | --- | --- | --- |
| FE-REVAMP-001 | M1 baseline metrics and fixtures | M0 | Save bundle/scene/memory baseline and representative snapshots | None / None / None | Low |
| FE-REVAMP-002 | Continue Game authoritative ID | 001 | Home navigates with server-returned game ID; none/stale tests | Add `GET /api/session/current-game` / None / None | High |
| FE-REVAMP-003 | Remove stale `/getToken` | 001 | No route or supported caller; auth session tests pass | None / None / None | Medium |
| FE-REVAMP-004 | Fix Vite dice/audio URLs | 001 | Production build URLs load; no parser/network errors | None / None / None | Medium |
| FE-REVAMP-005 | Characterize ownership adapter and cleanup | 001 | JSON arrays/owner names correct; mount/unmount bounded | None / None / None | High |
| FE-REVAMP-006 | Pure transport decoders/error codes | 005 | Malformed/unknown/stale inputs degrade safely | None / None / None | Medium |
| FE-REVAMP-007 | Greek content boundary | 006 | No raw exception text; copy/ARIA unit tests | None / None / None | Low |
| FE-REVAMP-008 | Presentation models | 006–007 | All current snapshot/action states mapped without invented rules | None / None / None | High |
| FE-REVAMP-009 | Session event history | 006–008 | Dedup/order/gap/100-entry/reset/live-region tests | None / None / None | Medium |
| FE-REVAMP-010 | Tokens and app theme bridge | 001 | CSS variables own palette; Ant/Tailwind map to them | None / None / None | Medium |
| FE-REVAMP-011 | Game shell scaffold | 008,010 | Desktop/tablet/phone shell behind reversible switch | None / None / None | Medium |
| FE-REVAMP-012 | Authoritative controller reducer | 006 | Mock HTTP/STOMP race, retry, cleanup and polling tests | None / None / None | High |
| FE-REVAMP-013 | HUD component extraction | 008–012 | Action/player/context/connection component suite | None / None / None | Medium |
| FE-REVAMP-014 | Board calibration and route tests | 001 | Forty anchors, corners, wrapping, jail/transport and slots | None / None / None | High |
| FE-REVAMP-015 | `BoardSceneAdapter` lifecycle | 004,014 | Visual parity, idle RAF zero, full disposal | None / None / None | High |
| FE-REVAMP-016 | Deadline snapshot projection | 012 | Authoritative countdown and absent/completed cases | Add snapshot field / None / None | Medium |
| FE-REVAMP-017 | Dice-pair contract and scene presentation | 015 | Pair DTO/event compatibility and face lookup tests | Add fields / None / None | High |
| FE-REVAMP-018 | Board metadata projection | 008 | Forty ordered DTOs replace hard-coded mechanics metadata | Add endpoint / None / add square Greek-name column | High |
| FE-REVAMP-019 | Completion result projection | 008 | No client capital calculation; tie/rank/reconnect tests | Add snapshot field / None / None | High |
| FE-REVAMP-020 | Presentation coordinator | 008,014–017 | Cancel/skip/dedupe/reconnect/reduced-motion tests | None / None / None | High |
| FE-REVAMP-021 | First two-player vertical slice | 011–020 | Exact flow in section 18, both contexts | Consume additive contracts / None / None | High |
| FE-REVAMP-022 | Full supported mechanics parity | 021 | Rule matrix and browser flows all pass | None / None / None | High |
| FE-REVAMP-023 | Responsive and accessibility pass | 022 | Keyboard, focus, live region, 200% zoom, visual baselines | None / None / None | Medium |
| FE-REVAMP-024 | Playwright harness | 021 | Disposable two-context Chromium flow with failure traces | Test-only API use / None / None | Medium |
| FE-REVAMP-025 | Pawn/dice asset pipeline and polish | 015,021 | Provenance, glTF validation and frame/size budgets | None / None / None | Medium |
| FE-REVAMP-026 | Gesture-gated audio | 011 | Persistence/autoplay/cleanup and no-audio equivalence | None / None / None | Medium |
| FE-REVAMP-027 | Route splitting and secondary screens | 010,019 | Login/home exclude Three; Greek screen parity | None / None / None | Medium |
| FE-REVAMP-028 | Final hardening and legacy removal | 022–027 | Full required CI/E2E/a11y/perf; reviewed deletion list | No breaking change / None / None | High |
| FE-REVAMP-029 | Greek nickname policy | Separate approval | Unicode/security/persistence compatibility suite | Typed player-create contract / None / policy-dependent migration | High |

## 20. FE-REVAMP-006 transport boundary

The implemented boundary is `raw HTTP/STOMP -> safe body read -> pure decoder ->
decoded transport fact`. Decoders copy and shallow-freeze known records and
arrays, ignore unknown additive snapshot/player fields, and never derive
ownership, eligibility, prices, rent, movement outcomes or presentation copy.
`deriveOwnershipProjection` remains a downstream pure derivation.

| Current transport | Current wire shape / empty behavior | Decoder policy |
| --- | --- | --- |
| Session player | `{id,nickname}` | Positive numeric ID and string nickname required |
| Current game | `{gameId,status,stateVersion,visibility}`; 204 means none | Only current resumable statuses and visibilities accepted; 204 is explicit success |
| Recovery snapshot | `{gameId,stateVersion,status,playerTurn,winner,visibility,inviteCode,optionalAction,players}` | Required identity/version/state fields validated; additive fields ignored |
| Snapshot player | `{playerId,nickname,position,money,properties,jailed,jailTurnsRemaining,bankrupt,afk}` | Canonical numeric IDs, copied numeric property array, strict booleans, unique player IDs |
| Optional action | `PURCHASE_PROPERTY` or `PAY_JAIL_EXIT` with game/player/version identity, square, cost and `declinable` | Known shapes only; unknown command-bearing types fail closed |
| Throw result | `{dice,newPosition,passedGo,squareType,data,stateVersion,replayed,card}` | Current fields validated; no `die1`/`die2` inference |
| Action/pass result | `{newBalance,acquiredProperties,nextPlayerId,stateVersion,replayed}` | Numeric values and copied property IDs validated |
| Game event | `{eventId,eventType,gameId,stateVersion,occurredAt,payload:{reason,actorPlayerId,details}}` | Envelope identity/version validated before existing recovery/display flow |
| Event detail | Fourteen current detail discriminators from `GameEventDetailType`; type-specific nullable fields omitted on the wire | Known details validate their exact fields; unknown details become bounded unsupported markers |
| Standard error | Usually `{error}` with HTTP status | Raw message is not promoted to UI copy; status becomes a stable internal code |
| Stale conflict | HTTP 409 `{error,reason:"STALE_STATE",stateVersion?}` | Preserved as `STALE_STATE`; legacy `STALE_VERSION` remains accepted; command gate still requires snapshot recovery |
| Empty success | Current-game 204; logout may have no response body | Parsed only where a body is required; expected empty success is not invalid JSON |

Normalized internal error codes are `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`,
`VALIDATION`, `STALE_STATE`, `CONFLICT`, `NETWORK`, `SERVER`, `INVALID_PAYLOAD`
and `UNKNOWN`. They retain safe HTTP status, reason, version, retry classification
and bounded diagnostics; presentation copy is explicitly deferred.

Unknown additive object fields are ignored. Unknown top-level event types and
reasons remain non-command, versioned recovery signals and are marked
unsupported; unsupported envelopes are not sent to presentation. Unknown detail
types retain only their discriminator and an unsupported marker. Malformed known
details are rejected. Unknown snapshot
statuses and optional-action types fail closed because treating them as known
could create unsafe state or command eligibility. None of these policies changes
the backend REST or STOMP contract.

## 21. FE-REVAMP-007 Greek content boundary

The Greek-only content owner is `sindopoly-front/src/features/game/content/el.js`.
It contains small frozen dictionaries and deterministic formatters for normalized
errors, gameplay terms, money, turn/player descriptions, current event facts,
connection/recovery states and accessible names. No locale switch or localization
framework is introduced while Greek remains the sole product language.

The dependency flow is:

```text
raw server data
  -> transport decoder
  -> validated facts
  -> Greek content formatters
  -> future presentation view model
  -> UI
```

The content boundary describes facts supplied by its caller. It does not decide
turn ownership, movement, purchase eligibility, winner identity or any other game
rule. FE-REVAMP-008 remains responsible for selecting content from future pure
presentation models. The current Home and Lobby error surfaces map only normalized
transport identity, while the existing gameplay-result and observer paths call the
formatters with facts they already selected.

Backend/MariaDB card text remains canonical thematic content and is preserved
verbatim; the frontend owns only category labels and mechanical-result framing.
Property/square names continue to come from supplied metadata or the retained
legacy board list, so this milestone adds no duplicate forty-square catalog.
Source contracts keep Greek copy out of transport modules, prevent direct exception
message rendering in migrated paths, and keep the content module free of network,
realtime, component and scene dependencies.

There are no REST, event-envelope/destination, Redis, MariaDB, board-asset,
Three.js or layout changes in this milestone.

## 22. FE-REVAMP-008 pure presentation models

The implemented presentation boundary is deliberately three modules under
`sindopoly-front/src/features/game/presentation/`:

- `gameViewModel.js` builds the top-level game projection and its player, turn,
  action, property and completion slices.
- `eventViewModel.js` projects one already validated event for a future history
  consumer; it neither stores nor deduplicates history.
- `connectionViewModel.js` maps an explicit caller-owned connection state and
  never estimates connection health from snapshot age.

All builders are pure, immutable, framework-free functions. They consume decoded
snapshot/event facts, the FE-REVAMP-005 ownership projection, FE-REVAMP-007 Greek
content and optional explicit command/connection state. They have no network,
subscription, component, scene, persistence or animation dependency. No selector
library or memoization is introduced; later measured component/controller work may
memoize at accepted snapshot identity or version if justified.

Viewer identity is an exact positive numeric player ID. An absent, stale or
malformed viewer never falls back to another member and receives no gameplay
action. Player order remains snapshot order, nicknames remain display-only, and
property counts use resolved ownership so a cross-player conflict remains unowned.
Property names are accepted only as optional caller-supplied display metadata; no
board catalog is duplicated.

Action presentation fails closed. A purchase or jail-exit action requires exact
`gameId`, `stateVersion`, active `playerTurn` and viewer `playerId` agreement with
the decoded `optionalAction`. Decline/pass is exposed only when `declinable` is
true. Pending command or explicit non-command-capable connection state disables a
proven action without erasing its authoritative kind. The current backend roll
contract permits `ROLL` only for an `inProgress` active member when no optional
action exists. This includes a jailed active member: that command materializes the
server-owned jail option rather than deriving jail mechanics in the model.

Completion exposes only snapshot `winner` identity/name. It does not calculate
asset value, final capital, order or a fallback winner. The legacy `Board.jsx`
completion calculation remains isolated pending FE-REVAMP-019. Other retained
legacy boundaries include `boardFromSnapshot`, Board-local state, direct scene
state and existing modal rendering. The only current consumer migration is the
observer notification, which now renders `eventViewModel` text while retaining
its existing queue and non-actionable behavior.

There are no REST, STOMP, Redis, MariaDB, background, board asset, Three.js,
layout or gameplay-rule changes in this milestone.

## 23. FE-REVAMP-009 session event history

`eventHistory.js` is the pure, framework-free presentation-session boundary
between an FE-REVAMP-008 `EventViewModel` and the future `EventHistory` React
component. A future mounted game controller owns its state; it is not part of an
authoritative snapshot, transport connection, scene, observer-toast queue or
global store. The current milestone connects the decoder → event model → history
flow in contract tests only, leaving `Board.jsx` and visible behavior unchanged.

State is the frozen shape `{gameId, entries, seenEventIds}`. A normal frozen entry
copies only `{id, kind, stateVersion, occurredAt, actorPlayerId, text, emphasis,
announceable}` from one already validated/presented envelope. One grouped event
model creates one history entry. Distinct event IDs remain distinct even when
they share a state version; the history does not reinterpret details or calculate
game rules.

At most 100 entries are retained. They are ordered by authoritative
`stateVersion`, then parseable server `occurredAt`, then event ID. A late older
event is inserted at its stable position and cannot replace the newest
announcement candidate. Event IDs use a separate 256-item immutable LRU: a
duplicate is not added and refreshes its recency, and an ID forgotten after the
bounded window is eligible again. Visible overflow evicts the oldest ordered
entry independently of the dedup window.

`markEventHistoryGap` is called only when reconciliation has already proved a
missed version range. It adds a presentation marker with `id: null`, kind
`HISTORY_GAP`, explicit version/time metadata and the Greek content-boundary text
“Χάθηκαν ενδιάμεσες ενημερώσεις· η κατάσταση συγχρονίστηκε”. Adjacent recovery
signals are coalesced. The marker is not a server event, and no snapshot details
are used to invent rolls, rent, cards or other missed narrative. Clean reconnects
retain history without a marker. A new game ID clears entries and deduplication;
explicit cleanup can do the same. Full reload naturally starts empty.

Selectors expose the latest ordered entry and the single latest announceable
entry. This supports a future throttled polite live region without storing DOM or
ARIA behavior in the reducer and without replaying retained entries when a panel
opens. The current observer notification remains a separate short-lived queue.

History is current-browser-session, presentation-only memory. Reload loses it;
reconnect preserves locally observed entries; a proven gap is disclosed rather
than reconstructed. It provides no replay or audit guarantee, never becomes game
state, and has no localStorage/sessionStorage, REST, STOMP protocol, Redis,
MariaDB, background, board, Three.js or package impact. The server remains
authoritative.

## 24. FE-REVAMP-010 design tokens and application theme bridge

The implemented visual foundation keeps values in one pure JavaScript source,
`src/styles/designTokens.js`. This is a necessary refinement of the earlier
“CSS owns values” wording: Ant Design 5.12 derives palettes in JavaScript, and a
local algorithm check showed that passing `var(--color-action-primary)` as a
seed resolves derivative primary colors to black. The Ant bridge therefore
consumes literal values from the canonical object. `tokens.css` is the
test-synchronized, no-JavaScript custom-property artifact and remains the stable
interface for future custom UI. Contract tests compare every root property with
the canonical source so the two cannot drift silently.

The semantic layer includes all approved foundation, text, action, interaction,
status, active/self, four-player and property-group colors; the 4–48px spacing
scale; control/panel/major/pill radii; 12–36px type scale; weights and line
heights; low/high shadows; surface opacity and future scrims; 100–460ms motion
with standard easing; reduced-motion values; and documented board through
completion z-index layers. Focus uses the approved `#075EE8` 3px ring with a
3px offset. The global rule applies only to `:focus-visible`; it never removes a
native outline without replacement. Selection, tabular-number and future
reduced-motion contracts are available without changing Board animation.

`Noto Sans` is the first family in the interface stack, followed by Segoe UI,
Arial and sans-serif. No font binary, web-font request or loading claim is added;
systems without Noto Sans use the fallback. Existing legacy typography is not
globally migrated in this milestone.

One root Ant `ConfigProvider` now maps the canonical primary, text, surface,
border, status, focus, radius, 44px control, font, shadow, motion and popup-layer
decisions. The three page-local providers remain temporarily: Home and Search
retain their established gold primary, while Game retains its green primary.
Removing them now would create a broad visual regression. Existing global
`.ant-*` rules in `index.css` also remain a legacy override boundary for later
screen migration.

Tailwind keeps preflight disabled and now exposes a deliberately small set of
semantic CSS-variable aliases for surfaces, text, borders, actions, spacing,
radii, shadows, interface font and layers. It remains the layout/responsive
tool. Future complex gameplay states use co-located component CSS and semantic
variables. Static colors, spacing, typography, radii and shadows should not be
added as inline styles; inline styles remain valid for calculated scene/layout
values or CSS-variable assignment. Existing arbitrary utilities and static
inline declarations are retained until their owning screens migrate.

Current styling ownership remains mixed by design during the strangler
migration: `index.css` owns the reset, legacy Roboto rule, global Ant overrides,
legacy Board/navigation, end-game and fireworks rules; page JSX owns Tailwind
utilities and approximately twenty-one inline-style declarations; `App.css` is
unused starter CSS; the nested providers own three legacy primary colors; and
`Board.jsx` owns Three.js materials, lighting, camera and scene values. None of
those legacy areas was broadly cleaned up here.

The token stylesheet is imported once at the application root. The current
`monopoly_bg.png` imports, Tailwind background alias, cover behavior, vignette,
board/Dice GLB URLs, scene code, materials, lighting and camera are unchanged.
Future scrim and property-color tokens exist but are not applied to the
background or 3D board. There are no gameplay, route, REST, STOMP, Redis,
MariaDB, package or persistence changes.

## 25. FE-REVAMP-011 responsive GameShell scaffold

`GameShell` is the page-composition boundary for the game route. It owns only
the responsive grid, shell spacing, optional region surfaces, landmarks and
outer sizing. It does not fetch snapshots, subscribe to STOMP, issue commands,
derive presentation models, retain event history, own player state or manage
Three.js resources. The public slot contract requires `board` and accepts
optional `header`, `players`, `context` and `actions` React nodes. An optional
region is not emitted when its node is absent, so it reserves no decorative box
or grid track and cannot expose a hidden focus target.

The production route is now `Game -> GameShell -> Board`, guarded by the local
`GAME_SHELL_ENABLED` switch. It supplies only the existing Board through an
explicit `legacy` compatibility modifier. Compatibility mode removes shell
inset and gap so the current viewport-sized canvas, HUD, notifications and
dialogs remain the single gameplay experience. No future player, event, turn,
money, property or action content is fabricated. This path is temporary: later
milestones populate real slots and eventually retire the Board-owned HUD, but
must not duplicate a gameplay action while the legacy control remains live.

The desktop grid activates the future player and context tracks only when those
slots are populated. At 1501px and above their target widths are 236px and
304px; from 1101px through 1500px they are 208px and 286px. The board-only path
uses one shrink-safe `minmax(0, 1fr)` track. Tablet (761–1100px) and phone
(760px and below) collapse populated regions to one column in DOM order so
keyboard focus order remains predictable. Desktop targets viewport height;
smaller layouts retain normal page flow rather than creating clipped or nested
scroll regions. Insets and gaps use the FE-REVAMP-010 spacing tokens, and future
region surfaces use the canonical surface, structural-border, radius and shadow
tokens.

`Game.jsx` remains the sole owner of `monopoly_bg.png`, its existing
`background-size: cover` behavior and vignette. GameShell adds no background
asset or full-page opaque surface. `Board.jsx`, the board and Dice GLBs, scene
materials, lighting, camera, pawns, movement, audio, controls and lifecycle are
unchanged. The shell removes the page-level fixed 800px wrapper and supplies
`min-width: 0`, but the legacy Board still owns a viewport-sized root/canvas and
absolutely positioned HUD. Those Board-internal assumptions remain a deliberate
boundary for the HUD and scene-adapter milestones; functional phone parity is
not claimed by this scaffold.

Future migration should supply the real `MatchStatusHeader`, `PlayerRail`,
`ContextPanel`/event history and `ActionTray` through these slots after the
authoritative controller exists. GameShell must continue to consume rendered
children only and must never become a second owner of game or transport state.
There are no Redis, REST, STOMP, MariaDB, package or backend changes in this
milestone.

## 26. FE-REVAMP-012 authoritative controller reducer

`src/features/game/controller/gameControllerReducer.js` is the pure,
framework-independent state machine intended to sit beneath the future
`useAuthoritativeGame` hook. Its bounded state contains one immutable game
identity, the accepted decoded snapshot and version, connection status, command
lifecycle, recovery reason/event-gap metadata, a snapshot-refresh signal and the
latest observed event version. It stores no viewer identity, React values, API
or STOMP clients, timers, promises, DOM/Three.js objects, presentation history
or Redis concepts.

The explicit reducer inputs are `SNAPSHOT_ACCEPTED`, `COMMAND_STARTED`,
`COMMAND_SUCCEEDED`, `COMMAND_FAILED`, `CONNECTION_CHANGED`,
`REALTIME_EVENT_RECEIVED`, `RECOVERY_STARTED` and `RESET`. Command IDs are
injected by the future orchestration layer; the reducer never generates an ID or
submits/retries a command. Command lifecycle states are `IDLE`, `PENDING`,
`AWAITING_SNAPSHOT`, `FAILED`, `STALE` and `BLOCKED`. The pure
`canSubmitGameCommand` selector means only that controller/transport lifecycle
is safe; backend snapshots and presentation models still decide whether a roll,
purchase or other gameplay action is authorized.

Only a same-game validated snapshot may advance authoritative frontend truth.
A version newer than the accepted version replaces the snapshot, an older
version is rejected by identity, and an equal version confirms recovery
freshness without replacing the already accepted snapshot object. Command
results may record a reconciliation target but never advance `acceptedVersion`
or the expected command version. After success, the controller remains
`AWAITING_SNAPSHOT` until an accepted snapshot reaches the result version. This
prevents a response DTO from masquerading as complete game truth.

A normalized `STALE_STATE` failure blocks commands, requests a snapshot and is
never blind-retried. `NETWORK`, `SERVER`, `INVALID_PAYLOAD` and `UNKNOWN` leave
the command outcome ambiguous and likewise require snapshot reconciliation.
`VALIDATION` and ordinary `CONFLICT` retain the accepted snapshot as safe and
permit a later explicit intent. `UNAUTHENTICATED`, `FORBIDDEN` and `NOT_FOUND`
enter a blocking lifecycle for later session/navigation handling. The reducer
stores only bounded error facts: code, HTTP status, reason, state version and
retriability; it excludes messages, causes, diagnostics and backend details.

Connection status is explicit (`CONNECTED`, `DEGRADED`, `RECONNECTING`,
`OFFLINE`, `RECOVERED`) and never inferred from snapshot age or animation.
Degraded, reconnecting and offline transitions disable commands and require an
authoritative recovery read when a snapshot was already accepted. Changing
connection status does not mutate snapshot truth or clear recovery; an accepted
snapshot performs reconciliation, and a connected/recovered status then permits
commands if every other lifecycle gate is safe.

Validated realtime events remain notifications that authoritative state may
have changed. Same/older or cross-game events are ignored. A contiguous newer
version requests a snapshot refresh; a jump beyond the accepted/observed
version records bounded `{ stateVersion, occurredAt }` gap metadata and a
recovery reason. Event payload details never update the snapshot. Contiguous
bursts retain only the newest observed version, and snapshot acceptance clears
the refresh/gap signal only after it catches up. The gap metadata can be passed
to FE-REVAMP-009 `markEventHistoryGap` without placing presentation history in
controller state or fabricating missed events.

`RESET` constructs fresh state for an explicitly supplied valid game identity
and clears snapshot/version, command, recovery, refresh and event metadata.
Invalid identities fail at construction and cannot silently switch a live
controller. State transitions shallow-copy and freeze the bounded lifecycle
objects; already decoded immutable snapshots remain compatible with the
ownership projection and FE-REVAMP-008 `GameViewModel`.

The legacy module-level `gameCommandState.js` maps/sets, `realtimeSync.js`,
`useGameRealtime`, Board/Lobby polling, snapshot reads and STOMP ownership remain
the live compatibility path. Nothing is wired to the new reducer yet. The
backlog row's broader mock HTTP/STOMP race, retry, cleanup and polling acceptance
belongs to the future gateway/hook orchestration that mounts this reducer; this
bounded milestone deliberately adds no side effects. The reducer must continue
to have no React, HTTP, STOMP, DOM, CSS, Three.js, Greek-content, backend or
game-rule dependency. Redis, REST/STOMP protocols, MariaDB, Board, GameShell,
background, packages and visible application behavior are unchanged.

## 27. FE-REVAMP-013 presentational HUD component boundary

The `src/features/game/hud` boundary now contains `MatchStatusHeader`,
`ConnectionStatus`, `PlayerRail`, `PlayerCard`, `ActionTray` and a generic
`ContextPanel`. This is the smallest set that satisfies the committed
FE-REVAMP-013 action/player/context/connection component suite and the target
game-shell header. Event-history UI, property-detail UI, audio settings, card
reveal and dialogs remain outside this milestone. The barrel is the only owner
of the co-located `GameHud.css` import; individual component modules remain
directly renderable in Node contract tests.

The components consume only FE-REVAMP-008 presentation facts or explicit
caller-owned content. `MatchStatusHeader` accepts the turn and connection view
models. `PlayerRail` accepts the ordered player view models and preserves their
order; `PlayerCard` renders the supplied nickname, formatted balance, property
count and state flags. Because no authoritative pawn-identity mapping exists,
cards use a neutral `#playerId` marker plus readable nickname/state text rather
than binding the four candidate identity colors to transient array positions.
`ActionTray` accepts the action view model and renders a primary control only
when the model says an authorized action exists. A decline control appears only
when the model supplies both `canDecline` and a secondary label. The generic
`ContextPanel` renders only real caller-owned children and returns no content
for an absent child.

Intent flows upward through `onPrimaryAction` and `onSecondaryAction`. Disabled,
pending or unwired controls have no click handler, and each enabled handler
invokes its callback once. The HUD does not fetch, subscribe, poll, reconnect,
generate command IDs, inspect versions, accept snapshots, calculate rules or
touch Three.js. The future controller/orchestration layer remains responsible
for mapping an emitted intent to an authoritative command and reconciliation.

HUD-only structural copy lives in the Greek content boundary as the separately
tree-shakeable `HUD_CONTENT` object. Property-count and neutral-identity
formatters also live there. Component CSS uses FE-REVAMP-010 semantic color,
spacing, radius, typography, elevation and control-size tokens without a new
palette. Connection, self, active, jail, AFK and bankruptcy states are always
expressed in text as well as styling. Player cards are non-focusable semantic
list items, actions are native buttons, status text does not use continuous
live announcements, errors use a bounded alert, and no component moves focus.

The rail is vertical at desktop widths. At the existing tablet and phone
breakpoints it becomes a controlled horizontal list, while the header and
action controls stack on phones. Action controls retain the shared 44px minimum
target token. These rules prepare the components for the existing GameShell
slots without attempting the final responsive game composition.

Production deliberately remains `Game -> GameShell(legacy) -> Board`. No new
HUD component is mounted, so Board remains the single live owner of player and
turn display, dice control, property list/modal, audio control, observer toast,
result dialog and end-game navigation. This avoids a second roll, purchase,
jail, property or turn UI before controller integration can replace each owner
one for one. The current Board HUD inventory is classified as follows:

- presentational candidates: player names/money/turn emphasis, visual action
  controls, property summary, audio status, observer feedback and result copy;
- controller-dependent responsibilities: current-turn refresh, command
  pending/eligibility, roll/purchase/jail execution, property snapshot reads
  and end-game navigation;
- Board/Three.js-coupled responsibilities: canvas sizing, scene/camera, dice
  and pawn objects, movement and animation;
- legacy retirement candidates: imperative card DOM manipulation, duplicated
  local turn/player indices and Board-local HUD positioning.

`Board.jsx`, `GameShell`, the route, background, board and Dice GLBs, materials,
lighting, camera, pawns, animation, REST/STOMP contracts, Redis, MariaDB and
packages are unchanged. The extracted CSS is not in the production module
graph until a later one-owner migration imports the HUD barrel. A runtime game
smoke is therefore optional for this milestone; render tests and the production
source contract instead prove that no duplicate HUD is mounted.

## 28. FE-REVAMP-014 board calibration and visual-route contract

`src/features/game/board/boardCalibration.js` is the pure geometry boundary for
the existing 3D board. It imports no React, Three.js, transport, controller,
presentation, CSS or game-rule module. The backend remains the sole authority
for a player's destination; calibration only maps a validated numeric position
to world space, and `buildForwardRoute` only describes a possible forward
visual path between two already-confirmed positions.

The GLB was inspected directly without changing or exporting it. After the
existing Board transform (`scale = 0.035`, position at the world origin and a
Y-axis rotation of `PI / 2`), its bounds are approximately
`x=-26.25..26.25`, `y=-0.131355..0.043661` and
`z=-25.709161..26.790839`. The playable plane is therefore 52.5 by 52.5 world
units, with X horizontal, Z depth, Y up and a model center at
`(x=0, z=0.540839)`. Board currently places primitive pawn centers at Y 0.5
for cube/cone, 0.7 for sphere and 0.8 for torus. Calibration uses a consistent
base pawn-center elevation of Y 0.5; a future scene adapter may apply a
model-origin correction without changing square geometry.

The forty anchors are generated mathematically rather than stored as forty
unrelated literals. The legacy path's 6-unit corner-to-tile spacing and
4.15-unit ordinary spacing satisfy `6 + (8 * 4.15) + 6 = 45.2`; calibration
centers that closed perimeter on the inspected model with a 22.6 half-span.
This leaves a 3.65-unit inset from each 26.25-unit outer edge and removes the
legacy drift caused by starting near `(22,-22)` but completing a lap near
`(23.2,-23.2)`. Every anchor and collection is frozen, uses finite coordinates
and has one identity from 0 through 39.

Position 0 is Start at positive X/negative Z. Positions 1–9 move in positive Z
to position 10 (Jail) at positive X/positive Z. Positions 11–19 move in negative
X to position 20 (Parking) at negative X/positive Z. Positions 21–29 move in
negative Z to position 30 (Go to Jail) at negative X/negative Z. Positions
31–39 move in positive X back toward Start. This matches the frontend square
list, the backend's forty-row square seed (`0 START`, `10 JAIL`, `20 PARKING`,
`30 GOJAIL`) and `MovementService.BOARD_SIZE = 40` with increasing modulo
movement.

`getPawnAnchor(position, slotIndex)` accepts one explicit slot from 0 through 3.
It applies a 2-by-2, 0.55-unit local layout whose tangent and inward axes rotate
on each board edge. The four results stay within 0.8 units of the square center,
including corners. Calibration deliberately does not assign players to slots:
the future presentation coordinator must provide a stable assignment that does
not depend on transient snapshot order.

`buildForwardRoute(from, to)` validates both inputs, excludes `from`, includes
the confirmed destination and increments through positions 0–39. Thus 5 to 8
is `[6,7,8]`, while 38 to 2 is `[39,0,1,2]`. Crossing position zero is a visual
wrap fact only and does not imply a Start reward. Equal positions return an
empty frozen route because no full lap has been proven. Invalid external
positions or slots return `null`; strings, non-integers and non-finite values
are never normalized with modulo.

Initial mount, reconnect, recovery and stale-state reconciliation should call
`getPawnAnchor` for the accepted snapshot position and snap directly, without
replaying local route history. Current `ROLL_COMPLETED` events contain a
`PLAYER_MOVED` old/final pair plus landing/card/jail details, but do not carry an
explicit presentation movement mode. Card transport and Go-to-Jail may also
make the final position differ from the first landed square. Calibration does
not infer normal, direct or snap behavior from those facts; that selection
belongs to the future presentation coordinator, which will pass either a
forward route or a direct anchor to `BoardSceneAdapter`.

The existing Board movement was inspected but not changed. Its forty-step and
increasing-position convention is canonical; the step sizes are approximate
but visually established; position math is duplicated between incremental
movement and server snapshots; same-position recovery does not snap; direct
movement semantics are not distinguished; and initial coordinates/elevations
are coupled to four primitive pawn shapes. Production does not import the new
module, so Board, camera, lighting, models, animation, HUD, background and
visible behavior remain unchanged. No browser calibration overlay was used;
anchor placement is verified from source math and inspected GLB bounds, leaving
texture-level visual centering for FE-REVAMP-015 parity checks.

## 29. Git, documentation and risk

Use small conventional commits such as `test(frontend): characterize board
cleanup`, `fix(frontend): resolve game asset URLs`, `feat(api): project turn
deadline`, and `feat(frontend): add authoritative game controller`. Tests belong
with the behavior they protect. Backend contract commits stay separate from
visual/component commits. Do not combine generated assets with controller work.

The branch merges into `dev` only after M13: current mechanics parity, required
CI, two-player browser flow, accessibility checks, performance comparison,
security review, current docs, and no unresolved high-risk regression. A staged
merge may be proposed only if feature switches keep production behavior on the
verified legacy path.

Top risks:

| Risk | Rating | Mitigation |
| --- | --- | --- |
| Multiplayer/realtime regression | High | Preserve controller invariants; mocked races plus two-context E2E |
| Stale snapshot rollback | High | Single monotonic acceptance owner and conflict refresh gate |
| Client rule duplication | High | Action view derives only from server-exposed actions |
| `Board.jsx` extraction breakage | High | Strangler adapters and reversible milestones |
| Three resource leaks | High | Adapter lifecycle tests, idle RAF and remount memory checks |
| Animation/server divergence | High | Versioned coordinator with cancel/snap semantics |
| Completion misreporting | High | Authoritative final-result projection |
| Responsive regression | Medium | Fixed visual matrix and functional phone acceptance |
| Accessibility regression | Medium | Semantic components, keyboard E2E and reduced-motion tests |
| Bundle growth | Medium | Route boundary before asset polish; checkpoint budgets |
| Asset licensing/cost | Medium | Provenance manifest and measured budgets before merge |
| Browser autoplay | Medium | Gesture gate, truthful state and no-audio equivalence |
| Background contrast | Medium | Locked opaque surfaces and contrast regression checks |
| Docker/project-name quirks | Medium | Reuse canonical Windows/Compose readiness contract |
| Unsupported mechanics enter UI | High | Rule-status matrix in acceptance review; no unbacked controls |
| Process-local STOMP broker | Medium | Keep snapshot recovery/polling; do not claim multi-instance delivery |

Permanent frontend-revamp documentation should remain minimal. This document is
the architecture/migration/backlog source of truth. Add separate `DESIGN_SYSTEM`,
`ACCESSIBILITY`, `PERFORMANCE_BUDGET` or `TEST_MATRIX` documents only when their
corresponding implementation produces maintained code and evidence.
