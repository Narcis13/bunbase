# Roadmap: BunBase v0.1

**Created:** 2025-01-24
**Phases:** 8
**Requirements:** 44 mapped

## Overview

BunBase delivers a backend-in-a-box alternative to PocketBase. The roadmap builds from database foundation through API generation, query capabilities, hooks, authentication, admin UI, and finally single-binary packaging. Each phase delivers a coherent, verifiable capability that builds on the previous phases.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 1: Core Foundation** - Database layer, schema manager, and all field types
- [x] **Phase 2: REST API Generation** - Auto-generated CRUD endpoints for collections
- [x] **Phase 3: Query Capabilities** - Filtering, sorting, pagination, and relation expansion
- [x] **Phase 4: Lifecycle Hooks** - Before/after CRUD hooks with cancellation support
- [ ] **Phase 5: Admin Authentication** - JWT-based admin login and route protection
- [ ] **Phase 6: Admin UI Records** - Collection browser with record CRUD operations
- [ ] **Phase 7: Admin UI Schema Editor** - Runtime schema editing through web interface
- [ ] **Phase 8: Single Binary Packaging** - Compile to standalone executable with embedded UI

## Phase Details

### Phase 1: Core Foundation
**Goal**: Establish the database layer and schema system that all other phases depend on
**Depends on**: Nothing (first phase)
**Requirements**: SCHM-01, SCHM-02, SCHM-03, SCHM-04, SCHM-05, SCHM-06, SCHM-07, SCHM-08, SCHM-09, SCHM-10, SCHM-11, SCHM-12, SCHM-13
**Success Criteria** (what must be TRUE):
  1. Developer can create a collection with fields via API and see it persisted in SQLite
  2. Developer can update a collection schema (add/modify/remove fields) without data loss
  3. Records automatically receive id, created_at, and updated_at fields without explicit definition
  4. Field values are rejected when they violate type constraints or required rules
  5. Relation fields reference records in other collections correctly
**Plans**: 3 plans

Plans:
- [x] 01-01-PLAN.md - Project setup, database initialization, and core type definitions
- [x] 01-02-PLAN.md - Schema manager for collection and field CRUD operations
- [x] 01-03-PLAN.md - Validation layer and record operations with system fields

---

### Phase 2: REST API Generation
**Goal**: Auto-generate CRUD endpoints from collection schemas
**Depends on**: Phase 1
**Requirements**: API-01, API-02, API-03, API-04, API-05
**Success Criteria** (what must be TRUE):
  1. Developer can list all records in a collection via GET request
  2. Developer can retrieve a single record by ID via GET request
  3. Developer can create a new record via POST request and receive the created record
  4. Developer can update an existing record via PATCH request
  5. Developer can delete a record via DELETE request
**Plans**: 1 plan

Plans:
- [x] 02-01-PLAN.md - HTTP server with CRUD endpoints (TDD)

---

### Phase 3: Query Capabilities
**Goal**: Enable filtering, sorting, pagination, and relation expansion on list endpoints
**Depends on**: Phase 2
**Requirements**: API-06, API-07, API-08, API-09
**Success Criteria** (what must be TRUE):
  1. Developer can filter records using comparison operators (=, !=, >, <, ~)
  2. Developer can sort results ascending or descending by any field
  3. Developer can paginate through large result sets with page/perPage parameters
  4. Developer can expand relation fields to include full related records in response
**Plans**: 2 plans

Plans:
- [x] 03-01-PLAN.md - Query builder with filtering, sorting, pagination (TDD)
- [x] 03-02-PLAN.md - Relation expansion and server integration

---

### Phase 4: Lifecycle Hooks
**Goal**: Enable custom logic before and after CRUD operations
**Depends on**: Phase 2
**Requirements**: HOOK-01, HOOK-02, HOOK-03, HOOK-04, HOOK-05, HOOK-06, HOOK-07, HOOK-08
**Success Criteria** (what must be TRUE):
  1. Developer can register hooks that execute before and after create/update/delete operations
  2. Before hooks can cancel operations by throwing errors
  3. Hooks receive full context including record data, collection info, and request details
  4. Multiple hooks on the same event execute in registered order
**Plans**: 2 plans

Plans:
- [x] 04-01-PLAN.md - HookManager core with type-safe events and middleware chain
- [x] 04-02-PLAN.md - Server integration with hook-aware CRUD operations

---

### Phase 5: Admin Authentication
**Goal**: Secure the admin interface with JWT-based authentication
**Depends on**: Phase 2
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04
**Success Criteria** (what must be TRUE):
  1. Admin can log in at /_/login with password and receive a JWT token
  2. Admin UI routes return 401 without valid JWT
  3. Admin can change their password through a settings interface
**Plans**: 2 plans

Plans:
- [x] 05-01-PLAN.md - Admin module with password hashing and JWT utilities
- [ ] 05-02-PLAN.md - Route protection middleware and auth HTTP endpoints

---

### Phase 6: Admin UI Records
**Goal**: Provide a web interface for browsing and managing collection records
**Depends on**: Phase 5
**Requirements**: UI-01, UI-02, UI-03, UI-04, UI-05, UI-08, UI-09
**Success Criteria** (what must be TRUE):
  1. Admin can see all collections listed in the sidebar
  2. Admin can browse records with pagination in a table view
  3. Admin can create, edit, and delete records through auto-generated forms
  4. Admin can view dashboard with collection statistics
  5. Form inputs are generated based on field types (text inputs, number inputs, date pickers, etc.)
