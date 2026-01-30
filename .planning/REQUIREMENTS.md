# Requirements: BunBase v0.3

**Defined:** 2026-01-30
**Core Value:** Enable developers to add custom business logic endpoints beyond auto-generated CRUD

## v1 Requirements

Requirements for v0.3 milestone. Each maps to roadmap phases.

### Error System (ERR)

- [x] **ERR-01**: All API endpoints return PocketBase-compatible error format `{ code, message, data }`
- [x] **ERR-02**: ApiError class hierarchy exists with common error types (BadRequest, Unauthorized, NotFound, Forbidden, Validation)
- [x] **ERR-03**: Error factory helpers allow throwing typed errors (`throw new BadRequestError(message)`)
- [x] **ERR-04**: Unhandled errors in route handlers are caught and return consistent 500 response
- [x] **ERR-05**: Error messages in production hide internal details (stack traces, SQL, paths)

### Route Context (CTX)

- [x] **CTX-01**: RouteContext TypeScript interface defines all available context
- [x] **CTX-02**: Context provides database access via `ctx.db`
- [x] **CTX-03**: Context provides records API via `ctx.records` (get, list, create, update, delete)
- [x] **CTX-04**: Context provides auth helpers via `ctx.auth` (buildContext, requireAdmin, optionalUser)
- [x] **CTX-05**: Context provides realtime access via `ctx.realtime`
- [x] **CTX-06**: Context provides file storage via `ctx.files`
- [x] **CTX-07**: Context provides hook system via `ctx.hooks`
- [x] **CTX-08**: Context factory function creates context from initialized managers

### Route Loading (RTE)

- [x] **RTE-01**: Routes are defined in `routes/` directory with TypeScript files
- [x] **RTE-02**: Route path is derived from file path (`routes/stats.ts` → `/api/stats`)
- [x] **RTE-03**: Dynamic segments use bracket notation (`routes/users/[id].ts` → `/api/users/:id`)
- [x] **RTE-04**: Export named handlers for HTTP methods (`export const GET`, `export const POST`)
- [x] **RTE-05**: Route manifest generator scans routes/ and generates static imports
- [x] **RTE-06**: Generated routes file contains all route modules with correct paths
- [x] **RTE-07**: Build script runs route generation before compilation
- [x] **RTE-08**: Validation warns if route exports lowercase method names (get vs GET)

### Server Integration (SRV)

- [x] **SRV-01**: Custom routes are merged into Bun.serve() routes object
- [x] **SRV-02**: Route handlers receive request and BunBaseContext as parameters
- [x] **SRV-03**: All handlers are wrapped with error handling middleware
- [x] **SRV-04**: CLI loads custom routes at startup and passes to server
- [x] **SRV-05**: Custom routes work in development mode with hot reload
- [x] **SRV-06**: Custom routes work in compiled binary

### Build & Testing (BLD)

- [x] **BLD-01**: `bun run build:routes` generates route manifest
- [x] **BLD-02**: `bun run build` includes route generation step
- [x] **BLD-03**: Compiled binary includes all custom route handlers
- [x] **BLD-04**: Example health route exists (`routes/health.ts`) that returns `{ status: "ok" }`
- [x] **BLD-05**: Example stats route exists that uses database context
- [x] **BLD-06**: Tests verify routes work in both development and compiled binary

## Future Requirements

Deferred beyond v0.3. Tracked but not in current roadmap.

### Extended Methods

- **EXT-01**: Support PUT method for update operations
- **EXT-02**: Support PATCH method for partial updates
- **EXT-03**: Support DELETE method for delete operations

### Route Middleware

- **MID-01**: Per-route middleware exports (`export const middleware`)
- **MID-02**: Middleware chains for complex auth scenarios
- **MID-03**: Route-level rate limiting

### Request Validation

- **VAL-01**: Automatic Zod schema validation for request bodies
- **VAL-02**: Query parameter validation helpers
- **VAL-03**: Type-safe params extraction

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| PUT/PATCH/DELETE methods | GET/POST handle 95% of cases; add complexity without proportional value |
| Middleware chains | Complex to implement and debug; single auth check per route is sufficient |
| GraphQL endpoints | Different paradigm; users wanting GraphQL can build it themselves |
| WebSocket routes | SSE already covers realtime; WebSockets add significant complexity |
| Hot reload in binary | Fundamental limitation of compiled binaries; acceptable for BaaS |
| Runtime route registration | Routes must be embedded at build time for single binary |
| Automatic CORS | Different needs per deployment; users can configure in their routes |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ERR-01 | Phase 14 | Complete |
| ERR-02 | Phase 14 | Complete |
| ERR-03 | Phase 14 | Complete |
| ERR-04 | Phase 14 | Complete |
| ERR-05 | Phase 14 | Complete |
| CTX-01 | Phase 14 | Complete |
| CTX-02 | Phase 14 | Complete |
| CTX-03 | Phase 14 | Complete |
| CTX-04 | Phase 14 | Complete |
| CTX-05 | Phase 14 | Complete |
| CTX-06 | Phase 14 | Complete |
| CTX-07 | Phase 14 | Complete |
| CTX-08 | Phase 14 | Complete |
| RTE-01 | Phase 15 | Complete |
| RTE-02 | Phase 15 | Complete |
| RTE-03 | Phase 15 | Complete |
| RTE-04 | Phase 15 | Complete |
| RTE-05 | Phase 15 | Complete |
| RTE-06 | Phase 15 | Complete |
| RTE-07 | Phase 15 | Complete |
| RTE-08 | Phase 15 | Complete |
| SRV-01 | Phase 16 | Complete |
| SRV-02 | Phase 16 | Complete |
| SRV-03 | Phase 16 | Complete |
| SRV-04 | Phase 16 | Complete |
| SRV-05 | Phase 16 | Complete |
| SRV-06 | Phase 16 | Complete |
| BLD-01 | Phase 17 | Complete |
| BLD-02 | Phase 17 | Complete |
| BLD-03 | Phase 17 | Complete |
| BLD-04 | Phase 17 | Complete |
| BLD-05 | Phase 17 | Complete |
| BLD-06 | Phase 17 | Complete |

**Coverage:**
- v0.3 requirements: 27 total
- Mapped to phases: 27
- Unmapped: 0 ✓

---
*Requirements defined: 2026-01-30*
*Last updated: 2026-01-31 after Phase 17 complete*
