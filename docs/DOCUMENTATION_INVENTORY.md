# Documentation inventory

Classification is by file or tightly cohesive file group. `Current` means the
file is maintained as present guidance. `Historical` means intentionally
retained evidence. `Normative` means an accepted rule/decision/standard.

| Category | File(s) | Classification / ownership |
| --- | --- | --- |
| Root navigation | `../README.md` | Current high-level orientation; links rather than duplicates contracts. |
| Governance | `repository instructions` | Current normative working contract. |
| Documentation navigation | `README.md` | Current canonical ownership map. |
| Developer onboarding/local setup | `getting-started/WINDOWS_DOCKER_DEVELOPMENT.md` | Current Windows-first setup and troubleshooting. |
| Local verification | `development/LOCAL_VERIFICATION.md` | Current canonical command/result classification and counts. |
| CI | `development/CI_VERIFICATION.md` | Current required GitHub Actions contract. |
| Integration tests | `development/INTEGRATION_TESTING.md` | Current Testcontainers/HTTP/STOMP scope. |
| Current architecture | `architecture/CURRENT_ARCHITECTURE.md` | Current overview and navigation. |
| Command/state boundaries | `architecture/TARGET_COMMAND_BOUNDARIES.md`, `architecture/AUTHORITATIVE_GAME_TRANSITIONS.md` | Current normative boundaries; explicitly labeled audit-era examples remain historical migration context. |
| Timers/completion | `architecture/TRANSITION_SAFE_GAME_LIFECYCLE.md` | Current authoritative lifecycle/cleanup design. |
| Realtime | `architecture/REALTIME_SYNCHRONIZATION.md` | Current STOMP envelope, security, ordering, and snapshot recovery contract. |
| MariaDB/Flyway | `architecture/DATABASE_MIGRATION_OWNERSHIP.md` | Current schema ownership and legacy bridge operations. |
| ADRs | `architecture/adr/0001-*.md` through `0005-*.md` | Accepted normative decisions with historical decision context. |
| REST API | `api/REST_API.md` | Current canonical developer API contract. |
| Redis/state | `audit/REDIS_SCHEMA_CURRENT.md` | Current schema/lifecycle inventory retained at its established path. |
| Authentication | `security/AUTHENTICATED_PLAYER_SESSION.md` | Current session/identity contract. |
| Authorization | `security/GAME_COMMAND_AUTHORIZATION.md` | Current REST/STOMP role policy and matrix. |
| Removed surfaces | `security/DIRECT_MUTATION_CONTAINMENT.md` | Current removal/compatibility record; not an alternate API inventory. |
| Deployment security | `security/DEPLOYMENT_SECURITY.md` | Current canonical production security configuration. |
| Security process | `security/FEATURE_SECURITY_REVIEW_STANDARD.md`, `security/SECURITY_REVIEW_CHECKLIST.md` | Current normative review process. |
| Threat model | `security/THREAT_MODEL_BASELINE.md` | Current threat categories plus explicitly historical pre-revamp evidence. |
| Game lifecycle/rules | `game-rules/CANONICAL_GAME_STATE_MACHINE.md`, `game-rules/RULE_DECISIONS.md`, `game-rules/RULE_STATUS_MATRIX.md` | Current normative game behavior; link rather than duplicate. |
| Performance | `performance/PERFORMANCE_BASELINE.md` | Current measured/provable baseline and retained candidates. |
| Operations | `operations/RUNBOOK.md`, `operations/CURRENT_LIMITATIONS.md` | Current runbook and single residual-limitations register. |
| Frontend | `../sindopoly-front/README.md` | Current frontend orientation; links to API/realtime/deployment contracts. |
| Engineering standards | `engineering/SOFTWARE_ENGINEERING_QUALITY_MODEL.md`, `engineering/CODE_COMMENTING_STANDARD.md` | Current normative standards; audit examples are labeled historical. |
| Revamp execution | `revamp/EXECUTION_BACKLOG.md` | Current canonical frozen dependency/status plan. |
| Cleanup decisions | `revamp/REVAMP_025_CLEANUP_DECISIONS.md` | Historical accepted cleanup evidence. |
| REST audit | `audit/API_INVENTORY.md` | Retained audit inventory; current users follow `api/REST_API.md`. |
| Audit evidence | Other `audit/*.md` files | Historical, intentionally retained pre-revamp evidence; not current instructions. |

No separate Redis Pub/Sub, OpenAPI annotation, cloud deployment, or browser-E2E
document exists because those are not current implemented contracts. Missing
production ingress/secret-manager/rate-limit/browser-E2E capabilities are
tracked in `operations/CURRENT_LIMITATIONS.md`, not duplicated as implied plans.