**Plans**: TBD

Plans:
- [ ] 06-01: TBD
- [ ] 06-02: TBD
- [ ] 06-03: TBD

---

### Phase 7: Admin UI Schema Editor
**Goal**: Enable runtime schema modifications through the admin interface
**Depends on**: Phase 6
**Requirements**: UI-06, UI-07
**Success Criteria** (what must be TRUE):
  1. Admin can create a new collection with fields through the UI
  2. Admin can add, edit, and remove fields on existing collections through the UI
  3. Schema changes take effect immediately without restart
**Plans**: TBD

Plans:
- [ ] 07-01: TBD

---

### Phase 8: Single Binary Packaging
**Goal**: Compile everything into a single executable with embedded admin UI
**Depends on**: Phase 7
**Requirements**: DEPL-01, DEPL-02, DEPL-03, DEPL-04, DEPL-05
**Success Criteria** (what must be TRUE):
  1. Project compiles to a single binary via `bun build --compile`
  2. Binary includes the React admin UI with no external asset files needed
  3. Binary runs standalone with no runtime dependencies
  4. Server starts on port 8090 by default (configurable via --port flag)
  5. SQLite database file is created automatically on first run
**Plans**: TBD

Plans:
- [ ] 08-01: TBD
- [ ] 08-02: TBD

---

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Core Foundation | 3/3 | Complete | 2025-01-25 |
| 2. REST API Generation | 1/1 | Complete | 2025-01-25 |
| 3. Query Capabilities | 2/2 | Complete | 2025-01-25 |
| 4. Lifecycle Hooks | 2/2 | Complete | 2025-01-25 |
| 5. Admin Authentication | 1/2 | In progress | - |
| 6. Admin UI Records | 0/3 | Not started | - |
| 7. Admin UI Schema Editor | 0/1 | Not started | - |
| 8. Single Binary Packaging | 0/2 | Not started | - |

---

## Coverage Validation

All 44 requirements mapped: Yes

| Category | Count | Phases |
|----------|-------|--------|
| Schema (SCHM) | 13 | 1 |
| API | 9 | 2, 3 |
| Hooks (HOOK) | 8 | 4 |
| Auth (AUTH) | 4 | 5 |
| UI | 9 | 6, 7 |
| Deployment (DEPL) | 5 | 8 |

**Requirement Mapping:**

| Requirement | Phase | Description |
|-------------|-------|-------------|
| SCHM-01 | 1 | Create collection with name and fields |
| SCHM-02 | 1 | Read collection schema |
| SCHM-03 | 1 | Update collection schema |
| SCHM-04 | 1 | Delete collection and records |
| SCHM-05 | 1 | Auto-generated id, created_at, updated_at |
| SCHM-06 | 1 | Text field type |
| SCHM-07 | 1 | Number field type |
| SCHM-08 | 1 | Boolean field type |
| SCHM-09 | 1 | Datetime field type |
| SCHM-10 | 1 | JSON field type |
| SCHM-11 | 1 | Relation field type |
| SCHM-12 | 1 | Required field constraint |
| SCHM-13 | 1 | Field type validation |
| API-01 | 2 | List endpoint |
| API-02 | 2 | Get endpoint |
| API-03 | 2 | Create endpoint |
| API-04 | 2 | Update endpoint |
| API-05 | 2 | Delete endpoint |
| API-06 | 3 | Filter operators |
| API-07 | 3 | Sorting |
| API-08 | 3 | Pagination |
| API-09 | 3 | Relation expansion |
| HOOK-01 | 4 | beforeCreate hook |
| HOOK-02 | 4 | afterCreate hook |
| HOOK-03 | 4 | beforeUpdate hook |
| HOOK-04 | 4 | afterUpdate hook |
| HOOK-05 | 4 | beforeDelete hook |
| HOOK-06 | 4 | afterDelete hook |
| HOOK-07 | 4 | before hooks cancel operation |
| HOOK-08 | 4 | Hook context with record/collection/request |
| AUTH-01 | 5 | Admin login at /_/login |
| AUTH-02 | 5 | JWT token on login |
| AUTH-03 | 5 | JWT required for admin routes |
| AUTH-04 | 5 | Admin password change |
| UI-01 | 6 | Collection list in sidebar |
| UI-02 | 6 | Browse records with pagination |
| UI-03 | 6 | Create record via form |
| UI-04 | 6 | Edit record via form |
| UI-05 | 6 | Delete record with confirmation |
| UI-06 | 7 | Create collection via schema editor |
| UI-07 | 7 | Add/edit/remove fields on collection |
| UI-08 | 6 | Dashboard with collection stats |
| UI-09 | 6 | Auto-generated form inputs |
| DEPL-01 | 8 | Compile to single executable |
| DEPL-02 | 8 | Embedded React admin UI |
| DEPL-03 | 8 | Zero runtime dependencies |
| DEPL-04 | 8 | Port 8090 default |
| DEPL-05 | 8 | SQLite created on first run |

---
*Roadmap created: 2025-01-24*
*Phase 1 planned: 2025-01-25*
*Phase 1 complete: 2025-01-25*
*Phase 2 complete: 2025-01-25*
*Phase 3 planned: 2025-01-25*
*Phase 3 complete: 2025-01-25*
*Phase 4 planned: 2025-01-25*
*Phase 4 complete: 2025-01-25*
*Phase 5 planned: 2025-01-25*
