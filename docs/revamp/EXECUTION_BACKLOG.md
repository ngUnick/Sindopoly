# Sindopoly revamp execution backlog

## Status, freeze, and operating rules

This is the canonical execution plan for the Sindopoly revamp after approval.
It supersedes no historical evidence: `docs/audit/REVAMP_BACKLOG.md` remains
the audit-era backlog and source record.

The plan is **frozen** for controlled execution, not immutable. New evidence
may add or revise work only when the change states its reason, preserves stable
IDs, records dependency/order changes, and does not silently rewrite completed
history. `dev` is the integration branch; substantial work normally uses a
short-lived `codex/<focused-task-name>` branch from `dev`.

Status meanings: `DONE` = completed historical milestone; `READY` = at the
controlled execution frontier; `BLOCKED` = prerequisite incomplete; `DEFERRED`
= intentionally later. `N/A` in an impact field is deliberate, not omitted.

## Ordering decisions

The roadmap follows: reproducibility → verification → characterization → target
architecture and decisions → identity/authorization → authoritative transitions
→ game-flow repair → timers/events → structural cleanup → hardening and release
verification.

Two choices are especially important:

- A minimal application-command boundary and canonical state model precede
  authentication implementation. Authentication and server-side player identity
  then enter that boundary before it becomes the sole transition path. This
  avoids building security around controllers that will be discarded, without
  introducing a new insecure command route.
- Current event delivery is Spring's in-memory STOMP simple broker, not Redis
  Pub/Sub. Any future Redis Pub/Sub, Streams, or broker-relay choice requires
  an ADR; it is not assumed by this plan.

## Backlog items

### REVAMP-001 — Initial exploration retained

- Status: `DONE`; Priority: `P4`; Category: `GOVERNANCE`.
- Rationale / evidence: repository exploration established the initial technical context.
- Desired outcome: retained context is available through the audit documents.
- Dependencies: none. Blocks: none.
- Expected affected areas: documentation only.
- Production behavior change: No. Tests required: none.
- Security considerations: documented baseline only; no implementation change.
- Performance considerations: documented baseline only; no implementation change.
- Redis implications: documented baseline only; no implementation change.
- MariaDB implications: documented baseline only; no implementation change.
- REST implications: documented baseline only; no implementation change.
- WebSocket implications: documented baseline only; no implementation change.
- Compatibility/migration: none. Documentation required: complete.
- Suggested branch / commit theme: historical milestone; `docs(audit): establish initial context`.
- Recommended Codex model/reasoning: `Luna / Light` — completed documentation work.

### REVAMP-002 — Technical audit retained

- Status: `DONE`; Priority: `P4`; Category: `GOVERNANCE`.
- Rationale / evidence: `docs/audit/` records current architecture, flows, schemas, risks, and baseline commands.
- Desired outcome: a preserved evidence base rather than a replacement audit.
- Dependencies: REVAMP-001. Blocks: all evidence-based planning items.
- Expected affected areas: documentation only.
- Production behavior change: No. Tests required: none.
- Security considerations: current-state evidence recorded; no implementation change.
- Performance considerations: current-state evidence recorded; no implementation change.
- Redis implications: current-state evidence recorded; no implementation change.
- MariaDB implications: current-state evidence recorded; no implementation change.
- REST implications: current-state evidence recorded; no implementation change.
- WebSocket implications: current-state evidence recorded; no implementation change.
- Compatibility/migration: none. Documentation required: complete.
- Suggested branch / commit theme: historical milestone; `docs(audit): establish current technical baseline`.
- Recommended Codex model/reasoning: `Terra / Medium` — completed repository-level audit.

### REVAMP-003 — Engineering, commenting, and security standards retained

- Status: `DONE`; Priority: `P4`; Category: `GOVERNANCE`.
- Rationale / evidence: quality model, commenting standard, security review standard, checklist, and threat model are committed.
- Desired outcome: future work has durable quality gates.
- Dependencies: REVAMP-002. Blocks: none; governs all implementation items.
- Expected affected areas: documentation and review process.
- Production behavior change: No. Tests required: none.
- Security considerations: standards cover this area; no implementation change.
- Performance considerations: standards cover this area; no implementation change.
- Redis implications: standards cover this area; no implementation change.
- MariaDB implications: standards cover this area; no implementation change.
- REST implications: standards cover this area; no implementation change.
- WebSocket implications: standards cover this area; no implementation change.
- Compatibility/migration: none. Documentation required: complete.
- Suggested branch / commit theme: historical milestone; `docs(engineering): establish revamp standards`.
- Recommended Codex model/reasoning: `Terra / Medium` — completed cross-cutting standards work.

### REVAMP-004 — Baseline Git and governance contract

- Status: `DONE`; Priority: `P4`; Category: `GOVERNANCE`.
- Rationale / evidence: tag `baseline/pre-revamp-2026-08-19` anchors `7899c60`; root `repository instructions` is on `dev`.
- Desired outcome: preserved recovery point and a consistent operating contract.
- Dependencies: REVAMP-001. Blocks: controlled execution.
- Expected affected areas: Git metadata and root governance documentation.
- Production behavior change: No. Tests required: Git state verification only.
- Security considerations: N/A.
- Performance considerations: N/A.
- Redis implications: N/A.
- MariaDB implications: N/A.
- REST implications: N/A.
- WebSocket implications: N/A.
- Compatibility/migration: no code contract change. Documentation required: complete.
- Suggested branch / commit theme: historical milestone; `docs(governance): add Sindopoly revamp operating contract`.
- Recommended Codex model/reasoning: `Luna / Light` — mechanical Git/governance work.

### REVAMP-005 — Freeze execution backlog

