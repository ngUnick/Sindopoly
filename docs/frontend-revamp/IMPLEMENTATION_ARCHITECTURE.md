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
| Turn deadline | Nullable `turnDeadlineEpochMs` on `GameRealtimeSnapshot` | Snapshot service reads the existing `game:{gameId}` field in the stable version-bracketed read | Additive; absolute epoch milliseconds, `null` when absent, frontend display-only authority. Redis schema: **None**. MariaDB: **None** |
| Current game | Add `GET /api/session/current-game` returning `CurrentGameDto(gameId,status,stateVersion,visibility)` or 204; visibility preserves the existing public/private lobby route | Authenticated discovery returns candidates then validates membership/stable game snapshots | Keep boolean endpoint for compatibility; self-session, none, stale candidate and multi-game race tests. Redis schema: **None**. MariaDB: **None** |
| Board metadata | `GET /api/board/squares` returns ordered `BoardSquareMetadataDto(position,name,type,property)`; property is nullable `{purchasePrice,baseRent,group}` | One ordered read service/repository projection; Flyway V2 adds `square.name`, seeds 40 Greek names, then enforces non-null | Additive authenticated endpoint; order/completeness/auth/one-query tests. Redis schema: **None**. MariaDB: **V2 name column only** |
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
| M7 Contract projections | Dice pair, deadline, board metadata, final result | Backend/contract compatibility tests | None | Add `die1`/`die2`/`total` while retaining `dice`; add snapshot deadline/final result; add `GET /api/board/squares`; no destination removal | Flyway V2 adds/backfills `square.name`, then enforces non-null | High; additive fields ignored by old client |
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
| Recovery snapshot | `{gameId,stateVersion,status,playerTurn,turnDeadlineEpochMs,winner,visibility,inviteCode,optionalAction,players}` | Required identity/version/state fields validated; deadline must be `null` or a positive safe integer; additive fields ignored |
| Snapshot player | `{playerId,nickname,position,money,properties,jailed,jailTurnsRemaining,bankrupt,afk}` | Canonical numeric IDs, copied numeric property array, strict booleans, unique player IDs |
| Optional action | `PURCHASE_PROPERTY` or `PAY_JAIL_EXIT` with game/player/version identity, square, cost and `declinable` | Known shapes only; unknown command-bearing types fail closed |
| Throw result | `{dice,die1,die2,total,newPosition,passedGo,squareType,data,stateVersion,replayed,card}` | Genuine rolls require 1–6 dice, `total=die1+die2`, and compatibility `dice=total`; a jail-choice-only response has no pair |
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

FE-REVAMP-019 replaces the former winner-only completion slice with the nullable
authoritative `finalResult` described below. Other retained
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

## 29. FE-REVAMP-015 BoardSceneAdapter lifecycle

`BoardSceneAdapter` now owns the production Three.js lifecycle that previously
lived in `Board.jsx`: scene, perspective camera, renderer and canvas, the board
and Dice GLTF loaders/instances, ambient and directional lights, the four
primitive pawn meshes, the stable current player-to-pawn map, resize and mouse
listeners, render invalidation, and disposal. Before extraction, Board retained
all of these objects in React refs or effect locals. Its cleanup cancelled the
continuous RAF and removed listeners, but did not dispose the renderer, render
lists, geometries, materials, textures or late GLTF results. Both loaders could
therefore attach resources after route teardown.

The production imperative API is deliberately small: `mount(container)`,
`resize(width?, height?, pixelRatio?)`, `orientCameraForPosition(position)`,
`setPawnPositions(players)`, `setPawnPosition(playerId, position)`,
`presentDiceRoll`, its FE-REVAMP-020 completion/cancellation variants, and
`dispose()`. Calls before mount or after disposal fail safely, a second mount on
one live/disposed instance is rejected, and `dispose()` is idempotent. React
owns the container ref and adapter lifetime and passes only accepted visual
facts. Board continues to own REST, STOMP, polling, snapshots, commands, React
state, modals, navigation, observer feedback and `Audio(honeyJam)`.

Visual constants remain the established production values: transparent clear,
75-degree camera at the same four side presets, board scale `0.035` and Y
rotation `π/2`, existing light colors/intensities/shadow camera, unchanged
primitive pawn shapes/material colors/initial offsets, and two scale-10 hidden
Dice clones. Sizing temporarily preserves legacy window behavior: initial
renderer size is `innerWidth × innerHeight*0.99`; a mounted resize listener uses
`innerWidth × innerHeight*0.92`, updates the camera projection and caps pixel
ratio at 2. Container-derived sizing is deferred to avoid a viewport redesign.
The current window-level mouse drag orbit is likewise preserved, but its named
handlers now belong to and are removed by the adapter.

The committed backlog requires idle RAF zero, which is stricter than merely
bounding the former continuous loop. Mount and each camera, pawn, resize or
model-load invalidation schedule at most one coalesced frame. The frame renders
once and does not reschedule itself. Disposal cancels a pending frame, and a
disposed adapter cannot invalidate again.

Every GLTF callback captures the adapter generation. A callback that arrives
after disposal never touches the cleared scene/container/renderer and instead
disposes the newly loaded hierarchy. Normal teardown walks the owned scene once
and deduplicates shared geometry, material and texture identities, including
material arrays and texture uniforms. It then disposes render lists and the
renderer and removes the adapter-owned canvas. `forceContextLoss()` is not used:
normal deterministic disposal is sufficient and avoids deliberately forcing a
context-loss event during routine route navigation.

FE-REVAMP-014 is consumed only for validated forward-route geometry. Static
pawn placement continues to use the visually established incremental
coordinates, so the unverified canonical anchors do not enter production and
texture-level anchor centering remains deferred. No square-by-square animation,
Dice roll animation, camera choreography, ownership marker, pawn GLB or final
player-slot orchestration was added.

Node lifecycle/resource tests cover mount, resize, one-frame invalidation,
listeners, duplicate mount, pre/post-mount safety, idempotent disposal, nested
and shared resources, material arrays/textures, normal board/Dice hierarchy
cleanup, late callbacks and StrictMode-style fresh remount. A live current-stack
smoke created two authenticated players, created/joined/started a disposable
game, rendered the board and primitive pawns, completed one authoritative roll,
and exercised mouse orbit. Board and Dice assets produced no fresh console
warning/error. A clean browser tab had exactly one canvas. Five
Game→Home→Game cycles each measured one canvas while mounted and zero while
unmounted, then one after remount; no duplicate rendering or WebGL context
warning was observed. Exact GPU-memory proof was not available.

Remaining lifecycle debt outside this adapter includes Board polling/STOMP and
command timers, audio teardown/autoplay policy, the legacy window-size split,
incremental pawn-coordinate drift and presentation movement semantics. GLTF
requests are not transport-aborted because the current loader has no simple
abort contract; generation checks and late-result disposal provide the bounded
ownership guarantee. This change adds no REST/STOMP/Redis/MariaDB contract,
authority, authentication or gameplay-rule surface.

## 30. FE-REVAMP-016 authoritative turn-deadline projection

