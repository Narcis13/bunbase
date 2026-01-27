# Project State: BunBase

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-26)

**Core value:** Ship a working backend-in-a-box that compiles to a single binary and auto-generates REST APIs from schema definitions
**Current focus:** v0.2 — User Authentication, Files & Realtime

## Current Position

Phase: 12 - Realtime/SSE (COMPLETE)
Plan: 06 of 6 complete (12-01, 12-02, 12-03, 12-04, 12-05, 12-06)
Status: Phase 12 Complete
Last activity: 2026-01-27 — Completed 12-06-PLAN.md (Connection Lifecycle)

Progress: [████████████████████████████████████████████] 100% (21/21 v0.2 plans)

## Milestone v0.2 Overview

**Goal:** Extend BunBase with user authentication, file uploads, and realtime subscriptions.
**Phases:** 9-13 (5 phases)
**Requirements:** 41 total

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 9 | Email Service | 3 | Verified |
| 10 | User Authentication | 11 | Complete |
| 11 | File Uploads | 10 | Verified |
| 12 | Realtime/SSE | 10 | Complete |
| 13 | UI Polish | 7 | Pending |

## Accumulated Context

### Decisions

Full decision log in PROJECT.md Key Decisions table.
All v0.1 decisions marked as Good.

v0.2 decisions made:
- Graceful degradation: loadSmtpConfig returns null when SMTP unconfigured
- Auto-detect secure mode from port (465 = implicit TLS, others = STARTTLS)
- Template placeholders: preserve unmatched {{key}} patterns
- Use export type for interface re-exports (Bun ESM compatibility)
- Lazy transport verification on first send (not on init)
- Sanitize error messages to prevent credential leaks
- CLI flags take precedence over env vars for SMTP configuration
- Server starts normally without SMTP config (graceful degradation)
- Token expiration: 15min access + 7day refresh (decided in 10-02)
- Store token_id in DB, not actual token (security)
- Reuse JWT_SECRET for admin and user tokens
- Auth collections use type field ('base' | 'auth') rather than separate table
- Password requires 8+ chars, at least 1 letter, at least 1 number (configurable minLength)
- Auth system fields (email, password_hash, verified) auto-added to table
- Timing attack prevention: verify against dummy hash when user not found (10-03)
- Token rotation on refresh: old token immediately revoked (10-03)
- Password change revokes all refresh tokens for user (10-03)
- Generic "Invalid credentials" error for both wrong password and non-existent user (10-03)
- Verification tokens hashed with SHA-256 before storage (10-04)
- 64-character tokens via nanoid for sufficient entropy (10-04)
- Previous unused tokens invalidated when new one created (10-04)
- GET endpoint for confirm-verification returns HTML for direct link clicking (10-04)
- Password reset always returns success regardless of email existence (enumeration prevention) (10-05)
- All refresh tokens revoked after password reset (session invalidation) (10-05)
- GET endpoint for confirm-reset returns HTML form for direct link clicking (10-05)
- Rule semantics: null = admin only, '' = public, string = expression (10-06)
- Auth context undefined = skip checks for backward compatibility (10-06)
- Public API enforces rules, admin API bypasses rules (10-06)
- Access denied returns 403, not 401 (10-06)
- File field type maps to TEXT (JSON array of filenames) (11-01)
- 10-char nanoid suffix for filename uniqueness (11-01)
- Normalize Windows backslashes for cross-platform path handling (11-01)
- Truncate base filename to 100 chars max (11-01)
- BUNBASE_STORAGE_DIR env var for storage path override (11-02)
- Storage structure: {storageDir}/{collectionName}/{recordId}/filename (11-02)
- Idempotent delete operations - no throw on missing files/directories (11-02)
- listRecordFiles returns empty array for non-existent directories (11-02)
- Default max file size: 10MB when maxSize not specified (11-03)
- Default max files per field: 1 when maxFiles not specified (11-03)
- Wildcard MIME types use prefix matching (e.g., image/* matches image/jpeg) (11-03)
- Error accumulation: collect all validation errors rather than fail-fast (11-03)
- Use native Request.formData() for multipart parsing (11-04)
- JSON parse form fields, fall back to string (11-04)
- Skip empty file inputs (size=0, no name) from browser (11-04)
- Create record first, then save files and update with filenames (11-04)
- File fields stored as string (single) or JSON array (maxFiles > 1) (11-04)
- File access uses same view rules as record access (11-05)
- Bun.file() handles Content-Type automatically from extension (11-05)
- URL transformation happens at response time, not storage time (11-05)
- File cleanup hook uses afterDelete, logs errors but doesn't throw (11-06)
- Cleanup only runs for collections with file fields (optimization) (11-06)
- SSE messages end with double newline (\n\n) per spec (12-01)
- Field order: event, id, retry, data (consistent with spec examples) (12-01)
- Comments use colon prefix (: comment\n\n) for keep-alive (12-01)
- RealtimeClient tracks controller, subscriptions, user, lastActivity (12-01)
- Activity timestamp updated on auth/subscription changes (12-01)
- Topic format: collection/* for wildcard, collection/recordId for specific (12-02)
- Collection names: alphanumeric + underscore, must start with letter (12-02)
- Invalid topics return null (fail-safe parsing, not exceptions) (12-02)
- ReadableStream type:direct for efficient SSE streaming (12-03)
- 30-second ping interval for keep-alive (12-03)
- RealtimeManager follows HookManager injection pattern (12-03)
- Client ID generated with nanoid on connect (12-03)
- setSubscriptions accepts topic strings, parses internally (12-04)
- Invalid topics silently filtered (fail-safe parsing) (12-04)
- Auth mismatch returns 403 (session hijacking prevention) (12-04)
- Auth context captured once, cannot be changed mid-session (12-04)
- Use listRule for wildcard subscriptions, viewRule for specific record (12-05)
- Fire-and-forget broadcasting: don't block API responses (12-05)
- Event format: { action, record } following PocketBase convention (12-05)
- Remove client from manager on send error (disconnected cleanup) (12-05)
- 5-minute inactivity timeout for SSE connections (12-06)
- 60-second cleanup interval (12-06)
- setInactivityTimeout() for testing flexibility (12-06)
- Cleanup logs to console when clients removed (12-06)

v0.2 decisions pending:
- Email templates design (plain text vs HTML) - start with plain text

### Pending Todos

None.

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-01-27
Stopped at: Completed 12-06-PLAN.md (Connection Lifecycle)
Resume file: None

## Next Steps

Phase 12 (Realtime/SSE) is COMPLETE. All 10 requirements implemented.
Next: Phase 13 (UI Polish) to complete v0.2 milestone.

---
*State updated: 2026-01-27 after completing 12-06-PLAN.md*
