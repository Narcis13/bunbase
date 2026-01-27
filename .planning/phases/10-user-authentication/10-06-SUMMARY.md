---
phase: 10-user-authentication
plan: 06
subsystem: auth
tags: [jwt, middleware, authorization, rules, access-control]

# Dependency graph
requires:
  - phase: 10-03
    provides: User JWT infrastructure (verifyUserToken, getUserById)
provides:
  - requireUser middleware for protected routes
  - optionalUser middleware for optional auth
  - Collection-level auth rules evaluation engine
  - Auth-aware record CRUD operations
affects: [all-phases-using-public-api, file-uploads, realtime]

# Tech tracking
tech-stack:
  added: []
  patterns: [rule-evaluation-engine, auth-context-pattern]

key-files:
  created:
    - src/auth/rules.ts
    - src/auth/rules.test.ts
  modified:
    - src/auth/middleware.ts
    - src/auth/middleware.test.ts
    - src/core/records.ts
    - src/api/server.ts

key-decisions:
  - "Rule semantics: null = admin only, '' = public, string = expression"
  - "Auth context undefined = skip checks (backward compatible for CLI)"
  - "Public API enforces rules, admin API bypasses rules"
  - "Access denied returns 403, not 401"

patterns-established:
  - "RecordAuthContext: { isAdmin: boolean, user: AuthenticatedUser | null }"
  - "Rule expressions: @request.auth.id, @request.body, record fields"
  - "optionalUser pattern for routes that work with or without auth"

# Metrics
duration: 18min
completed: 2026-01-27
---

# Phase 10 Plan 06: Authenticated Routes Summary

**User auth middleware with requireUser/optionalUser and PocketBase-style collection auth rules with @request.auth context**

## Performance

- **Duration:** 18 min
- **Started:** 2026-01-27T16:51:38Z
- **Completed:** 2026-01-27T17:10:00Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments
- User auth middleware: requireUser (401 on failure), optionalUser (null on failure)
- Rule evaluation engine supporting @request.auth, @request.body, record fields
- Logical operators (&&, ||) and comparison operators (=, !=, >, <, >=, <=)
- Auth-aware record CRUD that enforces collection rules on public API

## Task Commits

Each task was committed atomically:

1. **Task 1: Add user auth middleware** - `c19e82f` (feat)
2. **Task 2: Create rule evaluation engine** - `b0eae9a` (feat)
3. **Task 3: Integrate auth rules into record operations** - `03d2550` (feat)

## Files Created/Modified
- `src/auth/middleware.ts` - Added requireUser, optionalUser, AuthenticatedUser
- `src/auth/middleware.test.ts` - Tests for user auth middleware
- `src/auth/rules.ts` - Rule evaluation engine (evaluateRule, getRuleForOperation)
- `src/auth/rules.test.ts` - Comprehensive rule evaluation tests
- `src/core/records.ts` - RecordAuthContext, checkRuleAccess, auth-aware CRUD
- `src/api/server.ts` - Public routes now pass auth context
- `src/api/hooks.test.ts` - Updated to use public rules for testing
- `src/api/server.test.ts` - Updated to use public rules for testing

## Decisions Made
- **Rule semantics:** null = admin only (locked), '' = public, string = expression
- **Auth context undefined:** Skip checks for backward compatibility (CLI/internal use)
- **Access denied status:** 403 Forbidden (not 401 which implies auth needed)
- **Rule evaluation order:** Admin bypass checked first, then null/empty/expression

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated existing tests to use public rules**
- **Found during:** Task 3 (Integration testing)
- **Issue:** Existing server.test.ts and hooks.test.ts failed because collections now default to admin-only access
- **Fix:** Updated test files to create collections with public rules ({ listRule: '', viewRule: '', ... })
- **Files modified:** src/api/server.test.ts, src/api/hooks.test.ts
- **Verification:** All 328 tests pass
- **Committed in:** 03d2550 (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Test update was necessary for existing tests to work with new auth enforcement. No scope creep.

## Issues Encountered
None - implementation proceeded smoothly.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 10 complete: All user authentication plans executed
- Ready for Phase 11 (File Uploads) or Phase 12 (Realtime/SSE)
- Collection rules can be set via admin API to control access

---
*Phase: 10-user-authentication*
*Completed: 2026-01-27*