`GET /api/game-state/{gameId}/snapshot` now exposes nullable
`turnDeadlineEpochMs` on `GameRealtimeSnapshot`. A non-null value is the
server-generated absolute Unix epoch deadline in milliseconds already stored as
a decimal string in the `turnDeadlineEpochMs` field of the authoritative
`game:{gameId}` HASH. Lobby snapshots have no deadline. Started games create one;
ordinary turn handoff, purchase-option creation, jail-option creation/payment and
timeout handoff renew it according to the existing transition rules. Completion
deletes it before retained terminal snapshots are served. Compatibility state
with a missing field therefore projects `null` rather than inventing a deadline.

Projection uses `RedisGameTransitionStore.loadStable`: the deadline, status,
active player, optional action and `stateVersion` all come from the same game
HASH read bracketed by equal version reads. No timer lookup or extra Redis round
trip is added, so a snapshot cannot combine version N with a deadline fetched
separately from N+1. Redis key/type/serializer/TTL and every timing rule remain
unchanged; there is no new key family, MariaDB state, event field or STOMP
destination.

The frontend transport decoder requires the field because backend and frontend
ship together. It accepts only `null` or a positive JavaScript safe integer and
rejects missing, string, fractional, non-finite, zero and negative values. The
pure turn presentation model carries the unchanged absolute value as
`turn.turnDeadlineEpochMs`; the lifecycle reducer keeps it only inside the
accepted immutable snapshot, so its existing newer/older/equal-version rules
also govern deadline replacement. No countdown, timer hook or visible copy is
introduced.

A future countdown may compare the absolute deadline with browser wall-clock
time. Modest client/server clock skew can therefore affect displayed seconds,
but visual zero is never timeout authority: the UI must wait for the backend
transition and authoritative recovery snapshot. Existing STOMP events remain
wake-up signals that trigger that recovery rather than carrying deadline data.

## 31. FE-REVAMP-017 authoritative dice pair and scene presentation

`DiceService` now returns one validated `DiceRoll(die1, die2, total)` after
calling the configured `RandomIntGenerator#nextDie` exactly twice. Each die is
1–6 and `total=die1+die2`; doubles remain an ordinary pair with no extra turn or
new rule. `TurnCommandService` uses that same total for movement, rent and the
existing `lastDice` field, and transports the same pair through
`ThrowResultDto` and `DICE_ROLLED`. The legacy `dice` JSON field remains only as
`total`'s compatibility alias. A jailed command that merely creates the
existing pay/skip choice consumes no entropy and omits the nullable pair fields.

The replay HASH remains `game:{gameId}:commands`: its existing `resultJson`
string naturally contains the expanded DTO. Replay is checked before dice
generation and returns the exact serialized original pair without another RNG
read, transition or STOMP publication. No key, type, serializer, TTL or Lua
shape changed. `dice:entropy` remains a no-TTL LIST of decimal strings `1`–`6`;
the refill job appends one random.org die per item, `nextDie` consumes one item
from the left, one roll consumes two, and an empty list uses the existing
in-process secure fallback. MariaDB is unchanged.

The frontend decoders fail closed unless genuine REST and event pairs have
integer dice in range, a 2–12 total, correct addition, and `dice=total`. The pure
dice presentation model carries only `die1`, `die2`, `total` and a monotonic
presentation ID. Existing Greek DOM feedback continues to announce the total,
so the 3D model is not the sole outcome representation.

`BoardSceneAdapter.presentDiceRoll` consumes those visual facts plus an explicit
reduced-motion flag. It reuses the one preloaded pair of scale-10 Dice clones at
the board's open center (`x=-2.1/+2.1`, `y=0.25`, `z=0.5`), performs a bounded
760ms lift/tumble, and settles to predetermined rotations. Browser calibration
of the actual GLB established original-axis face values
`+X/-X/+Y/-Y/+Z/-Z = 6/1/2/5/4/3`; the exported lookup encodes those rotations.
No physics or client randomness determines a result.

The accepted transition version is the presentation ID. Equal/older IDs are
ignored, so a command response and its own STOMP echo animate once; a newer roll
supersedes the active sequence and cannot be overwritten by a stale settle.
Snapshots never call this API and therefore never replay historical rolls.
Reduced motion reveals the deterministic pair directly and schedules one
coalesced render. Normal animation is the only time RAF reschedules; after
settle it drains to zero. Disposal cancels the one pending frame, clears pending
or active dice presentation, and retains the FE-REVAMP-015 resource guarantees.
Board/pawn movement, camera, lighting, assets, background, HUD, turn/jail rules,
REST paths, STOMP destinations and dependencies are unchanged.

## 32. FE-REVAMP-018 canonical board metadata projection

The canonical board catalog now follows one read-only chain:

`MariaDB square (Flyway V1+V2) → BoardMetadataService → GET
/api/board/squares → decodeBoardMetadata → buildBoardMetadataIndex →
future game-controller/HUD integration`.

The migration is intentionally included even though a no-migration outcome was
the default. The committed backlog requires the Greek-name column, and both V1
and the live schema proved that no durable name/title field existed. V2 first
adds a nullable `VARCHAR(100)`, maps all 40 established Greek display names by
ID, and only then enforces non-null. An unexpected ID is left null so migration
fails closed. V1 remains immutable.

`BoardMetadataService` issues one ordered repository query and requires exactly
40 contiguous rows (`0`–`39`). It validates names, types, price/rent semantics,
and property groups before emitting immutable DTOs. Each DTO exposes
`position`, `name`, canonical `type`, and either null `property` or
`{purchasePrice,baseRent,group}`. Utilities alone have a null base rent because
their charge is a game rule, not static metadata. The endpoint is session
authenticated but deliberately has no game-membership guard: this is global,
non-sensitive reference data, not a game resource. It accepts no input, changes
no state, and adds no CSRF, Redis, replay, polling, timer, or STOMP behavior.

The frontend transport decoder independently enforces completeness, exact
ordering, known types, property/type consistency, and finite integer values.
The pure immutable index retains ordered iteration and O(1) lookup by position.
`gameViewModel` now accepts this typed index rather than the former ad-hoc
`namesBySquareId` map, while ownership continues to come only from the live
ownership projection. This prepares the boundary without mounting a new fetch
or changing the current Board lifecycle.

Legacy catalog retirement is explicit. `Board.jsx#gamePositions` remains a
temporary presentation dependency until the controller/board vertical slice;
it is no longer the intended metadata authority. Its incomplete completion
`priceMap` was retired by FE-REVAMP-019. `boardCalibration` stays the geometry authority and
`ownershipProjection` stays the live ownership authority. The extracted HUD is
still unmounted. A later single-owner integration must replace the remaining
Board catalog reads before deleting them; this item does not broaden into that
runtime migration.

## 33. FE-REVAMP-019 authoritative completion result

`GET /api/game-state/{gameId}/snapshot` now includes nullable `finalResult`.
Lobby and in-progress snapshots expose `null`. An ended snapshot exposes
`winnerPlayerId` plus ordered immutable standings with exactly
`{playerId,nickname,cash,propertyValue,totalValue,rank,winner}`. Numeric player
ID remains identity; nickname is display data.

The backend formula is `totalValue = terminal Redis cash + sum(canonical
MariaDB purchase price for each terminal owned-property ID)`. It reads the full
validated 40-square board projection once per completion calculation, rather
than querying each property or creating a Redis metadata cache. Unknown,
special, duplicated, malformed, or unpriced ownership fails closed. Negative
cash remains valid; property value is non-negative; checked integer addition
rejects overflow. Bankrupt participants remain represented because completion
does not redefine membership.

