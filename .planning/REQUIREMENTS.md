# Requirements: BunBase v0.2

**Defined:** 2026-01-26
**Core Value:** Ship a working backend-in-a-box that compiles to a single binary and auto-generates REST APIs from schema definitions

## v0.2 Requirements

Requirements for User Authentication, Files & Realtime milestone. Each maps to roadmap phases.

### Email Service

- [x] **EMAIL-01**: SMTP configuration (host, port, user, password) via CLI flags or env vars
- [x] **EMAIL-02**: Send email function with to, subject, body (HTML and plain text)
- [x] **EMAIL-03**: Template placeholders for tokens/links in email body

### User Authentication

- [x] **AUTH-01**: Auth collection type with special fields (email, password_hash, verified, created, updated)
- [x] **AUTH-02**: User can sign up with email and password
- [x] **AUTH-03**: User can log in with email and password, receives JWT token
- [x] **AUTH-04**: User can refresh token to extend session
- [x] **AUTH-05**: User can request email verification (sends verification email)
- [x] **AUTH-06**: User can confirm email verification with token
- [x] **AUTH-07**: User can request password reset (sends reset email)
- [x] **AUTH-08**: User can confirm password reset with token and new password
- [x] **AUTH-09**: Password validation (minimum length, complexity rules)
- [x] **AUTH-10**: Auth middleware for user routes (verify user JWT)
- [x] **AUTH-11**: Collection-level auth rules (who can create, read, update, delete records)

### File Uploads

- [x] **FILE-01**: File field type in schema definition
- [x] **FILE-02**: Multipart upload via records API (create and update)
- [x] **FILE-03**: Local filesystem storage in `{data_dir}/storage/{collection}/{record}/`
- [x] **FILE-04**: File serving endpoint `GET /api/files/{collection}/{record}/{filename}`
- [x] **FILE-05**: Filename sanitization (remove special chars, add random suffix)
- [x] **FILE-06**: Configurable file size limit (default 10MB)
- [x] **FILE-07**: MIME type validation (allowed types per field)
- [x] **FILE-08**: Multiple files per field support
- [x] **FILE-09**: File deletion when record is deleted (cleanup via hook)
- [x] **FILE-10**: File URL generation helper in API responses

### Realtime/SSE

- [ ] **SSE-01**: SSE connection endpoint `GET /api/realtime`
- [ ] **SSE-02**: Client ID assignment sent on connect (`PB_CONNECT` event)
- [ ] **SSE-03**: Subscribe to collection changes (`POST /api/realtime` with subscriptions)
- [ ] **SSE-04**: Subscribe to specific record changes
- [ ] **SSE-05**: Create events broadcast to subscribers
- [ ] **SSE-06**: Update events broadcast to subscribers
- [ ] **SSE-07**: Delete events broadcast to subscribers
- [ ] **SSE-08**: Unsubscribe from topics
- [ ] **SSE-09**: Connection keep-alive (periodic ping)
- [ ] **SSE-10**: Auto-disconnect inactive connections (5 min timeout)

### UI Polish

- [ ] **UI-01**: Loading states with spinners during async operations
- [ ] **UI-02**: Error toast notifications on failures
- [ ] **UI-03**: Success toast confirmations on actions
- [ ] **UI-04**: Form validation feedback with inline errors
- [ ] **UI-05**: Consistent spacing throughout admin UI
- [ ] **UI-06**: Keyboard navigation for forms and tables
- [ ] **UI-07**: Responsive layout refinements for tablet/mobile

## Future Requirements (v0.3+)

Deferred to later milestones. Tracked but not in current roadmap.

### OAuth

- **OAUTH-01**: Google OAuth login
- **OAUTH-02**: GitHub OAuth login
- **OAUTH-03**: OAuth provider configuration in admin UI

### Advanced Files

- **AFILE-01**: Image thumbnail generation
- **AFILE-02**: Protected files (require auth token)
- **AFILE-03**: S3-compatible storage backend

### Advanced Realtime

- **ASSE-01**: Auth-aware subscriptions (filter by user permissions)
- **ASSE-02**: Custom event broadcast API from hooks
- **ASSE-03**: WebSocket alternative

### Advanced Auth

- **AAUTH-01**: Username + password login
- **AAUTH-02**: Magic link authentication
- **AAUTH-03**: Session management UI
- **AAUTH-04**: User impersonation

### Additional Field Types

- **FIELD-01**: Unique field constraint
- **FIELD-02**: Select field type (predefined options)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| MFA/TOTP | Advanced security feature, overkill for v0.2 |
| SAML/SSO | Enterprise feature, complex setup |
| SMS/phone auth | Requires SMS gateway, email sufficient |
| Video transcoding | Heavy processing, ffmpeg dependency |
| Chunked uploads | Use file size limits instead |
| Message queuing for SSE | Direct dispatch sufficient for v0.2 |
| Presence detection | App-level feature, not core BaaS |
| Theme customization | Single dark theme sufficient |
| Multi-language i18n | English only for v0.2 |
| Dashboard charts/widgets | Simple stats sufficient |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| EMAIL-01 | Phase 9 | Complete |
| EMAIL-02 | Phase 9 | Complete |
| EMAIL-03 | Phase 9 | Complete |
| AUTH-01 | Phase 10 | Complete |
| AUTH-02 | Phase 10 | Complete |
| AUTH-03 | Phase 10 | Complete |
| AUTH-04 | Phase 10 | Complete |
| AUTH-05 | Phase 10 | Complete |
| AUTH-06 | Phase 10 | Complete |
| AUTH-07 | Phase 10 | Complete |
| AUTH-08 | Phase 10 | Complete |
| AUTH-09 | Phase 10 | Complete |
| AUTH-10 | Phase 10 | Complete |
| AUTH-11 | Phase 10 | Complete |
| FILE-01 | Phase 11 | Complete |
| FILE-02 | Phase 11 | Complete |
| FILE-03 | Phase 11 | Complete |
| FILE-04 | Phase 11 | Complete |
| FILE-05 | Phase 11 | Complete |
| FILE-06 | Phase 11 | Complete |
| FILE-07 | Phase 11 | Complete |
| FILE-08 | Phase 11 | Complete |
| FILE-09 | Phase 11 | Complete |
| FILE-10 | Phase 11 | Complete |
| SSE-01 | Phase 12 | Pending |
| SSE-02 | Phase 12 | Pending |
| SSE-03 | Phase 12 | Pending |
| SSE-04 | Phase 12 | Pending |
| SSE-05 | Phase 12 | Pending |
| SSE-06 | Phase 12 | Pending |
| SSE-07 | Phase 12 | Pending |
| SSE-08 | Phase 12 | Pending |
| SSE-09 | Phase 12 | Pending |
| SSE-10 | Phase 12 | Pending |
| UI-01 | Phase 13 | Pending |
| UI-02 | Phase 13 | Pending |
| UI-03 | Phase 13 | Pending |
| UI-04 | Phase 13 | Pending |
| UI-05 | Phase 13 | Pending |
| UI-06 | Phase 13 | Pending |
| UI-07 | Phase 13 | Pending |

**Coverage:**
- v0.2 requirements: 41 total
- Mapped to phases: 41
- Unmapped: 0

---
*Requirements defined: 2026-01-26*
*Last updated: 2026-01-27 after Phase 11 completion*