- Status: `DONE`; Priority: `P3`; Category: `GOVERNANCE`.
- Rationale / evidence: the audit backlog is broad and its suggested order predates dependency normalization.
- Desired outcome: this document becomes the dependency-aware execution source of truth.
- Dependencies: REVAMP-002, REVAMP-003, REVAMP-004. Blocks: all future execution sequencing.
- Expected affected areas: `docs/revamp/EXECUTION_BACKLOG.md` only.
- Production behavior change: No. Tests required: dependency, duplicate, and ordering review.
- Security considerations: planned impacts are explicitly classified below.
- Performance considerations: planned impacts are explicitly classified below.
- Redis implications: planned impacts are explicitly classified below.
- MariaDB implications: planned impacts are explicitly classified below.
- REST implications: planned impacts are explicitly classified below.
- WebSocket implications: planned impacts are explicitly classified below.
- Compatibility/migration: none. Documentation required: this document.
- Suggested branch / commit theme: `codex/freeze-execution-backlog`; `docs(revamp): freeze dependency-aware execution backlog`.
- Recommended Codex model/reasoning: `Terra / Medium` — planning and dependency analysis.

### REVAMP-006 — Document supported Windows and Docker development workflows

- Status: `DONE`; Priority: `P0`; Category: `ENVIRONMENT`.
- Rationale / evidence: `BUILD_AND_RUN_BASELINE.md` and `WINDOWS_DOCKER_READINESS.md` show PowerShell `npm.cmd`, Maven-wrapper cache, Docker config, hostname, and Redis-property caveats.
- Desired outcome: reproducible native PowerShell and Docker Desktop startup, teardown, and smoke-check instructions with known limitations stated.
- Dependencies: REVAMP-005. Blocks: REVAMP-007, REVAMP-009, REVAMP-011, REVAMP-030.
- Expected affected areas: developer documentation only; do not change runtime configuration in this item.
- Production behavior change: No. Tests required: documented command smoke checklist, including `docker compose config`.
- Security considerations: label committed credentials and exposed ports as local-development only; do not normalize them as production settings.
- Performance considerations: N/A. Redis implications: document host/port behavior only. MariaDB implications: document initialization and native-host caveat only.
- REST implications: document local base URL/smoke endpoint. WebSocket implications: document `/ws` as current endpoint, without claiming active frontend use.
- Compatibility/migration: none. Documentation required: supported workflow and troubleshooting notes.
- Suggested branch / commit theme: `codex/windows-docker-workflow`; `docs(dev): document Windows and Docker workflows`.
- Recommended Codex model/reasoning: `Luna / Light` — narrow documentation based on existing baseline evidence.

### REVAMP-007 — Define repeatable local verification contract

- Status: `DONE`; Priority: `P0`; Category: `VERIFICATION`.
- Rationale / evidence: backend verify currently passes without tests; frontend lint fails and frontend has no test script.
- Desired outcome: one documented local verification matrix with expected pass/fail baseline, command ownership, and exit criteria for later changes.
- Dependencies: REVAMP-006. Blocks: REVAMP-008 through REVAMP-011 and REVAMP-030.
- Expected affected areas: developer documentation and narrowly scoped verification scripts if justified.
- Production behavior change: No. Tests required: execute each defined verification command or record an environment-specific reason.
- Security considerations: include dependency-audit and secret/config checks only when reproducible. Performance considerations: preserve build-size baseline for later comparison.
- Redis implications: include connectivity/config smoke criteria. MariaDB implications: include schema/startup smoke criteria.
- REST implications: include read-only smoke criteria. WebSocket implications: include current handshake capability as a separate, non-authorized baseline.
- Compatibility/migration: none. Documentation required: canonical local verification matrix.
- Suggested branch / commit theme: `codex/local-verification-contract`; `docs(verification): define repeatable local checks`.
- Recommended Codex model/reasoning: `Terra / Light` — clear, bounded verification design.

### REVAMP-008 — Add CI verification baseline

- Status: `DONE`; Priority: `P3`; Category: `VERIFICATION`.
- Rationale / evidence: no `.github` workflow exists; CI must mirror a proven local contract.
- Desired outcome: CI runs stable build, lint, and available test tiers without masking known failures.
- Dependencies: REVAMP-007. Blocks: release confidence and REVAMP-030.
- Expected affected areas: CI workflow and verification documentation.
- Production behavior change: No. Tests required: workflow validation and a successful run after baseline issues are addressed or explicitly quarantined.
- Security considerations: least-privilege CI tokens and no secrets in logs. Performance considerations: cache only after correctness/reproducibility is proven.
- Redis implications: service containers only when integration tiers require them. MariaDB implications: same.
- REST implications: controller tier when available. WebSocket implications: later test tier, not an initial requirement.
- Compatibility/migration: none. Documentation required: CI scope and failure policy.
- Suggested branch / commit theme: `codex/ci-verification-baseline`; `ci: add repeatable verification workflow`.
- Recommended Codex model/reasoning: `Terra / Medium` — infrastructure coordination and failure-policy decisions.

### REVAMP-009 — Add characterization coverage for current lobby and turn behavior

- Status: `DONE`; Priority: `P1`; Category: `TESTING`.
- Rationale / evidence: no backend test sources exist; lobby, throw/action/pass, and end behavior are implicit and high risk.
- Desired outcome: executable characterization of current externally observable behavior, explicitly marking suspected defects rather than codifying them as intended rules.
- Dependencies: REVAMP-006, REVAMP-007. Blocks: REVAMP-014 through REVAMP-023.
- Expected affected areas: backend test harness and test resources.
- Production behavior change: No. Tests required: create/join/start, active/wrong-player throw, optional action, path/body mismatch, and end/leave snapshots.
- Security considerations: include current unauthenticated and forged-ID behavior as characterization only; do not bless it as target behavior.
- Performance considerations: deterministic fixtures and bounded test runtime. Redis implications: isolated state per test. MariaDB implications: seed/stat behavior captured where touched.
- REST implications: status/body contract coverage. WebSocket implications: record current absence of a throw event and current selected event behavior.
- Compatibility/migration: creates a safety net for intentional behavior changes. Documentation required: test intent and known-defect annotations.
- Suggested branch / commit theme: `codex/characterize-lobby-turn-flow`; `test: characterize current lobby and turn behavior`.
- Recommended Codex model/reasoning: `Terra / Medium` — non-trivial test design around ambiguous behavior.