The existing winner rule remains highest total value, then higher cash, then
earlier turn order. Standings use total value descending; exact totals share
competition rank (`1,1,3`) and retain turn order only for stable display. Thus a
cash tie-break may mark the second row within a shared rank as winner without
misrepresenting either fact. Nickname never selects or orders a player.

The calculation is frozen into the existing `game:{gameId}.terminalResult` JSON
by the same CAS that writes `status=ended`, winner, and the incremented
`stateVersion`. Repeated recovery snapshots project that frozen result and add
MariaDB player nicknames. The additive stored JSON remains compatible with the
brief terminal-retention window from pre-FE-REVAMP-019 instances by recomputing
missing value fields on the server. No Redis key/hash field, MariaDB migration,
REST endpoint, STOMP payload, timer, polling, board asset, scene, dice, or game
rule changes were introduced.

The frontend decoder requires null before completion and a complete consistent
result after completion. It rejects winner contradictions, duplicate IDs,
non-numeric values, arithmetic mismatches, malformed ranks/order, and participant
or nickname contradictions. Terminal cash deliberately comes from the frozen
result rather than a shared player hash that a later game may reuse. The
presentation model only formats supplied cash, property value, total, and rank
through the Greek content boundary.
`Board.jsx` passes this model as React Router state to the legacy EndGame screen;
the incomplete client price map, property summation, winner lookup, and result
query parameters are gone. Direct navigation or reload at `/endgame` cannot
reconstruct the game identity under the current route contract, so it displays
a safe unavailable-result message rather than estimating or persisting a value.

## 34. FE-REVAMP-020 presentation coordinator

The framework-independent `PresentationCoordinator` boundary now accepts only
normalized, immutable, already-confirmed presentation transactions. It is a
transient visual sequencer, not a second game state machine. It contains no
snapshot, command, action eligibility, expected version, transport, persistence,
timer-deadline, winner or economic authority. The authoritative controller will
remain responsible for deciding which decoded backend facts are accepted when
FE-REVAMP-021 mounts this boundary.

The pre-integration sequencing inventory remains intentionally visible:

| Current owner | Classification | Retained behavior |
| --- | --- | --- |
| backend snapshot/command/event payloads | authoritative state | Dice, destination, outcome, active player and completion truth |
| `useGameRealtime`, `handleTick`, `throwDiceAction` | transport/controller plus legacy mixing | Snapshot/event acceptance, REST command calls and recovery reads |
| fixed one-second roll delay, direct response/STOMP dice calls, modal timing and end navigation in `Board.jsx` | legacy presentation coordination | Remains live until the one-owner FE-REVAMP-021 migration |
| `BoardSceneAdapter` | Three.js execution | Renderer/assets, deterministic dice, current pawn placement, camera and disposal |
| `TurnResultModal` and observer queue/toast | DOM presentation | Active result/choice feedback and bounded observer notifications |
| `eventHistory` | separate session presentation history | Never serves as an animation replay queue |

A transaction is `{presentationId,stateVersion,actorPlayerId,dice,movement,
outcome}`. `presentationId` is an explicit, bounded string supplied by the
caller; event flows should use `eventId`, while command-response and matching
STOMP-echo models must derive the same source-independent transition identity.
The numeric `stateVersion` orders authoritative transitions and remains the
monotonic Dice scene identity, but it is not the transaction identity because
distinct grouped presentation facts may legitimately share one version. Dice
are copied only when the pair and supplied total agree. Outcome is bounded
preformatted text plus kind, emphasis and a local `dismissible` flag; it has no
command callback. Inputs are copied/frozen and malformed or empty transactions
fail closed.

Movement mode is explicit. `FORWARD` alone may call `buildForwardRoute` with
confirmed `from`/`to`; an equal position produces no movement stage. `DIRECT`
passes only the confirmed endpoints with no fabricated intermediate route.
`SNAP` passes one confirmed final position directly. No mode is inferred from
dice, destination square, card text, jail state or snapshot history. The
coordinator defines narrow injected `presentPawnMovement` and
`snapPawnPosition` scene ports but does not add the final pawn tween or mount
those ports in production. Recovery accepts an authoritative `stateVersion` and
at most four explicit unique-player snaps, advances the stale-presentation
watermark, and reconstructs no dice, route, card, outcome or history entry.

The phase model is deliberately limited to `IDLE`, `PRESENTING_DICE`,
`PRESENTING_MOVEMENT`, `PRESENTING_OUTCOME` and `RECOVERING`. A transaction
plans only its present stages in that order. The DOM outcome port may resolve
after local dismissal, but dismissal never submits a command, advances a turn
or changes an optional action. Purchase, decline, jail payment and roll remain
authoritative intents outside the coordinator. Supplied card text is opaque
presentation content and is never parsed for mechanics.

There is one active transaction and at most one queued transaction. A distinct
same-version identity replaces the queued entry, preserving the active item and
the newest pending fact without an unbounded backlog. A newer version immediately
supersedes active and queued older work. Duplicate IDs and older versions are
ignored. A bounded 64-entry dedup window, hard-capped at 256 even when configured,
prevents session memory growth. Generation checks ensure late Dice, movement or
outcome promises cannot resume a canceled, recovered, superseded or disposed
sequence.

`BoardSceneAdapter` retains its boolean `presentDiceRoll` compatibility API and
adds `presentDiceRollAndWait` plus `cancelDicePresentation`. The completion
promise resolves true only when that exact accepted roll settles, and false for
rejection, supersession, explicit cancellation, Dice-load failure or disposal.
Reduced motion applies the confirmed final faces immediately, resolves the same
stage, and needs only the existing coalesced render. The adapter still owns RAF;
the coordinator creates no timer or render loop. Existing one-load/two-clone,
one-canvas, zero-idle-RAF, late-GLTF and idempotent-disposal guarantees remain.

Scene and DOM failures resolve as bounded `FAILED` results, notify an injected
diagnostic port, return to idle and never retry a game command. `cancel()`,
recovery, supersession and idempotent `dispose()` settle accepted coordinator
promises without rejecting into React. Outcome cleanup is an explicit local
port. After disposal, no phase, outcome or diagnostic callback can fire.

Production integration is intentionally deferred: `Board.jsx` imports neither
new module and retains its existing fixed-delay dice/movement/modal and observer
queue behavior. This avoids running old and new sequencers together. FE-REVAMP-021
must create one coordinator per mounted game controller, build transaction
identity consistently across REST responses and STOMP echoes, implement the
bounded scene movement ports, cancel on recovery/completion, and replace each
legacy sequencing owner one for one. There are no REST, STOMP, Redis, MariaDB,
board metadata, asset, camera, background, package or visible behavior changes
in FE-REVAMP-020.

## 35. FE-REVAMP-021 first production two-player slice

The `/Game` route now enables the first production strangler slice through
`FIRST_VERTICAL_SLICE_ENABLED`. The enabled branch mounts `AuthoritativeGame`;
the old `Board` remains compiled only as a local rollback branch and is never
mounted at the same time. The live authority chain is:

`authenticated session → AuthoritativeGameRuntime → decoded snapshot/STOMP
wake-up → gameControllerReducer → ownership/metadata/GameViewModel → GameShell
HUD → PresentationCoordinator → BoardSceneAdapter`.

