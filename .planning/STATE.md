# Project State: BunBase

## Project Reference

See: .planning/PROJECT.md (updated 2025-01-24)

**Core value:** Ship a working backend-in-a-box that compiles to a single binary and auto-generates REST APIs from schema definitions
**Current focus:** Phase 8 - Single Binary Packaging

## Current Position

Phase: 8 of 8 (Single Binary Packaging)
Plan: 1 of 2 in current phase
Status: In progress
Last activity: 2026-01-26 - Completed 08-01-PLAN.md

Progress: [====================================] 83% (20/24 plans)

## Performance Metrics

**Velocity:**
- Total plans completed: 20
- Average duration: 2m 45s
- Total execution time: 55m 17s

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-core-foundation | 3 | 10m 47s | 3m 35s |
| 02-rest-api-generation | 1 | 2m | 2m |
| 03-query-capabilities | 2 | 6m 23s | 3m 11s |
| 04-lifecycle-hooks | 2 | 6m 28s | 3m 14s |
| 05-admin-authentication | 2 | 5m | 2m 30s |
| 06-admin-ui-records | 5 | 14m 18s | 2m 51s |
| 07-admin-ui-schema-editor | 4 | 9m 18s | 2m 19s |
| 08-single-binary-packaging | 1 | 1m 3s | 1m 3s |

**Recent Trend:**
- Last 5 plans: 07-02 (1m 45s), 07-03 (2m 33s), 07-04 (3m), 08-01 (1m 3s)
- Trend: Fast execution continues

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
- State-based routing using React useState instead of router library
- Collections grouped as system (prefixed with _) vs user in sidebar
- Record count displayed as badge on each collection in sidebar
- Dashboard separates system collections (smaller section at bottom) from user collections (main grid)
- Dashboard uses navigation callback prop for collection card clicks
- TanStack Table for headless data table with dynamic columns
- Fields fetched via separate endpoint for column generation
- 30 records per page default with pagination controls
- DynamicField handles all 6 field types with appropriate inputs
- RecordSheet contains RecordForm in slide-over panel
- RecordsView self-contained for all CRUD operations
- Select component follows shadcn copy-paste pattern with Radix primitives
- Schema API functions use existing fetchWithAuth pattern
- useSchema hook provides fields/loading/error/refetch interface
- Field type badges use color coding for visual distinction
- FieldForm validates reserved names (id, created_at, updated_at)
- Relation target selector filters out current collection
- onRefreshCollections callback pattern for sidebar updates after field mutations
- CreateCollectionSheet validates collection name (alphanumeric + underscore, no _ prefix)
- Settings icon shows on collection hover for schema editor access
- Creating collection navigates directly to schema editor
- Schema view state added to App.tsx routing
- Use Node's util.parseArgs for zero-dependency CLI argument parsing
- Use Bun.argv.slice(2) for argument array (skip bun and script path)
- Exit code 1 for invalid arguments with clean error message

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-01-26
Stopped at: Completed 08-01-PLAN.md (CLI entry point)
Resume file: None