### REVAMP-010 — Add deterministic domain-rule tests and test seams

- Status: `DONE`; Priority: `P1`; Category: `TESTING`.
- Rationale / evidence: movement is pure, but dice, square actions, time, and randomness are entangled with infrastructure.
- Desired outcome: injectable seams for randomness/time where materially useful and focused tests for movement, dice interpretation, rent/tax/card/jail outcomes.
- Dependencies: REVAMP-009. Blocks: REVAMP-019 and REVAMP-020.
- Expected affected areas: core services and unit tests.
- Production behavior change: Possible; only if needed to preserve behavior while introducing seams.
- Tests required: deterministic movement/dice tests; rule matrix including known rent/jail ambiguities as pending decisions.
- Security considerations: prove server-generated dice and reject client authority. Performance considerations: no speculative optimization.
- Redis implications: isolate rule logic from raw access where practical. MariaDB implications: static square/card fixtures only.
- REST implications: N/A directly. WebSocket implications: N/A directly.
- Compatibility/migration: preserve current DTO behavior until a later approved contract change. Documentation required: intended versus unverified rule decisions.
- Suggested branch / commit theme: `codex/domain-rule-test-seams`; `test: add deterministic game-rule coverage`.
- Recommended Codex model/reasoning: `Terra / Medium` — testability refactor with behavior preservation.

### REVAMP-011 — Establish Redis, MariaDB, and REST integration-test infrastructure

- Status: `DONE`; Priority: `P1`; Category: `TESTING`.
- Rationale / evidence: Testcontainers dependencies exist but no tests use them; active state spans Redis and MariaDB without cross-resource coverage.
- Desired outcome: repeatable integration fixtures for Redis, MariaDB, and REST commands with isolation and cleanup rules.
- Dependencies: REVAMP-006, REVAMP-007, REVAMP-009. Blocks: REVAMP-015 through REVAMP-023 and REVAMP-030.
- Expected affected areas: backend test configuration, fixtures, and test documentation.
- Production behavior change: No. Tests required: container startup, schema initialization, Redis cleanup, REST lifecycle smoke.
- Security considerations: test unauthorized/invalid cases once auth exists; never use production credentials. Performance considerations: keep suites tiered to avoid slowing all feedback.
- Redis implications: document test key namespace/lifecycle and cleanup. MariaDB implications: validate init schema/seed behavior and isolate database state.
- REST implications: exercise controller/application contracts. WebSocket implications: prerequisite only; dedicated coverage is REVAMP-022.
- Compatibility/migration: none. Documentation required: integration-test run instructions.
- Suggested branch / commit theme: `codex/integration-test-foundation`; `test: add Redis MariaDB and REST integration foundation`.
- Recommended Codex model/reasoning: `Terra / Medium` — infrastructure/test design.

### REVAMP-012 — Define target command boundaries and state ownership

- Status: `DONE`; Priority: `P1`; Category: `ARCHITECTURE`.
- Rationale / evidence: controllers, orchestration, Redis mutation, rule logic, timers, and events currently cross boundaries.
- Desired outcome: a pragmatic target map for transport, application commands, domain rules, state store, scheduler, and event publication ownership.
- Dependencies: REVAMP-009. Blocks: REVAMP-013 through REVAMP-021.
- Expected affected areas: architecture documentation; later implementation uses it.
- Production behavior change: No. Tests required: trace representative create/join/roll/action/timeout commands against the proposed boundaries.
- Security considerations: identity/authorization belongs at command entry, not React or raw controllers. Performance considerations: define ownership without over-abstraction.
- Redis implications: state-store owns keys and atomicity. MariaDB implications: repositories own persistent data access.
- REST implications: controllers map requests to commands. WebSocket implications: future inbound handlers use the same commands.
- Compatibility/migration: preserve current public contracts until explicitly migrated. Documentation required: target boundary document.
- Suggested branch / commit theme: `codex/target-command-boundaries`; `docs(architecture): define command and state boundaries`.
- Recommended Codex model/reasoning: `Sol / Medium` — cross-cutting architecture establishes later security and concurrency work.

### REVAMP-013 — Record required architecture decisions (ADRs)

- Status: `DONE`; Priority: `P1`; Category: `ARCHITECTURE`.
- Rationale / evidence: auth/session model, command concurrency strategy, Redis schema evolution, and realtime transport target are undecided.
- Desired outcome: concise ADRs for identity/session approach, per-game transition atomicity/idempotency, state versioning, and WebSocket/polling/recovery direction.
- Dependencies: REVAMP-012, REVAMP-009. Blocks: REVAMP-015, REVAMP-018, REVAMP-020, REVAMP-021.
- Expected affected areas: ADR documentation only.
- Production behavior change: No. Tests required: decision acceptance criteria and migration/test strategy for each ADR.
- Security considerations: decide trust boundary and subscription authorization model. Performance considerations: reject global-lock and speculative-broker assumptions without evidence.
- Redis implications: key/version/idempotency lifecycle decisions. MariaDB implications: persistent identity/schema decision where applicable.
- REST implications: command identity/version contract direction. WebSocket implications: current simple broker limitations and recovery contract.
- Compatibility/migration: ADRs must name client/state migration implications. Documentation required: ADRs and references from canonical docs.
- Suggested branch / commit theme: `codex/revamp-architecture-adrs`; `docs(adr): record revamp architecture decisions`.
- Recommended Codex model/reasoning: `Sol / Medium` — decisions constrain security and distributed state design.

