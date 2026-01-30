---
phase: 14-foundation-context-errors
plan: 02
subsystem: api
tags: [context, dependency-injection, typescript-interfaces, route-handlers]

# Dependency graph
requires:
  - phase: 14-01
    provides: ApiError class hierarchy and handleApiError function
provides:
  - RouteContext interface for custom route handlers
  - ContextDependencies interface for hooks and realtime managers
  - RecordsAPI interface wrapping hook-aware CRUD operations
  - AuthAPI interface with buildContext, optionalUser, requireAdmin
  - FilesAPI interface wrapping storage functions
  - createRouteContext factory function
affects: [15-route-loading, 16-server-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Context injection for route handlers
    - Interface-based API abstraction
    - Factory function pattern for context creation

key-files:
  created:
    - src/api/context.ts
    - src/api/context.test.ts
  modified: []

key-decisions:
  - "RecordsAPI wraps hook-aware functions (createRecordWithHooks etc.) not direct record functions"
  - "AuthAPI.requireAdmin throws UnauthorizedError instead of returning Response for consistent error handling"
  - "ContextDependencies takes hooks and realtime but not db (getDatabase() called internally)"

patterns-established:
  - "RouteContext pattern: ctx.db for raw SQL, ctx.records for hook-aware CRUD"
  - "AuthAPI.requireAdmin throws errors, AuthAPI.optionalUser returns null"
  - "FilesAPI provides collection/recordId/filename signature consistently"

# Metrics
duration: 5min
completed: 2026-01-30
---

# Phase 14 Plan 02: RouteContext Interface Summary

**RouteContext interface with RecordsAPI, AuthAPI, FilesAPI providing type-safe access to all BunBase capabilities for custom route handlers**

## Performance

- **Duration:** 5 min
- **Started:** 2026-01-30T16:33:55Z
- **Completed:** 2026-01-30T16:38:55Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments
- Created RouteContext interface exposing db, records, auth, realtime, files, hooks
- Implemented RecordsAPI wrapping hook-aware CRUD operations
- Implemented AuthAPI with buildContext, optionalUser, requireAdmin (throws UnauthorizedError)
- Implemented FilesAPI wrapping storage functions
- Created createRouteContext factory function
- Added 26 tests covering all RouteContext functionality

## Task Commits

Each task was committed atomically:

1. **Task 1: Create RouteContext interface and supporting types** - `46563f8` (feat)
2. **Task 2: Implement API factory functions and createRouteContext** - Combined with Task 1
3. **Task 3: Add tests for RouteContext factory** - `04f3447` (test)

## Files Created/Modified
- `src/api/context.ts` - RouteContext interface, API interfaces, createRouteContext factory
- `src/api/context.test.ts` - 26 tests for context creation and API methods

## Decisions Made
- **RecordsAPI uses hook-aware functions:** All mutating operations go through createRecordWithHooks, updateRecordWithHooks, deleteRecordWithHooks to ensure hooks fire consistently
- **AuthAPI.requireAdmin throws UnauthorizedError:** Instead of returning a Response like the middleware does, the API throws an error for consistent error handling in custom routes (errors are caught by withErrorHandling wrapper from 14-01)
- **getDatabase() called inside factory:** ContextDependencies only requires hooks and realtime; database is obtained via getDatabase() inside createRouteContext for simplicity

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- RouteContext interface ready for route loading in Phase 15
- API interfaces can be imported by custom route handlers
- Error handling (14-01) + Context (14-02) complete foundation for custom routes
- No blockers identified

---
*Phase: 14-foundation-context-errors*
*Plan: 02*
*Completed: 2026-01-30*
