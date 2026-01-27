# Project State: BunBase

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-26)

**Core value:** Ship a working backend-in-a-box that compiles to a single binary and auto-generates REST APIs from schema definitions
**Current focus:** v0.2 — User Authentication, Files & Realtime

## Current Position

Phase: 11 - File Uploads (IN PROGRESS)
Plan: 01 of 6 complete (11-01)
Status: In progress
Last activity: 2026-01-27 — Completed 11-01-PLAN.md (File Field Type and Sanitization)

Progress: [█████████████████████░░░░░░░░░░░░░░░░░░░░] 75% (9/12 v0.2 plans)

## Milestone v0.2 Overview

**Goal:** Extend BunBase with user authentication, file uploads, and realtime subscriptions.
**Phases:** 9-13 (5 phases)
**Requirements:** 41 total

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 9 | Email Service | 3 | Verified |
| 10 | User Authentication | 11 | Complete |
| 11 | File Uploads | 10 | In Progress (1/6) |
| 12 | Realtime/SSE | 10 | Pending |
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

v0.2 decisions pending:
- Email templates design (plain text vs HTML) - start with plain text

### Pending Todos

None.

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-01-27
Stopped at: Completed 11-01-PLAN.md
Resume file: None

## Next Steps

Phase 11 (File Uploads) in progress. Next:
- 11-02: File Storage Provider
- 11-03: Upload Endpoint
- 11-04: File Serving
- 11-05: File Deletion
- 11-06: Admin UI

---
*State updated: 2026-01-27 after completing 11-01-PLAN.md*
