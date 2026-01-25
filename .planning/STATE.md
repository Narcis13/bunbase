# Project State: BunBase

## Project Reference

See: .planning/PROJECT.md (updated 2025-01-24)

**Core value:** Ship a working backend-in-a-box that compiles to a single binary and auto-generates REST APIs from schema definitions
**Current focus:** Phase 4 - Lifecycle Hooks

## Current Position

Phase: 4 of 8 (Lifecycle Hooks)
Plan: 0 of 2 in current phase (not started)
Status: Ready to plan
Last activity: 2025-01-25 - Phase 3 verified and complete

Progress: [=========           ] 25% (6/24 plans)

## Performance Metrics

**Velocity:**
- Total plans completed: 6
- Average duration: 3m 10s
- Total execution time: 19m 10s

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-core-foundation | 3 | 10m 47s | 3m 35s |
| 02-rest-api-generation | 1 | 2m | 2m |
| 03-query-capabilities | 2 | 6m 23s | 3m 11s |

**Recent Trend:**
- Last 5 plans: 01-03 (4m 49s), 02-01 (2m), 03-01 (3m 11s), 03-02 (3m 12s)
- Trend: Stable around 3m per plan

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

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2025-01-25
Stopped at: Phase 3 complete and verified
Resume file: None
