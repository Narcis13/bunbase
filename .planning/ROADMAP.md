# Roadmap: BunBase v0.3

## Overview

BunBase v0.3 enables developers to add custom business logic endpoints beyond auto-generated CRUD. Starting with a robust error and context foundation, we build a file-based route system that discovers handlers at build time, integrates them into the server, and embeds them in the compiled binary. Four phases deliver the complete custom API endpoint capability.

## Milestones

- v0.1 MVP (Phases 1-8) - shipped 2026-01-26
- v0.2 User Auth, Files & Realtime (Phases 9-13) - shipped 2026-01-28
- v0.3 Custom API Endpoints (Phases 14-17) - in progress

## Phases

- [x] **Phase 14: Foundation (Context & Errors)** - Error system and RouteContext for custom routes
- [ ] **Phase 15: Route Loading** - File-based route discovery and manifest generation
- [ ] **Phase 16: Server Integration** - Wire custom routes into Bun.serve()
- [ ] **Phase 17: Build Pipeline & Testing** - Binary embedding and verification

## Phase Details

### Phase 14: Foundation (Context & Errors)
**Goal**: Establish the error system and RouteContext interface that all custom routes will use
**Depends on**: Nothing (first phase of v0.3)
**Requirements**: ERR-01, ERR-02, ERR-03, ERR-04, ERR-05, CTX-01, CTX-02, CTX-03, CTX-04, CTX-05, CTX-06, CTX-07, CTX-08
**Success Criteria** (what must be TRUE):
  1. Custom route handlers can throw typed errors (BadRequestError, NotFoundError, etc.) and receive PocketBase-compatible JSON responses
  2. Unhandled exceptions in route handlers return consistent 500 responses without leaking internal details
  3. RouteContext TypeScript interface provides access to db, records, auth, realtime, files, and hooks
  4. Context factory creates properly typed context from initialized BunBase managers
**Plans**: 2 plans

Plans:
- [x] 14-01-PLAN.md — ApiError class hierarchy and handleApiError utility
- [x] 14-02-PLAN.md — RouteContext interface and createRouteContext factory

### Phase 15: Route Loading
**Goal**: Discover and load custom route handlers from routes/ directory with build-time manifest generation
**Depends on**: Phase 14
**Requirements**: RTE-01, RTE-02, RTE-03, RTE-04, RTE-05, RTE-06, RTE-07, RTE-08
**Success Criteria** (what must be TRUE):
  1. Route files in routes/ directory are discovered and converted to API paths (routes/stats.ts -> /api/stats)
  2. Dynamic segments use bracket notation (routes/users/[id].ts -> /api/users/:id)
  3. Named exports (GET, POST) are extracted as route handlers
  4. Build-time manifest generator produces static imports for binary embedding
  5. Validation warns on lowercase method exports (get instead of GET)
**Plans**: TBD

Plans:
- [ ] 15-01: Route Discovery and Path Conversion
- [ ] 15-02: Manifest Generator

### Phase 16: Server Integration
**Goal**: Wire custom routes into BunBase server with context injection and error handling
**Depends on**: Phase 15
**Requirements**: SRV-01, SRV-02, SRV-03, SRV-04, SRV-05, SRV-06
**Success Criteria** (what must be TRUE):
  1. Custom routes are merged into Bun.serve() routes object alongside system routes
  2. Route handlers receive Request and full BunBaseContext as parameters
  3. All custom routes are wrapped with error handling middleware
  4. CLI loads custom routes at startup from generated manifest
  5. Custom routes work in both development mode (with hot reload) and compiled binary
**Plans**: TBD

Plans:
- [ ] 16-01: Route Integration and Context Injection
- [ ] 16-02: CLI and Hot Reload

### Phase 17: Build Pipeline & Testing
**Goal**: Ensure custom routes are embedded in binary and work correctly in both development and production
**Depends on**: Phase 16
**Requirements**: BLD-01, BLD-02, BLD-03, BLD-04, BLD-05, BLD-06
**Success Criteria** (what must be TRUE):
  1. bun run build:routes generates route manifest successfully
  2. bun run build includes route generation step before compilation
  3. Compiled binary includes and serves all custom route handlers
  4. Example health route (routes/health.ts) returns { status: "ok" }
  5. Example stats route uses database context to return collection statistics
  6. Tests verify routes work in both development mode and compiled binary
**Plans**: TBD

Plans:
- [ ] 17-01: Build Scripts and Example Routes
- [ ] 17-02: Binary Embedding Tests

## Progress

**Execution Order:** 14 -> 15 -> 16 -> 17

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 14. Foundation | 2/2 | ✓ Complete | 2026-01-30 |
| 15. Route Loading | 0/2 | Not started | - |
| 16. Server Integration | 0/2 | Not started | - |
| 17. Build Pipeline | 0/2 | Not started | - |

---
*Roadmap created: 2026-01-30*
*Milestone: v0.3 Custom API Endpoints*
