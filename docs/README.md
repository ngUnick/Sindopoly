# Sindopoly documentation index

This index identifies the current source of truth for each operational contract.
Documents under `docs/audit/` preserve pre-revamp evidence unless a file is
explicitly named below as current. Historical observations are not instructions
and do not override current source, accepted ADRs, or canonical contracts.
The file-by-file classification is recorded in
[DOCUMENTATION_INVENTORY.md](DOCUMENTATION_INVENTORY.md).

## Start and verify

- [Windows/Docker workflow](getting-started/WINDOWS_DOCKER_DEVELOPMENT.md)
- [Local verification](development/LOCAL_VERIFICATION.md)
- [CI verification](development/CI_VERIFICATION.md)
- [Integration testing](development/INTEGRATION_TESTING.md)
- [Operations runbook](operations/RUNBOOK.md)
- [Current limitations](operations/CURRENT_LIMITATIONS.md)

## Architecture and data ownership

- [Current architecture](architecture/CURRENT_ARCHITECTURE.md)
- [Target command boundaries](architecture/TARGET_COMMAND_BOUNDARIES.md)
- [Authoritative transitions](architecture/AUTHORITATIVE_GAME_TRANSITIONS.md)
- [Transition-safe lifecycle](architecture/TRANSITION_SAFE_GAME_LIFECYCLE.md)
- [Realtime synchronization](architecture/REALTIME_SYNCHRONIZATION.md)
- [MariaDB/Flyway ownership](architecture/DATABASE_MIGRATION_OWNERSHIP.md)
- [Accepted ADRs](architecture/adr/)
- [Current Redis schema](audit/REDIS_SCHEMA_CURRENT.md)

## Public and game contracts

- [REST API](api/REST_API.md)
- [Canonical game state machine](game-rules/CANONICAL_GAME_STATE_MACHINE.md)
- [Rule decisions](game-rules/RULE_DECISIONS.md)
- [Rule status matrix](game-rules/RULE_STATUS_MATRIX.md)
- [Authenticated session](security/AUTHENTICATED_PLAYER_SESSION.md)
- [Game authorization](security/GAME_COMMAND_AUTHORIZATION.md)
- [Deployment security](security/DEPLOYMENT_SECURITY.md)

## Standards and planning

- [Engineering standards](engineering/) and [security checklist](security/SECURITY_REVIEW_CHECKLIST.md)
- [Execution backlog](revamp/EXECUTION_BACKLOG.md)
- [Performance baseline](performance/PERFORMANCE_BASELINE.md)

## Historical evidence

Other files under `docs/audit/` are dated audit snapshots retained for
traceability. They may name removed services, endpoints, Redis discovery
patterns, configuration, or defects. Use them to understand why a decision was
made, not to determine current behavior. `docs/audit/REVAMP_BACKLOG.md` is the
audit-era source record; `docs/revamp/EXECUTION_BACKLOG.md` controls execution.
