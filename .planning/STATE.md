# Project State: BunBase

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-30)

**Core value:** Ship a working backend-in-a-box that compiles to a single binary and auto-generates REST APIs from schema definitions
**Current focus:** v0.3 Phase 17 - Build Pipeline & Testing

## Current Position

Phase: 17 of 17 (Build Pipeline & Testing) - IN PROGRESS
Plan: 1 of 2 complete
Status: Plan 17-01 complete, ready for Plan 17-02
Last activity: 2026-01-30 - Completed 17-01-PLAN.md (route manifest and dev mode tests)

Progress: [####################################--------] 87%

## Current Milestone: v0.3 - Custom API Endpoints

**Goal:** Enable developers to add custom business logic endpoints beyond auto-generated CRUD

**Phases:**
- Phase 14: Foundation (Context & Errors) - COMPLETE
- Phase 15: Route Loading - COMPLETE (2/2 plans)
- Phase 16: Server Integration - COMPLETE (2/2 plans)
- Phase 17: Build Pipeline & Testing - IN PROGRESS (1/2 plans)

**Total:** 27 requirements across 4 phases, 8 plans

## Performance Metrics

**Velocity:**
- Total plans completed: 7 (v0.3)
- Average duration: 2m 53s
- Total execution time: 0.34 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 14 | 2/2 | 7m 11s | 3m 36s |
| 15 | 2/2 | 5m 41s | 2m 51s |
| 16 | 2/2 | 5m 00s | 2m 30s |
| 17 | 1/2 | 2m 00s | 2m 00s |

*Updated after each plan completion*

## Accumulated Context

### Decisions

| ID | Choice | Rationale | Phase |
|----|--------|-----------|-------|
| error-format-pocketbase | Use PocketBase { code, message, data } format | API compatibility with existing PocketBase clients | 14-01 |
| dev-mode-detection | Check NODE_ENV and BUNBASE_DEV env vars | Standard NODE_ENV plus BunBase-specific flag | 14-01 |
| no-error-dependencies | Custom Error classes without http-errors | Type-safe, zero dependencies, smaller bundle | 14-01 |
| records-api-hooks | RecordsAPI wraps hook-aware functions | Ensures hooks fire on all CRUD operations | 14-02 |
| require-admin-throws | AuthAPI.requireAdmin throws UnauthorizedError | Consistent error handling via withErrorHandling | 14-02 |
| context-deps-minimal | ContextDependencies only has hooks+realtime | getDatabase() called internally for simplicity | 14-02 |
| ts-compiler-api | Use TypeScript Compiler API for export parsing | More robust than regex, handles comments and strings | 15-01 |
| bracket-to-colon | [param] -> :param for Bun.serve compatibility | Matches Bun.serve dynamic parameter syntax | 15-01 |
| lowercase-warnings | Lowercase methods produce warnings not errors | Developer feedback without breaking builds | 15-01 |
| generated-file-gitignored | src/routes-generated.ts not committed | Regenerated at build time, ensures fresh routes | 15-02 |
| custom-routes-merge-order | Custom routes spread after system routes, before admin routes | Ensures admin wildcard doesn't intercept custom routes | 16-01 |
| dev-mode-dual-env | Check both NODE_ENV and BUNBASE_DEV for development detection | Flexibility with standard and BunBase-specific flags | 16-01 |
| cli-managers-shared | CLI creates HookManager/RealtimeManager and passes to both buildCustomRoutes and startServer | Same instances used throughout for dependency injection | 16-02 |
| test-port-8097 | Use port 8097 for routes tests | Avoid conflicts with server.test.ts on port 8091 | 17-01 |
| spawnsync-build-test | Use Bun.spawnSync to test build:routes script | Tests actual script execution, not just module imports | 17-01 |

### Pending Todos

None.

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-01-30 22:07 UTC
Stopped at: Completed 17-01-PLAN.md
Resume file: None

## Phase Commits

| Phase | First Commit | Phase Directory | Recorded |
|-------|--------------|-----------------|----------|
| 14-01 | 4d33e6b | .planning/phases/14-foundation-context-errors/ | 2026-01-30 |
| 14-02 | 46563f8 | .planning/phases/14-foundation-context-errors/ | 2026-01-30 |
| 15-01 | 8449244 | .planning/phases/15-route-loading/ | 2026-01-30 |
| 15-02 | 16ff5b6 | .planning/phases/15-route-loading/ | 2026-01-30 |
| 16-01 | 7ccfbc0 | .planning/phases/16-server-integration/ | 2026-01-30 |
| 16-02 | 2cfe864 | .planning/phases/16-server-integration/ | 2026-01-30 |
| 17-01 | fb5dfb0 | .planning/phases/17-build-pipeline-testing/ | 2026-01-30 |

---
*State updated: 2026-01-30 after 17-01-PLAN.md completion*