### REVAMP-014 — Document canonical game state machine and rule decisions

- Status: `DONE`; Priority: `P1`; Category: `GAME_FLOW`.
- Rationale / evidence: turn phase is implicit in Redis fields; optional-action formats and jail/rent semantics conflict; doubles are unverified.
- Desired outcome: canonical states, commands, guards, transitions, terminal/cleanup behavior, and explicitly approved rule decisions.
- Dependencies: REVAMP-009, REVAMP-010, REVAMP-012. Blocks: REVAMP-018 through REVAMP-023.
- Expected affected areas: state-machine/rule documentation and later tests.
- Production behavior change: No. Tests required: map each existing characterization test to a state/transition; flag desired changes separately.
- Security considerations: identify actor, membership, phase, replay, and state-version guards per command. Performance considerations: N/A.
- Redis implications: map state fields and lifecycle; do not silently redefine them. MariaDB implications: identify metadata reads/stat finalization boundaries.
- REST implications: command/error behavior mapping. WebSocket implications: event-after-transition and recovery requirements.
- Compatibility/migration: identify old optional-action/event shapes before changes. Documentation required: canonical state machine and approved rule-decision record.
- Suggested branch / commit theme: `codex/canonical-game-state-machine`; `docs(game): define canonical state machine`.
- Recommended Codex model/reasoning: `Sol / Medium` — subtle game and transition semantics require careful evidence reconciliation.

### REVAMP-015 — Add authentication and server-side player identity foundation

- Status: `DONE`; Priority: `P1`; Category: `SECURITY`.
- Rationale / evidence: all requests are permitted and browser-supplied `playerId` is treated as identity.
- Desired outcome: trusted authenticated actor context mapped to a server-side player identity at REST and planned WebSocket entry points.
- Dependencies: REVAMP-011, REVAMP-012, REVAMP-013, REVAMP-014. Blocks: REVAMP-016 through REVAMP-022.
- Expected affected areas: security configuration, command entry, frontend session handling, tests, and documentation.
- Production behavior change: Yes. Tests required: unauthenticated rejection, identity mapping, forged path/body player ID rejection, session expiry behavior.
- Security considerations: primary objective; revisit CSRF and CORS based on the chosen credential model. Performance considerations: bounded session/token lookup and no sensitive logging.
- Redis implications: session/idempotency keys only if chosen by ADR, with TTL/ownership documented. MariaDB implications: player/session metadata only if ADR requires it.
- REST implications: authentication/error contract changes. WebSocket implications: handshake/CONNECT identity foundation, not broad realtime enablement.
- Compatibility/migration: explicit client migration from browser-stored raw ID; staged compatibility only if approved. Documentation required: auth setup and API changes.
- Suggested branch / commit theme: `codex/auth-player-identity`; `feat(security): establish server-side player identity`.
- Recommended Codex model/reasoning: `Sol / Medium` — security architecture and compatibility are high risk.

### REVAMP-016 — Enforce membership, host, active-player, and phase authorization

- Status: `DONE`; Priority: `P1`; Category: `SECURITY`.
- Rationale / evidence: host checks are partial, membership is inconsistent, and UI-only controls can be bypassed.
- Desired outcome: centralized application-command authorization for reads/mutations, including host-only lifecycle actions and active-turn commands.
- Dependencies: REVAMP-015, REVAMP-011, REVAMP-014. Blocks: REVAMP-017 through REVAMP-022.
- Expected affected areas: authorization service/policy, controllers/commands, frontend error handling, tests.
- Production behavior change: Yes. Tests required: non-member, non-host, wrong-player, invalid-phase, and private-read rejection cases.
- Security considerations: primary objective; never use client IDs as authority. Performance considerations: avoid repeated membership lookups within one command.
- Redis implications: membership read ownership and any cache/TTL policy documented. MariaDB implications: ownership constraints if introduced.
- REST implications: 401/403/409/validation response taxonomy. WebSocket implications: policy reused for subscription/inbound command checks.
- Compatibility/migration: existing unauthenticated callers intentionally break under approved migration. Documentation required: authorization matrix and client migration notes.
- Suggested branch / commit theme: `codex/game-command-authorization`; `feat(security): authorize game commands`.
- Recommended Codex model/reasoning: `Sol / Medium` — game authority and security invariants are intertwined.

### REVAMP-017 — Contain unsafe direct state-mutation and identity-mismatch endpoints

- Status: `DONE`; Priority: `P1`; Category: `SECURITY`.
- Rationale / evidence: arbitrary player-state writes, money grant, public lifecycle mutations, and `/action` path/body mismatch permit tampering.
- Desired outcome: each endpoint is explicitly routed through the command path, restricted to an authorized dev/admin context, deprecated, or removed with usage evidence.
- Dependencies: REVAMP-015, REVAMP-016, REVAMP-011. Blocks: REVAMP-018 and release verification.
- Expected affected areas: REST controllers/DTOs, frontend wrappers, tests, API documentation.
- Production behavior change: Yes. Tests required: direct balance/position/property mutation rejected; money grant policy; path/body mismatch rejected; supported client path works.
- Security considerations: primary anti-cheat/IDOR remediation. Performance considerations: N/A.
- Redis implications: eliminate arbitrary raw writes; document any dev-only state tooling. MariaDB implications: N/A unless admin audit/session data is introduced.
- REST implications: endpoint deprecation/removal or authorization contract. WebSocket implications: N/A directly.
- Compatibility/migration: inspect frontend callers before removal; use a documented deprecation path where needed. Documentation required: API migration and security rationale.
- Suggested branch / commit theme: `codex/contain-unsafe-state-endpoints`; `fix(security): contain direct state mutation APIs`.
- Recommended Codex model/reasoning: `Terra / Medium` — focused high-risk contract change after foundations exist.

