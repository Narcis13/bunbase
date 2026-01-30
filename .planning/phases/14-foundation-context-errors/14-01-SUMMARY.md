---
phase: 14
plan: 01
subsystem: api
tags: [errors, api, typescript]

dependency-graph:
  requires: []
  provides:
    - ApiError class hierarchy
    - handleApiError() utility function
    - PocketBase-compatible error format
  affects:
    - Plan 14-02 (RouteContext will use these errors)
    - Phase 15 (route loading will use error handling)
    - Phase 16 (server integration error responses)

tech-stack:
  added: []
  patterns:
    - Error class hierarchy with TypeScript extends
    - Object.setPrototypeOf for proper instanceof checks
    - Bun.env for dev/prod mode detection

key-files:
  created:
    - src/api/errors.ts
    - src/api/errors.test.ts
  modified: []

decisions:
  - id: error-format-pocketbase
    choice: Use PocketBase { code, message, data } format
    reason: API compatibility with existing PocketBase clients and conventions
  - id: dev-mode-detection
    choice: Check NODE_ENV and BUNBASE_DEV env vars
    reason: Standard NODE_ENV plus BunBase-specific flag for flexibility
  - id: no-error-dependencies
    choice: Custom Error classes without http-errors package
    reason: Type-safe, zero dependencies, smaller bundle

metrics:
  duration: 2m 11s
  completed: 2026-01-30
---

# Phase 14 Plan 01: API Error Classes Summary

**One-liner:** ApiError class hierarchy with 6 HTTP error types producing PocketBase-compatible `{ code, message, data }` JSON responses

## What Was Built

Created a complete error handling system for BunBase custom routes:

1. **ApiError base class** - Extends Error with `code`, `message`, `data` properties. Provides `toJSON()` for serialization and `toResponse()` for HTTP responses.

2. **Error subclasses** (6 types):
   - `BadRequestError` (400) - invalid input, malformed JSON
   - `UnauthorizedError` (401) - missing/invalid authentication
   - `ForbiddenError` (403) - insufficient permissions
   - `NotFoundError` (404) - resource doesn't exist
   - `ConflictError` (409) - duplicate resource
   - `ValidationFailedError` (422) - validation failed with field errors

3. **handleApiError() function** - Central error handler that:
   - Returns ApiError instances as proper HTTP responses
   - Logs unexpected errors with `console.error`
   - Hides internal error details in production (generic "Internal server error")
   - Exposes error.message in development mode for debugging

## Key Implementation Details

```typescript
// Error format matches PocketBase API
const json = {
  code: 400,
  message: "Validation failed",
  data: {
    email: { code: "invalid_email", message: "Invalid email format" }
  }
};
```

Dev mode detection uses both standard `NODE_ENV=development` and BunBase-specific `BUNBASE_DEV=true` environment variables.

## Test Coverage

48 tests covering:
- Constructor, toJSON(), toResponse() for all error classes
- Default messages and custom message overrides
- instanceof checks (all subclasses are instanceof ApiError)
- handleApiError() behavior in production vs development
- Console logging of unexpected errors
- Edge cases (null, undefined, string errors)

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Error format | PocketBase `{ code, message, data }` | Client compatibility, familiar to PocketBase users |
| Dev detection | `NODE_ENV` + `BUNBASE_DEV` | Standard pattern plus BunBase-specific override |
| Dependencies | Zero (custom classes only) | Type-safe, smaller bundle, no version conflicts |

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Hash | Type | Description |
|------|------|-------------|
| 4d33e6b | feat | Create ApiError class hierarchy |
| fac9f1b | test | Add comprehensive tests for error system |
| e8de080 | docs | Add JSDoc examples for all error classes |

## Next Phase Readiness

**Required for Plan 14-02 (RouteContext):**
- UnauthorizedError is ready for auth.requireAdmin() implementation
- All error types available for context API methods

**No blockers identified.**
