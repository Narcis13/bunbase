# Project State: BunBase

## Project Reference

See: .planning/PROJECT.md (updated 2025-01-24)

**Core value:** Ship a working backend-in-a-box that compiles to a single binary and auto-generates REST APIs from schema definitions
**Current focus:** Phase 6 in progress - Admin UI Records

## Current Position

Phase: 6 of 8 (Admin UI Records)
Plan: 1 of 5 in current phase
Status: In progress
Last activity: 2026-01-25 - Completed 06-01-PLAN.md

Progress: [====================] 46% (11/24 plans)

## Performance Metrics

**Velocity:**
- Total plans completed: 11
- Average duration: 3m 20s
- Total execution time: 37m 38s

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-core-foundation | 3 | 10m 47s | 3m 35s |
| 02-rest-api-generation | 1 | 2m | 2m |
| 03-query-capabilities | 2 | 6m 23s | 3m 11s |
| 04-lifecycle-hooks | 2 | 6m 28s | 3m 14s |
| 05-admin-authentication | 2 | 5m | 2m 30s |
| 06-admin-ui-records | 1 | 7m | 7m |

**Recent Trend:**
- Last 5 plans: 04-02 (4m), 05-01 (2m), 05-02 (3m), 06-01 (7m)
- Trend: UI plan took longer due to many component files

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Use bun:sqlite directly with strict: true for parameter safety
- Store schema in _collections/_fields tables, not code files (schema-in-database pattern)
- Use nanoid for 21-char URL-safe IDs instead of UUID
- Map all field types to TEXT except number (REAL) and boolean (INTEGER)
- Use 12-step shadow table migration for column removal and type changes
- Integrate migrations module with schema manager (not inline SQL)
- Throw errors for not-found resources rather than silent nulls
- Validators exclude system fields (handled by records module)
- Relation validation checks both collection and record existence
- JSON fields stored as strings in SQLite for portability
- Partial validation for updates (required fields made optional)
- Use Bun.serve() routes object for declarative HTTP routing
- Error mapping: not found->404, validation failed->400, already exists->409
- List endpoint returns {items, totalItems} object format
- DELETE returns 204 No Content with null body
- URL operators parsed from key suffix (field> becomes operator >) due to URL splitting on =
- System fields (id, created_at, updated_at) always valid for filtering/sorting
- LIKE escapes %, _, \\ characters using ESCAPE '\\' clause
- Pagination is 1-indexed with offset = (page - 1) * perPage
- perPage bounded: min 1, max 500, default 30
- Expand object only added to records that have expanded relations (not empty)
- Single ! suffix handles != operator due to URL splitting on =
- Graceful skip for missing collections/records during expansion
- Use PocketBase-style middleware pattern with next() for hook chaining
- Global handlers (undefined collection) run for all collections
- Handlers execute in registration order (FIFO)
- Not calling next() silently stops chain (no error)
- Throwing in handler stops chain and propagates error
- Default error status 400 for application errors (was 500)
- Request context built from Request (method, path, headers)
- After hooks swallow errors (console.error only)
- Use Bun.password.hash with argon2id algorithm for admin passwords
- JWT tokens use HS256 with 24h expiry via jose library
- JWT_SECRET environment variable required (fail fast if missing)
- requireAdmin returns Admin | Response union type for middleware pattern
- Auth routes under /_/api/auth namespace
- Initial admin: admin@bunbase.local with generated password if BUNBASE_ADMIN_PASSWORD not set
- Use Tailwind CSS v4 with CSS-based configuration (not tailwind.config.js)
- Use shadcn/ui copy-paste pattern (not npm package)
- Use @/* path alias for component imports
- Serve admin at /_/ routes to match existing auth routes

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-01-25
Stopped at: Completed 06-01-PLAN.md
Resume file: None
