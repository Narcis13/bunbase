# Roadmap: BunBase v0.2

## Milestone Overview

**Goal:** Extend BunBase with user authentication, file uploads, and realtime subscriptions to deliver a production-ready BaaS foundation.
**Phases:** 9-13 (continuing from v0.1's Phase 8)
**Requirements:** 41 total

## Phase Summary

| # | Name | Goal | Requirements | Success Criteria |
|---|------|------|--------------|------------------|
| 9 | Email Service | Developers can send transactional emails from hooks and auth flows | EMAIL-01, EMAIL-02, EMAIL-03 | 3 |
| 10 | User Authentication | Users can securely manage their accounts with email/password | AUTH-01 through AUTH-11 | 5 |
| 11 | File Uploads | Users can upload and retrieve files attached to records | FILE-01 through FILE-10 | 4 |
| 12 | Realtime/SSE | Clients can subscribe to record changes and receive live updates | SSE-01 through SSE-10 | 4 |
| 13 | UI Polish | Admin UI provides clear feedback and works across devices | UI-01 through UI-07 | 3 |

## Phase Details

### Phase 9: Email Service

**Goal:** Developers can send transactional emails from hooks and auth flows.

**Dependencies:** None (foundational for Phase 10)

**Plans:** 3 plans

**Status:** ✓ Complete (2026-01-27)

Plans:
- [x] 09-01-PLAN.md — Config types and template utilities
- [x] 09-02-PLAN.md — Nodemailer transport and sendEmail function
- [x] 09-03-PLAN.md — CLI integration and tests

**Requirements:**
- EMAIL-01: SMTP configuration (host, port, user, password) via CLI flags or env vars
- EMAIL-02: Send email function with to, subject, body (HTML and plain text)
- EMAIL-03: Template placeholders for tokens/links in email body

**Success Criteria:**
1. Developer can configure SMTP via `--smtp-host`, `--smtp-port`, `--smtp-user`, `--smtp-pass` flags or corresponding env vars
2. Email sends successfully to valid SMTP server with correct credentials
3. Email body supports `{{token}}` and `{{link}}` placeholders that get replaced at send time

---

### Phase 10: User Authentication

**Goal:** Users can securely manage their accounts with email/password authentication.

**Dependencies:** Phase 9 (Email Service for verification and password reset)

**Requirements:**
- AUTH-01: Auth collection type with special fields (email, password_hash, verified, created, updated)
- AUTH-02: User can sign up with email and password
- AUTH-03: User can log in with email and password, receives JWT token
- AUTH-04: User can refresh token to extend session
- AUTH-05: User can request email verification (sends verification email)
- AUTH-06: User can confirm email verification with token
- AUTH-07: User can request password reset (sends reset email)
- AUTH-08: User can confirm password reset with token and new password
- AUTH-09: Password validation (minimum length, complexity rules)
- AUTH-10: Auth middleware for user routes (verify user JWT)
- AUTH-11: Collection-level auth rules (who can create, read, update, delete records)

**Success Criteria:**
1. User can create account with email/password, log in, and access protected endpoints with JWT token
2. User can request and confirm email verification via emailed link
3. User can reset forgotten password via emailed link and set a new password
4. User stays logged in across browser sessions via token refresh
5. Collection rules restrict record access based on authenticated user context

---

### Phase 11: File Uploads

**Goal:** Users can upload and retrieve files attached to records.

**Dependencies:** Phase 10 (User Auth for protected file access)

**Requirements:**
- FILE-01: File field type in schema definition
- FILE-02: Multipart upload via records API (create and update)
- FILE-03: Local filesystem storage in `{data_dir}/storage/{collection}/{record}/`
- FILE-04: File serving endpoint `GET /api/files/{collection}/{record}/{filename}`
- FILE-05: Filename sanitization (remove special chars, add random suffix)
- FILE-06: Configurable file size limit (default 10MB)
- FILE-07: MIME type validation (allowed types per field)
- FILE-08: Multiple files per field support
- FILE-09: File deletion when record is deleted (cleanup via hook)
- FILE-10: File URL generation helper in API responses

**Success Criteria:**
1. User can upload file(s) when creating or updating a record with a file field
2. User can download uploaded files via `/api/files/{collection}/{record}/{filename}`
3. Invalid files (wrong type, too large) are rejected with clear error messages
4. Files are automatically deleted from storage when their parent record is deleted

---

### Phase 12: Realtime/SSE

**Goal:** Clients can subscribe to record changes and receive live updates.

**Dependencies:** Phase 10 (User Auth for permission-filtered events)

**Requirements:**
- SSE-01: SSE connection endpoint `GET /api/realtime`
- SSE-02: Client ID assignment sent on connect (`PB_CONNECT` event)
- SSE-03: Subscribe to collection changes (`POST /api/realtime` with subscriptions)
- SSE-04: Subscribe to specific record changes
- SSE-05: Create events broadcast to subscribers
- SSE-06: Update events broadcast to subscribers
- SSE-07: Delete events broadcast to subscribers
- SSE-08: Unsubscribe from topics
- SSE-09: Connection keep-alive (periodic ping)
- SSE-10: Auto-disconnect inactive connections (5 min timeout)

**Success Criteria:**
1. Client can connect to `/api/realtime` and receive a client ID
2. Client can subscribe to collection or record changes and receive create/update/delete events
3. Events are permission-filtered based on collection auth rules (no data leakage)
4. Stale connections are automatically cleaned up after inactivity

---

### Phase 13: UI Polish

**Goal:** Admin UI provides clear feedback and works across devices.

**Dependencies:** None (can run in parallel with other phases after Phase 10)

**Requirements:**
- UI-01: Loading states with spinners during async operations
- UI-02: Error toast notifications on failures
- UI-03: Success toast confirmations on actions
- UI-04: Form validation feedback with inline errors
- UI-05: Consistent spacing throughout admin UI
- UI-06: Keyboard navigation for forms and tables
- UI-07: Responsive layout refinements for tablet/mobile

**Success Criteria:**
1. User sees loading indicators during all async operations and receives clear success/error feedback via toasts
2. Form validation errors appear inline next to the relevant field
3. Admin UI is usable on tablet and mobile viewports with proper responsive layout

---

## Requirement Coverage

| Category | Requirements | Phase |
|----------|--------------|-------|
| Email Service | EMAIL-01, EMAIL-02, EMAIL-03 | Phase 9 |
| User Authentication | AUTH-01 through AUTH-11 | Phase 10 |
| File Uploads | FILE-01 through FILE-10 | Phase 11 |
| Realtime/SSE | SSE-01 through SSE-10 | Phase 12 |
| UI Polish | UI-01 through UI-07 | Phase 13 |

**Total:** 41 requirements mapped across 5 phases
**Coverage:** 100%

---

## Dependency Graph

```
Phase 9 (Email) ──┐
                  ├──> Phase 10 (Auth) ──┬──> Phase 11 (Files)
                  │                      │
                  │                      └──> Phase 12 (SSE)
                  │
                  └──────────────────────────> Phase 13 (UI Polish)
```

**Critical path:** 9 -> 10 -> 11 -> 12
**Parallel opportunity:** Phase 13 (UI Polish) can start after Phase 10

---
*Roadmap created: 2026-01-26*
*Phase 9 planned: 2026-01-27*
*Phase 9 complete: 2026-01-27*
