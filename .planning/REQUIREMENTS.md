# Requirements: BunBase

**Defined:** 2025-01-24
**Core Value:** Ship a working backend-in-a-box that compiles to a single binary and auto-generates REST APIs from schema definitions.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Schema Management

- [x] **SCHM-01**: Developer can create a collection with a name and field definitions
- [x] **SCHM-02**: Developer can read collection schema (fields, types, constraints)
- [x] **SCHM-03**: Developer can update collection schema (add/modify fields)
- [x] **SCHM-04**: Developer can delete a collection and all its records
- [x] **SCHM-05**: All records have auto-generated id, created_at, updated_at fields
- [x] **SCHM-06**: Schema supports text field type
- [x] **SCHM-07**: Schema supports number field type
- [x] **SCHM-08**: Schema supports boolean field type
- [x] **SCHM-09**: Schema supports datetime field type
- [x] **SCHM-10**: Schema supports JSON field type
- [x] **SCHM-11**: Schema supports relation field type (foreign key to another collection)
- [x] **SCHM-12**: Fields can be marked as required
- [x] **SCHM-13**: Field values are validated against their declared type

### REST API Generation

- [x] **API-01**: System auto-generates list endpoint for each collection (`GET /api/collections/:name/records`)
- [x] **API-02**: System auto-generates get endpoint for each collection (`GET /api/collections/:name/records/:id`)
- [x] **API-03**: System auto-generates create endpoint for each collection (`POST /api/collections/:name/records`)
- [x] **API-04**: System auto-generates update endpoint for each collection (`PATCH /api/collections/:name/records/:id`)
- [x] **API-05**: System auto-generates delete endpoint for each collection (`DELETE /api/collections/:name/records/:id`)
- [x] **API-06**: List endpoint supports filtering with `=`, `!=`, `>`, `<`, `~` operators
- [x] **API-07**: List endpoint supports sorting via `sort` parameter (prefix `-` for descending)
- [x] **API-08**: List endpoint supports pagination via `page` and `perPage` parameters
- [x] **API-09**: Endpoints support relation expansion via `expand` parameter

### Lifecycle Hooks

- [x] **HOOK-01**: Developer can register beforeCreate hook for a collection
- [x] **HOOK-02**: Developer can register afterCreate hook for a collection
- [x] **HOOK-03**: Developer can register beforeUpdate hook for a collection
- [x] **HOOK-04**: Developer can register afterUpdate hook for a collection
- [x] **HOOK-05**: Developer can register beforeDelete hook for a collection
- [x] **HOOK-06**: Developer can register afterDelete hook for a collection
- [x] **HOOK-07**: before* hooks can cancel the operation by throwing or returning error
- [x] **HOOK-08**: Hooks receive context with record data, collection info, and request details

### Admin Authentication

- [x] **AUTH-01**: Admin can log in with password at `/_/login`
- [x] **AUTH-02**: System issues JWT token on successful admin login
- [x] **AUTH-03**: All admin UI routes require valid JWT
- [x] **AUTH-04**: Admin can change their password through settings

### Admin UI

- [x] **UI-01**: Admin can view list of all collections in sidebar
- [x] **UI-02**: Admin can browse records in a collection with pagination
- [x] **UI-03**: Admin can create a new record via form
- [x] **UI-04**: Admin can edit an existing record via form
- [x] **UI-05**: Admin can delete a record with confirmation
- [x] **UI-06**: Admin can create a new collection via schema editor
- [x] **UI-07**: Admin can add/edit/remove fields on existing collection
- [x] **UI-08**: Admin can view dashboard with collection stats (record counts)
- [x] **UI-09**: Forms auto-generate inputs based on field types

### Deployment

