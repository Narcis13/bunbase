---
phase: 15-route-loading
plan: 01
subsystem: api
tags: [typescript, ast, file-routing, path-conversion]

# Dependency graph
requires:
  - phase: 14-foundation-context-errors
    provides: RouteContext and error handling patterns
provides:
  - filePathToRoutePath: file-to-route path conversion
  - generateImportName: safe JavaScript identifier generation
  - parseRouteExports: TypeScript AST export detection
  - VALID_METHODS: canonical HTTP method list
affects: [15-02-PLAN, scripts/build-routes.ts, route manifest generation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - TypeScript Compiler API for AST parsing
    - File-based routing with [param] to :param conversion

key-files:
  created:
    - src/routes/discovery.ts
    - src/routes/discovery.test.ts
  modified: []

key-decisions:
  - "ts.createSourceFile for export parsing: More robust than regex, handles comments and strings"
  - "Bracket notation [param] to colon :param: Matches Bun.serve pattern requirements"
  - "VALID_METHODS as const array: Type-safe, reusable across build scripts"

patterns-established:
  - "Route file parsing uses TypeScript Compiler API, not regex"
  - "Import names use $ for dynamic params: route_users_$id"
  - "Lowercase method exports produce warnings, not errors"

# Metrics
duration: 3m 6s
completed: 2026-01-30
---

# Phase 15 Plan 01: Route Discovery Utilities Summary

**TypeScript AST-based route discovery with path conversion, import name generation, and HTTP method export validation**

## Performance

- **Duration:** 3m 6s
- **Started:** 2026-01-30T17:05:59Z
- **Completed:** 2026-01-30T17:09:05Z
- **Tasks:** 3 (TDD: test, feat, fix)
- **Files created:** 2

## Accomplishments

- Created filePathToRoutePath converting file paths to API routes with [param] to :param conversion
- Created generateImportName producing valid JavaScript identifiers from paths
- Created parseRouteExports using TypeScript Compiler API to detect HTTP method exports
- Implemented warnings for lowercase method exports (get -> "Use uppercase GET")
- Full test coverage with 36 tests covering edge cases (comments, strings, Windows paths)

## Task Commits

Each task was committed atomically:

1. **RED: Add failing tests** - `8449244` (test)
2. **GREEN: Implement discovery utilities** - `f9ce3e7` (feat)
3. **FIX: TypeScript type issues in tests** - `4110b70` (fix)

## Files Created

- `src/routes/discovery.ts` (224 lines) - Route discovery and path conversion utilities
  - `filePathToRoutePath()` - File path to API route conversion
  - `generateImportName()` - Valid JS identifier generation
  - `parseRouteExports()` - TypeScript AST export detection
  - `VALID_METHODS` - Canonical HTTP method list
- `src/routes/discovery.test.ts` (274 lines) - Comprehensive test coverage
  - Simple routes, index files, dynamic parameters
  - Windows path support
  - Export detection (const, function, async)
  - Lowercase method warnings
  - Edge cases (comments, strings, empty files)

## Decisions Made

1. **TypeScript Compiler API over regex** - AST parsing correctly handles comments, strings, and all valid TypeScript syntax. Regex would miss edge cases like `// export const GET` in comments.

2. **$ prefix for dynamic segments in import names** - Using `route_users_$id` makes it clear which parts are dynamic while producing valid JavaScript identifiers.

3. **Warnings not errors for lowercase methods** - Lowercase methods (get, post) produce warnings but don't break the build. This provides developer feedback without being overly strict.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

1. **Root index file edge case** - Initial implementation didn't handle `routes/index.ts` -> `/api` correctly. The regex `/\/index$/` only matched nested index files. Fixed by adding explicit check for `route === 'index'`.

2. **TypeScript strict mode in tests** - Array access `warnings[0]` flagged as possibly undefined. Fixed with non-null assertions after length checks.

## Next Phase Readiness

- Route discovery utilities complete and tested
- Ready for 15-02-PLAN: Build script that uses these utilities to generate route manifest
- VALID_METHODS and parseRouteExports available for build script import

---
*Phase: 15-route-loading*
*Completed: 2026-01-30*