The query-string player ID remains only route compatibility data. The live
viewer identity comes from `AuthContext.currentPlayer.id`, and backend session
membership still authorizes every snapshot and command.

### Production ownership map

| Responsibility | Pre-021 live owner | Enabled 021 owner | Migrated / legacy state | Deferred boundary |
| --- | --- | --- | --- | --- |
| accepted snapshot/version | `Board.jsx` plus `useGameRealtime` | one `AuthoritativeGameRuntime` reducer state | migrated; legacy owner unmounted | none |
| STOMP subscription and wake-up | `useGameRealtime` | one `gameRealtimeClient` | migrated; subscribes before first read | multi-instance broker hardening remains platform work |
| fallback polling/coalescing | `Board.jsx` interval plus realtime helper | one 15-second disconnected-only poller plus `createSnapshotSynchronizer` | migrated; Board poller unmounted | none |
| roll/purchase/decline/jail intents | Board handlers using `gameCommandState` | runtime callbacks from `ActionTray` | migrated for the slice; legacy handlers unmounted | full mechanics matrix in FE-REVAMP-022 |
| command UUID/expected version | module maps and Board helpers | runtime UUID plus reducer accepted version | migrated commands bypass legacy maps | maps remain for lobby/rollback consumers |
| turn/player/action HUD | Board-local JSX and controls | `MatchStatusHeader`, `PlayerRail`, `ActionTray` in `GameShell` slots | migrated; no duplicate live control | visual/a11y polish in FE-REVAMP-023 |
| board metadata | `Board.jsx#gamePositions` | one `BoardAPI.getMetadata` load and immutable index | migrated for live presentation; no fallback catalog | legacy catalog remains rollback-only until FE-REVAMP-028 |
| dice/movement/outcome ordering | Board response/event calls and fixed delay | one `PresentationCoordinator` | migrated; old sequencer unmounted | final pawn tween/camera choreography in FE-REVAMP-025 |
| Three.js lifecycle | Board-owned adapter instance | `GameBoard` owns one adapter | migrated live mount; one canvas and bounded cleanup | final assets/polish in FE-REVAMP-025 |
| observer queue | Board observer queue | coordinator outcome port plus session event history | migrated live path; history is not rendered | history UI only if a later backlog explicitly requires it |
| completion/deadline facts | legacy Board navigation/presentation | accepted snapshot `GameViewModel` | completion navigation retained; deadline carried only | countdown and completion styling remain later work |

### Controller and realtime lifecycle

One framework-independent runtime exists per mounted `(gameId, viewerId,
scene)` tuple. It starts metadata loading once, activates one authenticated
STOMP client, installs one bounded poller and creates one coordinator. The
STOMP client subscribes to `/topic/game/{gameId}` before invoking the initial
authoritative snapshot read, preserving the no-gap ordering. Validated events
provide presentation/history facts and wake the snapshot synchronizer; they
never replace accepted game state.

All snapshots enter `gameControllerReducer`. Newer versions are accepted,
equal versions retain the existing idempotent/recovery semantics, older or
wrong-game values cannot replace state. Event bursts coalesce while a read is
in flight and request one follow-up when necessary. Polling runs every 15
seconds only while connection state is not `CONNECTED` or `RECOVERED`; metadata
is never polled or refetched by STOMP.

For a command, the runtime synchronously enters `PENDING`, creates one UUID and
copies `X-Sindopoly-Expected-Version` from the reducer's accepted version.
Rapid duplicate activation cannot create another command. Success is only a
reconciliation target until a snapshot accepts it. `STALE_STATE` and ambiguous
`NETWORK`, `SERVER`, `INVALID_PAYLOAD` or `UNKNOWN` outcomes are never retried;
actions remain blocked until authoritative reconciliation. Authentication,
membership and not-found failures remain bounded normalized facts and raw
backend errors are not rendered.

The response and matching STOMP echo share the deterministic identity
`roll:{gameId}:{stateVersion}:{actorPlayerId}:{die1}:{die2}`. No arrival time,
object identity, nickname or frontend randomness participates. The coordinator
therefore presents one confirmed pair once for both active and observer flows.
Current contracts provide confirmed endpoints but not an authoritative
movement classification, so this slice uses explicit `DIRECT` movement to the
confirmed destination; it does not infer a dice route. The adapter snaps
initial/recovery positions to calibrated anchors, focuses the confirmed square
and leaves final tweening out of scope.

The session-local event-history state is now owned by the runtime (100 entries,
256 event-ID dedup, no persistence). A reducer-proven version gap inserts one
marker; snapshots fabricate no history. History is intentionally unmounted.

### Live UI, metadata and compatibility

`GameShell` mounts the extracted status, player and action regions. Player and
turn rendering consumes only `GameViewModel`; HUD components import no API,
STOMP, reducer or Three.js code. Optional purchase/decline and jail choices are
shown only when the accepted snapshot grants that exact viewer/state option.
The coordinator's outcome is informational and dismissal submits no command.

Canonical board metadata is fetched once per runtime through the existing
authenticated endpoint and strict decoder. Failure leaves the 3D board and
authoritative game usable, exposes only a generic Greek unavailable panel and
does not restore the legacy catalog as live authority. The scene adapter now
sizes its canvas from the shell board container and observes container changes;
this prevents a full-window canvas from overflowing after HUD regions mount.
The observer is disconnected with the existing window listeners, RAF and GLB
resources. There is still no idle render loop.

Terminal results continue through the authoritative completion model and
existing `/endgame` route state. The accepted deadline remains available to the
model, but this slice creates no countdown or frontend timeout authority. The
existing board/Dice GLBs, calibrated dice faces, camera primitives, background
and audio ownership are unchanged.

### Verification evidence and rollback

Automated orchestration coverage includes subscribe-before-read, initial and
late snapshot acceptance, event races/coalescing, stale and ambiguous failures,
rapid duplicate activation, response/STOMP deduplication, purchase/decline,
two isolated clients, observer-only presentation, recovery snapping, polling,
metadata-once, deadline/completion pass-through, disposal and source-layer
contracts. The frontend suite has 554 passing tests after the container-resize
case was added.

The authenticated manual smoke used two cookie-isolated production bundles
(`localhost` host and `127.0.0.1` guest) against one backend/Redis game. It
verified lobby create/join/start, active-only roll, observer-only waiting,
confirmed total `6`, one outcome per client, a host-only 100€ purchase choice,
decline, handoff to one guest roll control, matching calibrated destination,
reload recovery and Home→Continue remount. Each context retained one canvas and
the clean run emitted no console warning/error. Application-level network
observations were approximately one metadata plus one initial snapshot read per
mount, one STOMP subscription per context, one mutation per activation and a
bounded reconciliation read; no metadata refetch or request storm appeared.

Responsive runtime checks recorded zero horizontal overflow at 1920×1080,
1366×768, 768×1024 and 390×844. The board/background remained visible, each
viewport kept one canvas, desktop used the fixed rail, tablet/phone used the
scrollable rail and the action tray remained vertically reachable. Detailed
responsive/accessibility refinement remains FE-REVAMP-023.