### REVAMP-018 — Establish the authoritative, idempotent game-state transition path

- Status: `READY`; Priority: `P1`; Category: `GAME_FLOW`.
- Rationale / evidence: dice/action writes span multiple Redis mutations with no state version, command ID, lock, transaction, or Lua protection.
- Desired outcome: one application command path for REST, future WebSocket, and timer transitions with documented per-game atomicity, idempotency, and post-commit event publication.
- Dependencies: REVAMP-011 through REVAMP-017. Blocks: REVAMP-019 through REVAMP-023.
- Expected affected areas: application command service, Redis store, transport adapters, scheduler integration, tests, ADR-linked docs.
- Production behavior change: Yes. Tests required: duplicate/replay, concurrent roll/action, stale version, timer-vs-player race foundation, event-after-state assertions.
- Security considerations: prevents replay and competing authoritative transitions. Performance considerations: use evidence-backed per-game concurrency; avoid global locks.
- Redis implications: document version/command marker/lock or Lua schema, serializer, TTL, cleanup, and migration. MariaDB implications: define boundaries for stat finalization; no pretend cross-store atomicity.
- REST implications: command IDs/version conflicts if adopted. WebSocket implications: outbound events are notifications after durable state; future inbound uses same path.
- Compatibility/migration: version/event compatibility plan required. Documentation required: transition and Redis schema updates plus invariants/comments.
- Suggested branch / commit theme: `codex/authoritative-game-transitions`; `feat(game): establish idempotent state transitions`.
- Recommended Codex model/reasoning: `Sol / Medium` — distributed state, concurrency, and security correctness.

### REVAMP-019 — Repair approved dice, turn, and square-action behavior

- Status: `BLOCKED`; Priority: `P1`; Category: `GAME_FLOW`.
- Rationale / evidence: rent direction likely corrupts balances; jail mapping conflicts; turn order is not join order; doubles are undefined.
- Desired outcome: state-machine-approved dice, movement, optional action, rent/tax/card/jail, and turn-order behavior with explicit rule decisions.
- Dependencies: REVAMP-010, REVAMP-014, REVAMP-018. Blocks: REVAMP-023 and later cleanup.
- Expected affected areas: domain rules, command path, DTO/event mapping, frontend modal handling, tests.
- Production behavior change: Yes. Tests required: rule matrix, insufficient funds, ownership, jail/go-jail, pass/start reward, turn order, duplicate action.
- Security considerations: calculations remain server authoritative. Performance considerations: capture owner-lookup cost; defer indexing unless measured/needed.
- Redis implications: property/optional-action representation migration only if required and documented. MariaDB implications: static square/card metadata contract verified.
- REST implications: intentional DTO/error changes documented. WebSocket implications: event payload aligns with canonical result.
- Compatibility/migration: frontend API/modal migration for changed result shapes. Documentation required: approved rules and API/event changes.
- Suggested branch / commit theme: `codex/repair-turn-square-rules`; `fix(game): repair turn and square action rules`.
- Recommended Codex model/reasoning: `Sol / Medium` — rule correctness depends on the new transition model.

### REVAMP-020 — Make timer, cleanup, and end-game processing transition-safe

- Status: `BLOCKED`; Priority: `P1`; Category: `GAME_FLOW`.
- Rationale / evidence: scheduler and turn flow independently end/cleanup games and publish inconsistent end events.
- Desired outcome: timers submit the same versioned commands as players; end/cleanup is idempotent with defined ownership and lifecycle.
- Dependencies: REVAMP-014, REVAMP-018, REVAMP-019. Blocks: REVAMP-021, REVAMP-023, REVAMP-030.
- Expected affected areas: scheduler, command path, Redis lifecycle, event publishing, tests.
- Production behavior change: Yes. Tests required: timer/player races, duplicate end, late cleanup, abandoned game, and stats-finalization once-only cases.
- Security considerations: prevents timer-triggered integrity failures. Performance considerations: replace unsafe scans only when lifecycle/index design is proven.
- Redis implications: timer/version/TTL and cleanup behavior fully documented; deck cleanup included. MariaDB implications: stats finalization boundary and duplicate prevention tested.
- REST implications: terminal-state responses defined. WebSocket implications: one canonical end event and snapshot recovery behavior.
- Compatibility/migration: event-name migration plan. Documentation required: timer/cleanup lifecycle and state-machine updates.
- Suggested branch / commit theme: `codex/transition-safe-timers`; `fix(game): make timer transitions idempotent`.
- Recommended Codex model/reasoning: `Sol / Medium` — concurrent scheduler and distributed-state behavior.

### REVAMP-021 — Define and implement WebSocket event synchronization and recovery