- [x] **DEPL-01**: Project compiles to single executable via `bun build --compile`
- [x] **DEPL-02**: Compiled binary includes embedded React admin UI
- [x] **DEPL-03**: Binary runs with no external dependencies (zero-install)
- [x] **DEPL-04**: Server starts on port 8090 by default (configurable via flag)
- [x] **DEPL-05**: SQLite database file created on first run

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### User Authentication
- **AUTH-V2-01**: User can sign up with email and password
- **AUTH-V2-02**: User can log in with email and password
- **AUTH-V2-03**: User can reset password via email
- **AUTH-V2-04**: OAuth login (Google, GitHub)

### Realtime
- **RT-01**: Client can subscribe to collection changes via SSE
- **RT-02**: Server pushes create/update/delete events to subscribers

### File Storage
- **FILE-01**: Records can have file/image field types
- **FILE-02**: Files stored locally with configurable path
- **FILE-03**: File uploads via multipart form data

### Advanced Features
- **ADV-01**: Unique field constraints
- **ADV-02**: Select field type (predefined options)
- **ADV-03**: Autodate field type (auto-set on create/update)
- **ADV-04**: View collections (virtual, SQL-based)
- **ADV-05**: Batch record operations
- **ADV-06**: CLI scaffolding tool

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| GraphQL API | REST sufficient for v0.1, adds complexity |
| PostgreSQL support | SQLite-only keeps scope tight, add later |
| Multi-tenancy | Enterprise feature, not needed for MVP |
| MFA/OTP | Overkill for admin-only auth |
| Email sending | Requires SMTP config, defer with user auth |
| Real-time chat/WebSockets | SSE deferred to v0.2 |
| API rate limiting | Can add via middleware later |
| Audit logging | Nice-to-have, not core to value prop |
| AI features | Foundation first, AI layer comes later |

## Traceability

Which phases cover which requirements.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCHM-01 | 1 | Complete |
| SCHM-02 | 1 | Complete |
| SCHM-03 | 1 | Complete |
| SCHM-04 | 1 | Complete |
| SCHM-05 | 1 | Complete |
| SCHM-06 | 1 | Complete |
| SCHM-07 | 1 | Complete |
| SCHM-08 | 1 | Complete |
| SCHM-09 | 1 | Complete |
| SCHM-10 | 1 | Complete |
| SCHM-11 | 1 | Complete |
| SCHM-12 | 1 | Complete |
| SCHM-13 | 1 | Complete |
| API-01 | 2 | Complete |
| API-02 | 2 | Complete |
| API-03 | 2 | Complete |
| API-04 | 2 | Complete |
| API-05 | 2 | Complete |
| API-06 | 3 | Complete |
| API-07 | 3 | Complete |
| API-08 | 3 | Complete |
| API-09 | 3 | Complete |
| HOOK-01 | 4 | Complete |
| HOOK-02 | 4 | Complete |
| HOOK-03 | 4 | Complete |
| HOOK-04 | 4 | Complete |
| HOOK-05 | 4 | Complete |
| HOOK-06 | 4 | Complete |
| HOOK-07 | 4 | Complete |
| HOOK-08 | 4 | Complete |
| AUTH-01 | 5 | Complete |
| AUTH-02 | 5 | Complete |
| AUTH-03 | 5 | Complete |
| AUTH-04 | 5 | Complete |
| UI-01 | 6 | Complete |
| UI-02 | 6 | Complete |
| UI-03 | 6 | Complete |
| UI-04 | 6 | Complete |
| UI-05 | 6 | Complete |
| UI-06 | 7 | Complete |
| UI-07 | 7 | Complete |
| UI-08 | 6 | Complete |
| UI-09 | 6 | Complete |
| DEPL-01 | 8 | Complete |
| DEPL-02 | 8 | Complete |
| DEPL-03 | 8 | Complete |
| DEPL-04 | 8 | Complete |
| DEPL-05 | 8 | Complete |

**Coverage:**
- v1 requirements: 44 total
- Mapped to phases: 44
- Complete: 44
- Unmapped: 0

---
*Requirements defined: 2025-01-24*
*Last updated: 2026-01-26 after Milestone v0.1 completion*
