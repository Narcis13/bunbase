# Requirements: BunBase

**Defined:** 2025-01-24
**Core Value:** Ship a working backend-in-a-box that compiles to a single binary and auto-generates REST APIs from schema definitions.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Schema Management

- [ ] **SCHM-01**: Developer can create a collection with a name and field definitions
- [ ] **SCHM-02**: Developer can read collection schema (fields, types, constraints)
- [ ] **SCHM-03**: Developer can update collection schema (add/modify fields)
- [ ] **SCHM-04**: Developer can delete a collection and all its records
- [ ] **SCHM-05**: All records have auto-generated id, created_at, updated_at fields
- [ ] **SCHM-06**: Schema supports text field type
- [ ] **SCHM-07**: Schema supports number field type
- [ ] **SCHM-08**: Schema supports boolean field type
- [ ] **SCHM-09**: Schema supports datetime field type
- [ ] **SCHM-10**: Schema supports JSON field type
- [ ] **SCHM-11**: Schema supports relation field type (foreign key to another collection)
- [ ] **SCHM-12**: Fields can be marked as required
- [ ] **SCHM-13**: Field values are validated against their declared type

### REST API Generation

- [ ] **API-01**: System auto-generates list endpoint for each collection (`GET /api/collections/:name/records`)
- [ ] **API-02**: System auto-generates get endpoint for each collection (`GET /api/collections/:name/records/:id`)
- [ ] **API-03**: System auto-generates create endpoint for each collection (`POST /api/collections/:name/records`)
- [ ] **API-04**: System auto-generates update endpoint for each collection (`PATCH /api/collections/:name/records/:id`)
- [ ] **API-05**: System auto-generates delete endpoint for each collection (`DELETE /api/collections/:name/records/:id`)
- [ ] **API-06**: List endpoint supports filtering with `=`, `!=`, `>`, `<`, `~` operators
- [ ] **API-07**: List endpoint supports sorting via `sort` parameter (prefix `-` for descending)
- [ ] **API-08**: List endpoint supports pagination via `page` and `perPage` parameters
- [ ] **API-09**: Endpoints support relation expansion via `expand` parameter

### Lifecycle Hooks

- [ ] **HOOK-01**: Developer can register beforeCreate hook for a collection
- [ ] **HOOK-02**: Developer can register afterCreate hook for a collection
- [ ] **HOOK-03**: Developer can register beforeUpdate hook for a collection
- [ ] **HOOK-04**: Developer can register afterUpdate hook for a collection
- [ ] **HOOK-05**: Developer can register beforeDelete hook for a collection
- [ ] **HOOK-06**: Developer can register afterDelete hook for a collection
- [ ] **HOOK-07**: before* hooks can cancel the operation by throwing or returning error
- [ ] **HOOK-08**: Hooks receive context with record data, collection info, and request details

### Admin Authentication

- [ ] **AUTH-01**: Admin can log in with password at `/_/login`
- [ ] **AUTH-02**: System issues JWT token on successful admin login
- [ ] **AUTH-03**: All admin UI routes require valid JWT
- [ ] **AUTH-04**: Admin can change their password through settings

### Admin UI

- [ ] **UI-01**: Admin can view list of all collections in sidebar
- [ ] **UI-02**: Admin can browse records in a collection with pagination
- [ ] **UI-03**: Admin can create a new record via form
- [ ] **UI-04**: Admin can edit an existing record via form
- [ ] **UI-05**: Admin can delete a record with confirmation
- [ ] **UI-06**: Admin can create a new collection via schema editor
- [ ] **UI-07**: Admin can add/edit/remove fields on existing collection
- [ ] **UI-08**: Admin can view dashboard with collection stats (record counts)
- [ ] **UI-09**: Forms auto-generate inputs based on field types

### Deployment

- [ ] **DEPL-01**: Project compiles to single executable via `bun build --compile`
- [ ] **DEPL-02**: Compiled binary includes embedded React admin UI
- [ ] **DEPL-03**: Binary runs with no external dependencies (zero-install)
- [ ] **DEPL-04**: Server starts on port 8090 by default (configurable via flag)
- [ ] **DEPL-05**: SQLite database file created on first run

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

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCHM-01 to SCHM-13 | TBD | Pending |
| API-01 to API-09 | TBD | Pending |
| HOOK-01 to HOOK-08 | TBD | Pending |
| AUTH-01 to AUTH-04 | TBD | Pending |
| UI-01 to UI-09 | TBD | Pending |
| DEPL-01 to DEPL-05 | TBD | Pending |

**Coverage:**
- v1 requirements: 44 total
- Mapped to phases: 0
- Unmapped: 44 ⚠️

---
*Requirements defined: 2025-01-24*
*Last updated: 2025-01-24 after initial definition*