- Status: `BLOCKED`; Priority: `P2`; Category: `WEBSOCKET`.
- Rationale / evidence: server broadcasts selected events through an in-memory broker, while frontend polls and commented STOMP code has no recovery contract.
- Desired outcome: approved polling or WebSocket-plus-snapshot strategy with event envelope, subscription authorization, ordering/deduplication, reconnect, and multi-instance limits defined.
- Dependencies: REVAMP-013, REVAMP-015, REVAMP-016, REVAMP-018, REVAMP-020. Blocks: REVAMP-022 and realtime-dependent UX changes.
- Expected affected areas: WebSocket configuration, event publisher, frontend state synchronization, REST snapshot contract, docs.
- Production behavior change: Yes. Tests required: authorized subscription, missed-event snapshot recovery, duplicate/out-of-order event handling, and disconnect/reconnect.
- Security considerations: handshake/CONNECT and topic membership authorization are mandatory. Performance considerations: measure polling reduction and avoid full-state broadcasts without need.
- Redis implications: no current Redis Pub/Sub assumption; future broker decision follows ADR. MariaDB implications: N/A.
- REST implications: snapshot remains recovery authority. WebSocket implications: primary scope; document destinations, envelopes, and broker limitations.
- Compatibility/migration: staged support for current polling clients if required. Documentation required: event and recovery contract.
- Suggested branch / commit theme: `codex/websocket-sync-recovery`; `feat(realtime): synchronize game events with snapshot recovery`.
- Recommended Codex model/reasoning: `Sol / Medium` — security, ordering, reconnect, and multi-instance behavior.

### REVAMP-022 — Add WebSocket and critical end-to-end game-flow coverage

- Status: `BLOCKED`; Priority: `P1`; Category: `TESTING`.
- Rationale / evidence: no WebSocket or E2E suite exists; functional repairs require cross-layer proof.
- Desired outcome: focused integration tests for STOMP delivery/auth/recovery and E2E coverage for create→join→start→turn→action→end.
- Dependencies: REVAMP-011, REVAMP-019, REVAMP-020, REVAMP-021. Blocks: final release verification.
- Expected affected areas: backend/frontend test suites and test documentation.
- Production behavior change: No. Tests required: WebSocket subscription/auth/reconnect plus critical happy/invalid/concurrent game flows.
- Security considerations: assert unauthorized subscriptions/actions fail. Performance considerations: tier tests to keep routine feedback fast.
- Redis implications: test state cleanup/version behavior. MariaDB implications: verify stats persistence/finalization where included.
- REST implications: exercise snapshot/command behavior. WebSocket implications: primary coverage scope.
- Compatibility/migration: verify supported client migration path. Documentation required: test tiers and known exclusions.
- Suggested branch / commit theme: `codex/websocket-e2e-game-tests`; `test: cover realtime and critical game flows`.
- Recommended Codex model/reasoning: `Terra / Medium` — multi-layer test design after contracts stabilize.

### REVAMP-023 — Refactor toward explicit boundaries and consolidate state infrastructure

- Status: `BLOCKED`; Priority: `P3`; Category: `REFACTOR`.
- Rationale / evidence: rule services mutate Redis directly; key construction/optional-action formats are duplicated; controller/service responsibility is porous.
- Desired outcome: incremental extraction of command/domain/store/event responsibilities and centralized Redis keys/models without broad rewrite.
- Dependencies: REVAMP-018 through REVAMP-022. Blocks: REVAMP-024 and selected hardening work.
- Expected affected areas: backend services, Redis state access, DTOs, tests, architecture docs.
- Production behavior change: Possible; preserve characterized contracts unless explicitly migrated.
- Tests required: existing characterization/integration/E2E coverage remains green; add tests for each extracted invariant.
- Security considerations: do not weaken command authorization during moves. Performance considerations: reduce repeated raw Redis work only with measured or clear benefit.
- Redis implications: centralize key construction, serializers, lifecycle, ownership, and compatible migrations. MariaDB implications: clarify repository boundaries and transaction edges.
- REST implications: keep controllers thin and contracts stable. WebSocket implications: event publisher is decoupled from rule/store code.
- Compatibility/migration: version or dual-read/write only if schema/DTO changes require it. Documentation required: boundary and schema updates.
- Suggested branch / commit theme: `codex/consolidate-game-state-infrastructure`; `refactor(game): separate command and state concerns`.
- Recommended Codex model/reasoning: `Terra / Medium` — incremental refactoring with established tests.

### REVAMP-024 — Resolve database schema ownership and migration strategy

- Status: `BLOCKED`; Priority: `P2`; Category: `DATABASE`.
- Rationale / evidence: JPA `ddl-auto=update`, seed trigger, explicit stats rows, and missing SQL unique constraint can conflict.
- Desired outcome: explicit schema owner/migration approach, corrected stats uniqueness/seed behavior, and reproducible test initialization.
- Dependencies: REVAMP-011, REVAMP-023. Blocks: clean-environment release verification.
- Expected affected areas: database migration/schema process, test initialization, backend persistence docs.
- Production behavior change: Possible. Tests required: fresh schema, seed, unique stats, and upgrade/migration scenarios.
- Security considerations: no destructive schema migration without approval. Performance considerations: evaluate needed indexes from measured query paths.
- Redis implications: clarify Redis-to-stats finalization boundary. MariaDB implications: primary scope—constraints, transactions, and migration lifecycle.
- REST implications: preserve DTOs unless a constraint exposes a current error path. WebSocket implications: N/A.
- Compatibility/migration: explicit migration/rollback plan required. Documentation required: schema ownership and migration notes.
- Suggested branch / commit theme: `codex/database-schema-ownership`; `fix(database): align stats schema and initialization`.
- Recommended Codex model/reasoning: `Terra / Medium` — data integrity and migration safety.

### REVAMP-025 — Remove confirmed obsolete code and local artifacts