The production build contains 3022 modules, 1,670.78 kB JS raw / 500.72 kB
gzip and 26.72 kB CSS raw / 5.97 kB gzip. Against the FE-REVAMP-001 baseline
this is +18 modules, +32.64/+8.25 kB JS raw/gzip and +5.50/+0.87 kB CSS
raw/gzip. No package, backend source, REST/STOMP contract, Redis family/TTL,
MariaDB schema, asset or background change belongs to FE-REVAMP-021.

Rollback is one local route switch to the still-compiled legacy Board. It must
never enable both paths together. FE-REVAMP-022 is the next boundary: prove the
full supported mechanics matrix before any legacy deletion.

## 36. FE-REVAMP-022 supported-mechanics parity proof

FE-REVAMP-022 keeps the legacy `Board` rollback path compiled and unmounted. It
does not add a mechanic, transport contract, persistence surface or second
controller. The proof combines backend rule/infrastructure tests, decoded
frontend fixtures, the mounted `AuthoritativeGameRuntime` orchestration suite,
scene lifecycle tests and a canonical Docker smoke. A bounded parity defect was
found and fixed: REST `squareType=4` represents both an actual Start landing and
an ordinary property landing with no transaction. The new path had displayed
every such result as a Start reward. Canonical board metadata now distinguishes
the Start square; other type-four results display only the confirmed landing.
When `passedGo=true` on a different landing, the UI adds generic Start-passage
copy but does not invent a reward amount or replace the landing outcome.

### Supported-mechanics inventory

| Classification | Inventory and evidence |
| --- | --- |
| A — migrated and proven in FE-REVAMP-021 | two-player create/join/start, normal roll, exact dice pair, direct pawn destination, purchase offer/decline, turn handoff, snapshot reconciliation, reload/Continue, one renderer/HUD/controller |
| B — migrated and deterministically proven here | Start passage/exact landing; owned/unaffordable property landing; purchase; standard/train/utility rent; tax; money-gain/loss and transport cards; normal jail visit and Go To Jail; jail pay/decline/release flow; timeout; in-progress leave/removal; terminal result; replay; stale and ambiguous failures; reconnect/polling; three/four-player order, ownership and pawn facts |
| C — backend implementation not yet proven on the new path | none found after the automated matrix; the manual browser subset is intentionally representative rather than random-mechanic exhaustive |
| D — legacy-only presentation | legacy modal styling, fixed delays, toast ordering and pixel layout remain rollback-only presentation choices, not game semantics |
| E — not supported | bankruptcy transitions, doubles/extra-turn rules, auctions, mortgages and spectator mode. `bankrupt` is projected but no production transition sets it; doubles explicitly rotate normally. These are not product features and were not invented for parity. |

### Authoritative parity matrix

`REST` below means the existing throw/action/pass result; `event` means the
existing `/topic/game/{gameId}` envelope/details; `snapshot` remains recovery
truth. “Automated” cites the most direct evidence while the full backend and
frontend suites exercise the surrounding decoder/security/lifecycle contracts.

| Mechanic | Backend trigger | REST result | STOMP detail | Snapshot change | Active presentation | Observer presentation | Scene | ActionTray | Recovery/reload | Automated evidence | Canonical smoke / legacy comparison | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Normal roll / handoff | active `throw` | pair, total, destination, version | `DICE_ROLLED`, `PLAYER_MOVED`, `TURN_CHANGED` | position/turn/deadline | one confirmed pair/outcome | same pair and destination | one DIRECT move, bounded Dice | one roll owner then waiting | snapshot snaps; no historical replay | runtime roll/two-client/dedup; integration critical flow | live host roll and API-client roll matched; legacy final facts equal | PASS |
| Pass or land on Start | movement crosses/lands 0 | `passedGo`; actual Start result carries reward | `MONEY_RECEIVED` plus movement/landing | server balance/position | generic passage plus landing, or exact server reward on Start | exact event amount | confirmed destination only | server-selected next action | snapshot balance/position | gameplay rule + real Redis tests; runtime Start/type-four regressions | deterministic automation; fixes false legacy-style Start copy | PASS |
| Property landing/no transaction | own or unaffordable property | type 4, `data=-1` | landing/turn details | position, no transfer | named landing, no fabricated reward | named landing/turn | destination | next server action only | snapshot unchanged ownership | gameplay rule; runtime type-four test | bounded defect reproduced/fixed; legacy semantics retained | PASS |
| Purchase offer | affordable unowned property | type 5, authoritative price | `PROPERTY_AVAILABLE` | exact optional action/version | named property/price and two controls | same offer, no controls | destination | purchase + decline only for option owner | option restored by snapshot | gameplay rules; presentation/runtime tests | live 120€ host and 100€/160€ guest offers | PASS |
| Purchase | resolve `yes` | balance/properties/next/version | `PROPERTY_PURCHASED`, turn change | owner/balance/turn | pending then snapshot facts | same owner/balance/turn | no rule work | disabled pending then next action | snapshot owns result | gameplay rule + integration; runtime option tests | live guest 100€ purchase, 1,300→1,200 and 0→1 property | PASS |
| Purchase decline | pass/resolve `no` | empty acquired list/next/version | `PROPERTY_DECLINED`, turn change | clears option; no ownership | decline fact then handoff | same fact | no rule work | one decline owner | no stale option after reload | gameplay rule + replay integration; runtime tests | live host and guest decline; no transfer | PASS |
| Standard/train/utility rent | land on another owner | authoritative charge | `RENT_PAID` with counterparty/amount | atomic payer/owner balances | supplied amount/counterparty | same supplied facts | destination | no calculation/action | snapshot restores balances | gameplay rule and real Redis integration cover rent variants; event/runtime outcome tests | automated deterministic; legacy and new consume server outcome | PASS |
| Tax/expense | land tax | authoritative amount | `TAX_PAID` | balance/turn | named square/amount | same amount | destination | no calculation/action | snapshot balance | gameplay rule/real Redis; runtime square-result test | live both players paid 200€, DOM and balances matched | PASS |
| Money-gain card | draw money card | opaque card + positive amount | `CARD_DRAWN` | balance/deck/turn | server text and signed amount | same text/amount | destination | automatic | snapshot does not replay card | gameplay card/cycle tests; runtime/event model tests | deterministic automation; no client rule | PASS |
| Money-loss card | draw money card | opaque card + negative amount | `CARD_DRAWN` | balance/deck/turn | server text and signed amount | same text/amount | destination | automatic | snapshot balance | gameplay card/cycle tests; runtime/event model tests | live `$15` thematic card, 1,300→1,285 | PASS |
| Movement card | draw transport card | server destination/card | card + authoritative movement | position, possible Start reward | opaque text + confirmed destination | same | DIRECT, never inferred from text | automatic | direct snapshot snap | gameplay transport/Start test; runtime movement-card test | deterministic automation; legacy/new end position equal | PASS |
| Jail entry/visit | Go To Jail or normal Jail | types 7/8, position | `PLAYER_JAILED` or landing | position/jailed/turns | jail/visit fact | same | direct confirmed destination | server option only | snapshot jailed flags | gameplay jail test; runtime square-result/presentation tests | deterministic automation | PASS |
| Jail pay/decline/release | jailed active roll creates option; action/pass resolves | authoritative cost/balance/next/version | exit available/released/turn change | option, jailed flags, balance, turns | exact server cost; pay keeps roll, decline follows server turn | same facts, no controls | snapshot position | exact option owner/version only | snapshot restores option/release | gameplay jail suite + jail-timeout integration; runtime pay/decline test | deterministic automation; no hard-coded fee remains in new content | PASS |
| Timeout/AFK | server deadline task | no frontend mutation response | `TURN_TIMED_OUT`, turn change | turn/deadline/AFK facts | text fact, commands wake from snapshot | same | recovery snap only | frontend sends no timeout | event wakes coalesced read | timing/race integration; runtime timeout test | live timeout handoff and DOM fact observed | PASS |
| Player leave/removal | member leave/kick | removed player/version | membership notification | membership/order/turn, possible completion | remaining view updates | removed client loses membership on recovery | remaining pawns snap | removed viewer has none | fresh membership required | in-progress departure integration; runtime removed/remaining views | live guest removal left one player card and one canvas | PASS |
| Completion | max time/money lifecycle | existing terminal result | `GAME_COMPLETED` | ended/winner/frozen standings | commands disabled; navigate `/endgame` | same result | coordinator cancels | none | terminal snapshot is truth | lifecycle/completion/integration + terminal runtime/model tests | deterministic automation; no legacy `priceMap` | PASS |
| Replay/idempotency | same command ID/fingerprint | exact result, `replayed=true` | no second event | one version transition | response/echo one identity | one presentation | one Dice/move | no second intent | snapshot unchanged by replay | duplicate/concurrent integration; replayed runtime dedup test | live pair 6+2, v12 returned twice; second replay true, snapshot stayed v12 | PASS |
| Stale version | current actor sends old expected version | `409 STALE_STATE` | no mutation event | unchanged | blocks/reconciles, no retry | unchanged | no animation | disabled until fresh snapshot | mandatory refresh | stale integration + reducer/runtime tests | live guest 409; version stayed 11 and turn stayed guest | PASS |
| Ambiguous failure | NETWORK/SERVER/INVALID_PAYLOAD | unknown outcome | possibly missed | unknown until read | blocked, safe message | snapshot-derived only | canceled/recovered | no retry | one reconciliation required | runtime table + reducer tests | fault injection only; containers were not sabotaged | PASS |
| Reconnect | STOMP disconnect/resubscribe | none | later notifications only | recovery snapshot | reconnect text, blocked commands | same | cancel then snap; no old Dice | disabled while unsafe | subscribe-before-read, one recovery read | realtime sync/reducer/runtime reconnect tests; integration STOMP recovery | reload/remount combined with canonical observer events | PASS |
| Polling fallback | disconnected/degraded runtime | snapshot GET only | none required | accepted snapshot | connection text | same | recovery snap | blocked while unsafe | one 15s poller, stopped logically while connected/disposed | runtime polling test | source/runtime evidence; no live 15s network counter available | PASS |
| Reload / Continue | reload or Home→Continue | current-game + snapshot | new subscription | current server state | no old outcome/history replay | current facts | one canvas/direct snap | one owner | session history restarts on remount | event-history, runtime disposal and scene remount tests | live reload plus five cycles: home 0 canvas, game 1 canvas | PASS |
| Three/four players | normal 2–4 member snapshots | unchanged contracts | same event family | ordered players/turn/ownership | exact active action | other players waiting | stable numeric-ID slots 0–3 | one active owner | full snapshot | runtime 3/4 test + calibration/scene tests | automated only; full manual four-player game not required | PASS |