- Status: `BLOCKED`; Priority: `P4`; Category: `CLEANUP`.
- Rationale / evidence: commented legacy turn handlers, stale frontend wrappers, duplicate optional-action paths, crash logs, and Redis dump are candidates only.
- Desired outcome: remove only code/artifacts proven unused after compatible contracts and regression coverage exist.
- Dependencies: REVAMP-022, REVAMP-023, REVAMP-024. Blocks: none.
- Expected affected areas: legacy code, generated/local artifact policy, tests, documentation.
- Production behavior change: Possible. Tests required: call-site/search proof plus relevant regression suite.
- Security considerations: do not remove dev/admin safeguards or audit evidence blindly. Performance considerations: cleanup is not a performance claim.
- Redis implications: remove obsolete key handling only after migration/TTL proof. MariaDB implications: N/A unless obsolete schema seed is addressed.
- REST implications: remove stale wrappers only after client/API contract verification. WebSocket implications: remove commented legacy path only after selected sync strategy is implemented.
- Compatibility/migration: explicit deprecation/removal condition for each item. Documentation required: cleanup decision record when non-obvious.
- Suggested branch / commit theme: `codex/remove-confirmed-obsolete-code`; `chore: remove confirmed obsolete code`.
- Recommended Codex model/reasoning: `Terra / Light` — bounded cleanup protected by tests.

### REVAMP-026 — Apply remaining deployment security hardening

- Status: `BLOCKED`; Priority: `P1`; Category: `SECURITY`.
- Rationale / evidence: committed defaults, exposed services, duplicate CORS, permissive WebSocket origins, ad hoc logs, and error taxonomy remain.
- Desired outcome: environment-aware secrets/origin/logging/error/abuse posture consistent with the chosen authentication and realtime design.
- Dependencies: REVAMP-015 through REVAMP-017, REVAMP-021, REVAMP-023. Blocks: release sign-off.
- Expected affected areas: security/configuration, logging/error handling, deployment docs, tests.
- Production behavior change: Yes. Tests required: CORS/origin, errors, sensitive-data/logging review, config/profile, and relevant abuse limits.
- Security considerations: primary scope; document residual risks. Performance considerations: rate/size limits must be measured and bounded.
- Redis implications: protect connection/config and key exposure; no direct raw-map APIs. MariaDB implications: externalized production credentials and least exposure.
- REST implications: safe auth/error/CORS behavior. WebSocket implications: restrictive origins and subscription enforcement.
- Compatibility/migration: local development defaults and client origins require explicit migration guidance. Documentation required: deployment security configuration.
- Suggested branch / commit theme: `codex/deployment-security-hardening`; `fix(security): harden deployment defaults and origins`.
- Recommended Codex model/reasoning: `Sol / Medium` — security changes cross authentication, configuration, and realtime surfaces.

### REVAMP-027 — Apply evidence-based performance improvements

- Status: `DEFERRED`; Priority: `P3`; Category: `PERFORMANCE`.
- Rationale / evidence: `KEYS` scans, polling, owner scans, N+1 reads, and large frontend bundle are risks, but some are bounded or unmeasured.
- Desired outcome: baseline metrics and targeted fixes such as lifecycle indexes, polling reduction, payload shaping, or query optimization only where evidence warrants.
- Dependencies: REVAMP-020, REVAMP-021, REVAMP-023, REVAMP-024. Blocks: none unless a measured issue blocks usability.
- Expected affected areas: measured hot paths, Redis indexes, frontend delivery, tests/docs.
- Production behavior change: Possible. Tests required: correctness regression plus before/after measurement.
- Security considerations: indexes may support membership checks but must not become authorization authority. Performance considerations: primary scope; no speculative optimization.
- Redis implications: new indexes need key/type/TTL/cleanup migration documentation. MariaDB implications: indexes/query changes justified by measurements.
- REST implications: pagination/projection only with contract review. WebSocket implications: event size/frequency measured before change.
- Compatibility/migration: document index/data migration if needed. Documentation required: measurements and decisions.
- Suggested branch / commit theme: `codex/measured-performance-improvements`; `perf: optimize measured game-state hot paths`.
- Recommended Codex model/reasoning: `Terra / Medium` — measurement-led optimization; use Sol only if distributed performance diagnosis proves difficult.

### REVAMP-028 — Complete developer, architecture, API, and operations documentation

- Status: `BLOCKED`; Priority: `P4`; Category: `DOCUMENTATION`.
- Rationale / evidence: current README/API snapshot can be stale; later phases change commands, contracts, state, and security.
- Desired outcome: canonical, non-duplicative developer, architecture, state-machine, API, event, Redis, MariaDB, and security documentation.
- Dependencies: REVAMP-006 through REVAMP-027 as applicable. Blocks: final release verification.
- Expected affected areas: documentation only.
- Production behavior change: No. Tests required: documentation-to-command/contract review.
- Security considerations: document safe configuration, identity, authorization, residual risks. Performance considerations: document relevant measured budgets/limits.
- Redis implications: finalized schema/lifecycle reference. MariaDB implications: finalized schema/migration reference.
- REST implications: canonical API contract. WebSocket implications: destinations/envelopes/recovery contract.
- Compatibility/migration: migration notes consolidated. Documentation required: primary scope.
- Suggested branch / commit theme: `codex/complete-revamp-documentation`; `docs: complete revamp architecture and API documentation`.
- Recommended Codex model/reasoning: `Terra / Medium` — reconciliation of many finalized sources.

### REVAMP-029 — Run full regression verification

- Status: `BLOCKED`; Priority: `P0`; Category: `VERIFICATION`.
- Rationale / evidence: all critical flows currently lack automated coverage and final changes span state, security, and transport.
- Desired outcome: documented full verification across unit, integration, REST, WebSocket, E2E, lint/build, security review, and migration checks.
- Dependencies: REVAMP-008, REVAMP-022, REVAMP-024 through REVAMP-028. Blocks: release milestone.
- Expected affected areas: test/CI documentation and verification artifacts only unless a defect is found.
- Production behavior change: No. Tests required: full defined regression matrix.
- Security considerations: run feature/release security checklist and document residual risk. Performance considerations: include selected measured regression checks.
- Redis implications: lifecycle/cleanup/transition tests. MariaDB implications: fresh-schema and migration checks.
- REST implications: public contract regression. WebSocket implications: authorization/recovery/event contract regression.
- Compatibility/migration: verify supported upgrade/client paths. Documentation required: release verification report.
- Suggested branch / commit theme: `codex/full-regression-verification`; `test: verify revamp regression matrix`.
- Recommended Codex model/reasoning: `Terra / Medium` — coordinated verification and triage.