### Rule, ownership, security and performance audit

The enabled route still mounts exactly one `AuthoritativeGameRuntime`, STOMP
client, snapshot synchronizer, command port, metadata load, session history,
`PresentationCoordinator` and `BoardSceneAdapter`. `Board.jsx`,
`useGameRealtime` and the legacy command maps remain compiled but unmounted.
Searches of the new path found no rent/tax/affordability/jail-fee/winner/final-
capital/doubles/move-distance/expected-version increment authority. Dice-pair
addition is payload validation, board price/rent fields are display metadata and
the completion model formats supplied standings. The unused copied 50€ jail
label was removed; live jail labels use the option's authoritative `cost`.

Security boundaries are unchanged: session identity and membership remain
server-derived; active player, phase, option owner/version and replay/stale
rules remain server validated; raw failures are normalized; card text is opaque
and never parsed for behavior. The browser smoke used a dedicated public game
and synthetic local players. No production cheat endpoint or Redis/MariaDB
mutation outside supported application commands was added.

The production bundle remains 3022 modules. It is 1,671.00 kB raw / 500.78 kB
gzip JS and 26.72 kB raw / 5.97 kB gzip CSS: +0.22/+0.06 kB JS and no CSS
change from FE-REVAMP-021. Scene tests retain one renderer/canvas, one Dice GLB
load/two clones, bounded animation RAF, zero idle RAF, listener/observer cleanup,
late callback safety and idempotent disposal. The canonical browser finished
with one canvas, one remaining player card, zero horizontal overflow at its
808×856 effective viewport, one background image and no console warning/error.

The browser resource-timing surface exposed no fetch/WebSocket entries, so this
run cannot claim exact live request counts. Source/orchestration tests still
prove metadata-once, one mutation per activation, coalesced snapshot reads, one
fallback poller and disposal; the FE-REVAMP-021 measured baseline remains one
metadata + initial snapshot + subscription per mount with bounded mutation
reconciliation. No request storm was visible during the live sequence.

### Canonical Docker acceptance and deletion decision

Docker Desktop 29.7.2 / Compose 5.5.0 was healthy. The `sindopoly-play` stack
used MariaDB 10.11, Redis 7, the Java 17 runtime backend and the production
nginx frontend; `sindopoly.ps1 doctor` passed after rebuild. Flyway V1/V2 and
canonical square/card data were present. Java 21 compiled release-17 bytecode;
138 fast and 48 Testcontainers integration tests passed. The frontend suite,
build, changed-file lint and diff check passed: 561 tests, zero failures. Full
repository lint remains exactly the accepted 20-error/4-warning legacy baseline;
none of the findings is in a changed file.

The live smoke used one authenticated in-app browser plus a second independently
cookie-isolated authenticated HTTP client because this Codex host exposes only
one browser cookie jar. A second `127.0.0.1` browser tab could create identity
but could not retain the third-party `localhost:8080` session cookie. The pair
still proved realtime observer convergence for rolls, tax, card loss, purchase,
decline, timeout, replay/stale handling and removal. Likewise, the advertised
viewport override did not change the in-app browser's effective 808×856 size;
the exact 1920×1080, 1366×768, 768×1024 and 390×844 checks therefore retain the
unchanged FE-REVAMP-021 evidence rather than being falsely reported as rerun.
No CSS changed and the current effective viewport had zero horizontal overflow,
but that is not a substitute for the required exact breakpoint rerun.

A bounded acceptance rerun on 2026-09-18 found the same runner limitations. The
browser inventory exposed only one shared-cookie in-app browser; attempts to
create controlled Chrome and Edge profiles both returned `Browser is not
available`. Two in-app tabs therefore cannot supply the required independent
HOST/GUEST authentication proof, and no HTTP client was substituted. The
responsive surface exposed no viewport-control capability: its measured CSS
viewport was 808×856 and `window.resizeTo` was unavailable. Consequently none
of the requested sizes could be selected or measured on the production Game
route:

| Requested CSS viewport | Actual `innerWidth` × `innerHeight` | `clientWidth` / `scrollWidth` | Horizontal overflow | Canvas / board | Header / rail / actions / background | Clipping | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1920×1080 | 808×856; request could not be applied | 808 / 808 on the available surface | no on available non-Game surface | not measurable at requested size | not measurable at requested size | not measurable | DEFERRED — dimensions do not match |
| 1366×768 | 808×856; request could not be applied | 808 / 808 on the available surface | no on available non-Game surface | not measurable at requested size | not measurable at requested size | not measurable | DEFERRED — dimensions do not match |
| 768×1024 | 808×856; request could not be applied | 808 / 808 on the available surface | no on available non-Game surface | not measurable at requested size | not measurable at requested size | not measurable | DEFERRED — dimensions do not match |
| 390×844 | 808×856; request could not be applied | 808 / 808 on the available surface | no on available non-Game surface | not measurable at requested size | not measurable at requested size | not measurable | DEFERRED — dimensions do not match |

The user-provided manual rerun reported no console errors, correct pawn/state
recovery and no old dice animation after refresh. The prior transient outcome
message also disappeared. That is intentional under the current contract:
snapshot recovery restores current authoritative truth, while event history is
session-local and the backend provides no durable event replay. The frontend
must not fabricate an already-consumed narrative from the snapshot. The user's
description of the responsive layout as funky/clunky is currently classified
as aesthetic evidence only; this runner could not establish or disprove a
functional B/C/D/E regression at the four required exact viewports.

The final bounded acceptance run on 2026-09-19 used installed Microsoft Edge
`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`, not the Codex
in-app browser. Two headless Edge processes used distinct, freshly created
temporary `--user-data-dir` profiles and separate CDP ports. Both profiles had
a `JSESSIONID`, the cookie values differed (values were not logged), and the UI
authenticated host `Alpha0919` and guest `Beta0919` as different server player
IDs. The host created a public game, the guest joined, and the host started it;
both browsers entered the same production Game route with one canvas each and
only the active player having actionable controls. In game 30, both browser
sessions read identical authoritative snapshots at versions 2, 3 and 4. A host
roll of 8 moved the host to position 8 and offered the same 100€ property to
both viewers; only the host could decline. After the host declined through the
UI, both browsers showed version 4, guest turn, unchanged 1,500€ balances and
no transferred ownership. Both displayed one confirmed dice/outcome message.
The guest reload restored current position, money and turn with one canvas,
while old dice/movement and transient outcome copy did not replay, as required
by session-local history semantics. A separate run explicitly compared the
distinct cookie values and authenticated identities; its roll also converged
across both browsers. Temporary Edge processes/profiles were removed after
verification; synthetic canonical-stack test games were left untouched.

CDP `Emulation.setDeviceMetricsOverride` applied each required CSS viewport to
the active player's production Game route. Measurements were taken at page top;
the active Roll button was then scrolled into view and passed viewport and DOM
hit tests. A narrower `clientWidth` at three sizes is the vertical scrollbar,
not horizontal page overflow.

| Requested and actual `innerWidth` × `innerHeight` | `clientWidth` / `scrollWidth` | Canvas rect width × height | Page `scrollHeight` | Functional result |
| --- | --- | --- | --- | --- |
| 1920×1080 / 1920×1080 | 1920 / 1920 | 1640×904 | 1080 | PASS |
| 1366×768 / 1366×768 | 1351 / 1351 | 1099×904 | 1080 | PASS; vertical scroll reaches action |
| 768×1024 / 768×1024 | 753 / 753 | 729×904 | 1278 | PASS; vertical scroll reaches action |
| 390×844 / 390×844 | 375 / 375 | 359×904 | 1282 | PASS; vertical scroll reaches action |

At every size there was one visible canvas, readable status text, an available
player rail, visible background, no page-level horizontal overflow, no
canvas/action overlap, and an enabled Roll control reachable by normal scrolling
with a successful center-point hit test. The phone rail has bounded internal
horizontal scrolling (`scrollWidth` 368 versus `clientWidth` 341), rather than
page overflow. The phone/tablet board is tall and the layout remains visually
dense: classify the user's “funky/clunky” observation as aesthetic (A), not a
functional B/C/D/E failure. No responsive CSS or product source was changed.
Both browsers emitted one expected 401 resource-log entry while anonymously
probing `/api/session/me` before login; no console or WebGL errors appeared
after authentication or during gameplay/viewport verification.

**FE-REVAMP-022 ACCEPTED — READY FOR LEGACY DELETION IN A LATER MILESTONE.**
Both previously missing acceptance gates now have measured canonical-stack
browser evidence. This milestone does not remove the still-buildable, unmounted
legacy rollback path. Redis, REST, STOMP, MariaDB and assets remain unchanged.

Redis impact is none: no key family, type, field, TTL, serializer, Pub/Sub or
atomicity change. REST and STOMP impacts are none: existing endpoints, payloads,
`/topic/game/{gameId}` and authorization remain unchanged. MariaDB impact is
none: no schema or migration. Background, board, Dice, pawn, camera, lighting,
material and audio assets are unchanged.

## 37. FE-REVAMP-023 responsive and accessibility pass

FE-REVAMP-023 implements the committed M10 scope, not legacy deletion. The
authoritative route and the unmounted local `Board` rollback remain intact;
reviewed legacy removal belongs to FE-REVAMP-028. No gameplay rule, board
metadata, scene/asset, backend or transport behavior changed.

The live route now has one persistent polite status region for accepted turn
and connection transitions. It does not announce the initial snapshot or
repeat unchanged snapshots, and observer outcomes retain their existing
separate non-blocking status toast. The action region preserves keyboard focus
when a pending command or confirmed transition removes the focused button; the
next enabled action remains reachable by Tab. Native buttons still own Enter and
Space activation. The rail's scroll-container focus and the action fallback
show a tokenized focus ring. The narrowest reflow keeps player cards and the
observer toast inside their containers. Reduced-motion presentation remains
owned by the existing coordinator and was not changed here.

Verification: 565 frontend tests pass, the production bundle builds, and
changed-file ESLint and `git diff --check` pass. Repository-wide lint remains
at its pre-existing 20 errors / 4 warnings in unrelated legacy/secondary
files. In a live two-player game (host `FE23_UI_02`, guest `FE23_UI_04`), keyboard
Enter rolled and declined a server-offered purchase. Focus moved to the action
region rather than the document body, Tab reached the next enabled control,
and the handoff appeared once in the polite live region. The route retained one
canvas and no new console/WebGL error occurred in the authenticated game. A
failed cross-site `127.0.0.1` preview attempt emitted auth errors before the
same-site `localhost` production-preview run; it is not game evidence.

Rendered width checks at 390×844 and 200%-equivalent CSS viewports of 960×540
(1920×1080 source) and 683×384 (1366×768 source) showed no page-level
horizontal overflow and a scroll-reachable action region. The narrowest browser
override clamps at 240 CSS pixels, where the action remained contained. These
are reflow baselines, not a native browser-zoom or assistive-technology audit;
that residual verification gap remains before the final hardening gate.

The build transforms 3024 modules and emits 1,672.41 kB JS raw / 501.19 kB
gzip and 27.55 kB CSS raw / 6.11 kB gzip, versus the accepted FE-REVAMP-022
baseline of 3022 modules, about 1,670.96/500.75 kB JS and 26.72/5.97 kB CSS.
This small increase is attributable to the two focused accessibility
components and CSS. Redis, REST, STOMP and MariaDB effects are none; no
compatibility or migration action is required. FE-REVAMP-024 is the next
committed boundary and is not part of this change.

## 38. FE-REVAMP-024 Playwright harness

FE-REVAMP-024 adds a test-only Playwright configuration at
`sindopoly-front/playwright.config.js` and a Chromium spec under `e2e/`. The
spec creates two deterministic, Greek-safe player identities through the
existing authenticated APIs, creates and joins a disposable public game,
starts it with authoritative expected-version headers, and transfers each
isolated API session into its own `BrowserContext` via `storageState`.

The browser flow asserts one canvas per context, an authoritative active-player
roll control only for the active player, keyboard Enter activation, convergence
of both HUD headers after the roll, optional server-owned purchase decline,
reload recovery, and no captured console/page errors. Context traces capture
screenshots and DOM snapshots; failures attach console errors and Playwright
retains trace/video/screenshot artifacts. The `test:e2e` npm script runs the
Chromium project and accepts `SINDOPOLY_FRONTEND_URL` and
`SINDOPOLY_BACKEND_URL` overrides. The harness owns no gameplay logic and does
not mutate Redis, REST, STOMP or MariaDB contracts.

Automated unit coverage remains green at 565 tests; harness/config syntax and
changed-file ESLint pass. Chromium 133 was installed locally, but the
Playwright runner did not return a test result in this Windows sandbox (the
process remained alive without reporter output), so no E2E pass is claimed
here. The canonical Docker stack remained healthy and the FE23 authenticated
browser evidence is unchanged. Running `npm run test:e2e` on a normal Playwright
host is the remaining runtime acceptance step. The production bundle and
runtime source are unchanged apart from the test dependency/configuration.

Redis, REST, STOMP, MariaDB, board metadata, 3D assets, background, route
ownership, keyboard behavior and FE23 accessibility semantics are unchanged.
The next boundary is FE-REVAMP-025; it is not included here.

## 39. FE-REVAMP-025 pawn/dice asset pipeline and polish

FE-REVAMP-025 adds a checked-in asset manifest at
`sindopoly-front/assets/asset-manifest.json` and the dependency-free
`npm run assets:validate` validator. It validates the GLB 2.0 header, declared
binary length, JSON chunk, mesh presence, provenance field, file-size budget
and indexed-triangle budget for the board, Dice and four existing pawn models.
The manifest records the current repository asset provenance limitation
(source/license confirmation is still required before redistribution), explicit
size/triangle ceilings and the 16.67ms frame budget.

The live `BoardSceneAdapter` remains the sole renderer owner and is not replaced
with a second scene path. Existing calibrated Dice presentation, primitive pawn
fallbacks, one-frame invalidation, pixel-ratio cap and disposal behavior remain
unchanged; no gameplay, authority, movement, camera, background or asset URL
contract changes were made. The new focused tests execute the validator and
assert the adapter's bounded 760ms Dice animation, pixel-ratio cap and coalesced
frame guard. This keeps FE25 a measurable pipeline/budget boundary while
deferring unverified GLB-origin transforms and final pawn choreography to a
future explicitly approved polish iteration.

Measured current assets: board 1,179,208 bytes; Dice 429,856 bytes / 11,366
triangles; Iron 37,672 / 786; Thimble 33,372 / 646; TopHat 17,956 / 284;
WheelBarrow 27,688 / 364. The board validator reports 24 indexed triangles
because its current GLB primitives use non-indexed geometry; file-size and GLB
structural checks remain authoritative. Redis, REST, STOMP and MariaDB impact
is none. FE24's Playwright runtime limitation remains documented above and is
not reworked here. The next boundary is FE-REVAMP-026; it is not included.

## 40. FE-REVAMP-026 gesture-gated audio

FE-REVAMP-026 adds one `MusicControl` owner to the authoritative GameShell
header. Ambient music is opt-in at the product surface: the control creates
the module-resolved audio asset only in response to its native button gesture,
sets the established 50% volume and loop behavior, and catches autoplay/play
failures by reverting the persisted preference to muted. It never starts audio
from mount, snapshot, STOMP, timer or navigation effects. Unmount pauses and
releases the local audio reference.

The preference is stored only as the boolean key `sindopoly.music.enabled` in
the browser's local storage. Storage failures and environments without
`globalThis.Audio` are safe no-audio equivalents: the GameShell and gameplay
controls continue to render and operate without an audio object. The legacy
Board audio owner remains unchanged as the rollback path; the authoritative
route has exactly one new audio owner. No sound result is authoritative and no
game transition waits on playback.

The focused tests cover opt-in persistence, gesture-only playback wiring,
looping, cleanup and no-Audio safety. The full frontend suite passes 569 tests;
the production build transforms 3026 modules and emits 1,673.28 kB JS raw /
501.59 kB gzip and 28.21 kB CSS raw / 6.18 kB gzip. FE25 asset validation
continues to pass unchanged. There are no Redis, REST, STOMP, MariaDB, board,
background or asset-manifest changes. FE24's Playwright runner limitation
remains unchanged and is not debugged in FE26. The next boundary is
FE-REVAMP-027; it is not included.

## 41. FE-REVAMP-027 route splitting and secondary screens

FE-REVAMP-027 adds `React.lazy` boundaries for every route and a shared Greek
`Suspense` loading status. The application shell still owns Router,
`AuthProvider` and protected-route decisions, while the Game route remains the
only boundary that loads the authoritative runtime, Three.js, GLTF loaders,
board/model URLs and game audio. Login, home, search/join, lobby, statistics
and completion are separate non-game chunks; the legacy Board and rollback
switch remain compiled and untouched.

Secondary screens now consume the shared Greek content boundary for visible
labels, validation messages, lobby state and statistics copy. This establishes
screen parity without moving transport, session, gameplay, audio or authority
logic into the content module. The route-loading fallback is polite,
localized, and does not fabricate game state.

The production build transformed 3,027 modules. The initial route graph is
split into non-game chunks (for example Login 29.95 kB raw / 16.23 kB gzip and
Home 15.24 kB / 6.03 kB); the Game chunk is isolated at 624.92 kB raw /
163.72 kB gzip. The initial entry chunks contain no `GLTFLoader`,
`BoardSceneAdapter`, GLB or audio references and request no GLB; board, Dice,
pawn and audio assets remain referenced only by the game chunk. Overall CSS is
28.21 kB raw / 6.47 kB gzip, with the existing
large-game-chunk warning retained. `assets:validate` remains green with the
FE25 16.67 ms frame budget and unchanged byte/triangle limits.

No gameplay authority, snapshot/stateVersion reconciliation, subscribe-before-
read ordering, presentation coordinator, BoardSceneAdapter, accessibility
runtime, gesture-gated audio behavior or asset provenance changed. Redis,
REST, STOMP and MariaDB impact is none. The Playwright runner remains the
FE24 IMPLEMENTED-BUT-RUNTIME-PENDING limitation and was not debugged here.
The legacy Board runtime, rollback switch and compatibility helpers remain in
place for FE-REVAMP-028; no deletion or dismantling is part of FE27.

## 42. Git, documentation and risk

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