### REVAMP-030 — Verify a clean Windows and Docker Desktop checkout

- Status: `BLOCKED`; Priority: `P0`; Category: `ENVIRONMENT`.
- Rationale / evidence: Windows wrapper, PowerShell, Docker config, native hostname, and dependency-cache behavior were all environment-sensitive in the baseline.
- Desired outcome: clean-checkout proof using the supported Windows and Docker Desktop paths, with exact commands and expected results.
- Dependencies: REVAMP-006, REVAMP-007, REVAMP-008, REVAMP-029. Blocks: release sign-off.
- Expected affected areas: verification documentation and CI/release evidence.
- Production behavior change: No. Tests required: fresh clone/dependency/container/build/smoke matrix.
- Security considerations: use placeholder/local-only credentials and avoid publishing secrets. Performance considerations: record bootstrap time only as operational evidence.
- Redis implications: container startup and cleanup verified. MariaDB implications: initialization and persistence volume behavior verified.
- REST implications: smoke endpoint/command verified. WebSocket implications: handshake and selected recovery path verified.
- Compatibility/migration: validates supported developer onboarding path. Documentation required: clean-checkout report and troubleshooting updates.
- Suggested branch / commit theme: `codex/clean-windows-docker-verification`; `docs(verification): record clean checkout validation`.
- Recommended Codex model/reasoning: `Terra / Light` — procedural verification once workflows exist.

## Milestones

### Milestone A — Reproducible development baseline

- Goal: make supported Windows and Docker development paths explicit and repeatable.
- Entry criteria: REVAMP-005 complete.
- Exit criteria: REVAMP-006 and REVAMP-007 complete; verification commands have known outcomes.
- Items: REVAMP-006, REVAMP-007.
- Major risks: mistaking sandbox-only failures for product defects; treating local credentials as production-safe.

### Milestone B — Verification and characterization safety net

- Goal: provide incremental test/CI feedback before high-risk behavior changes.
- Entry criteria: Milestone A exit criteria.
- Exit criteria: REVAMP-008 through REVAMP-011 complete at the tiers needed for the next changes.
- Items: REVAMP-008, REVAMP-009, REVAMP-010, REVAMP-011.
- Major risks: enshrining suspected defects as desired behavior; slow/non-isolated infrastructure tests.

### Milestone C — Target architecture and state model

- Goal: decide boundaries, transition semantics, and architecture choices before rewriting command flow.
- Entry criteria: characterization evidence available.
- Exit criteria: REVAMP-012, REVAMP-013, REVAMP-014 complete and accepted.
- Items: REVAMP-012, REVAMP-013, REVAMP-014.
- Major risks: over-design; unapproved rule decisions (doubles, rent, jail, ownership/order).

### Milestone D — Identity and authorization foundation

- Goal: make the server identify and authorize every meaningful actor before relying on new command paths.
- Entry criteria: Milestone C exit criteria and integration test foundation.
- Exit criteria: REVAMP-015 through REVAMP-017 complete with migration evidence.
- Items: REVAMP-015, REVAMP-016, REVAMP-017.
- Major risks: breaking raw-ID clients without a planned migration; leaving alternate unsafe endpoints reachable.

### Milestone E — Authoritative game-flow repair

- Goal: establish one atomic, idempotent transition path and repair approved game rules.
- Entry criteria: Milestone D exit criteria.
- Exit criteria: REVAMP-018 and REVAMP-019 complete with concurrency/rule coverage.
- Items: REVAMP-018, REVAMP-019.
- Major risks: duplicate commands, data migration, and accidental rule changes.

### Milestone F — Timers, reconnect, and event synchronization

- Goal: make non-player transitions and client synchronization safe and recoverable.
- Entry criteria: Milestone E exit criteria.
- Exit criteria: REVAMP-020 through REVAMP-022 complete.
- Items: REVAMP-020, REVAMP-021, REVAMP-022.
- Major risks: scheduler races, incorrect multi-instance assumptions, unauthorized topics, and missed events.

### Milestone G — Structural refactoring and cleanup

- Goal: simplify proven behavior only after coverage and contracts stabilize.
- Entry criteria: Milestone F exit criteria.
- Exit criteria: REVAMP-023 through REVAMP-025 complete.
- Items: REVAMP-023, REVAMP-024, REVAMP-025.
- Major risks: cleanup deleting latent compatibility paths; unsafe schema changes.

### Milestone H — Hardening, optimization, documentation, and release verification

- Goal: make the revamp deployable, documented, and independently reproducible.
- Entry criteria: Milestone G exit criteria.
- Exit criteria: REVAMP-026 through REVAMP-030 complete.
- Items: REVAMP-026, REVAMP-027, REVAMP-028, REVAMP-029, REVAMP-030.
- Major risks: hardening/config changes expose incomplete migration work; optimization lacks evidence.

## Execution frontier

The immediate `READY` item is **REVAMP-018 — Establish the authoritative,
idempotent game-state transition path**. Later work remains blocked by the
required transition-path prerequisites.

## Planning review

- Each future item has one coherent outcome and a stable ID.
- No dependency cycle is present: dependencies move from completed milestones
  through A→H only.
- P0/P1 work is not behind unrelated cleanup; it is gated only by necessary
  reproducibility, test, architecture, and security prerequisites.
- Cleanup follows characterization, integration/E2E coverage, and contract
  stabilization. Performance work remains late and evidence-based.
