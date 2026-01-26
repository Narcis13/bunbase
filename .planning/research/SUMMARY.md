# Research Summary: BunBase v0.2

**Project:** BunBase v0.2 - User Authentication, File Uploads, Realtime/SSE
**Domain:** Backend-in-a-box (BaaS) - extending validated v0.1 foundation
**Researched:** 2026-01-26
**Confidence:** HIGH

## Executive Summary

BunBase v0.2 builds on a validated foundation (schema-in-database, dynamic REST API, admin auth, single binary) by adding three critical BaaS capabilities: user authentication, file uploads, and realtime subscriptions. Research reveals that Bun's native APIs eliminate the need for most external dependencies, with only nodemailer required for password reset emails. The recommended approach follows PocketBase's proven patterns while leveraging Bun-native features for multipart parsing, file operations, and SSE streaming.

The path forward prioritizes user authentication first (foundation for authorization), file uploads second (standalone feature), and realtime/SSE third (most complex, requires hooks integration). This ordering matches dependency chains discovered in architecture research and avoids critical pitfalls around token confusion, file storage paths, and memory leaks. The existing admin auth pattern and lifecycle hooks infrastructure provide solid extension points.

Key risk: BunBase's single-binary architecture requires careful separation of embedded assets (admin UI) from external user data (uploads). File storage must use absolute external paths, never embedded filesystem. Security requires JWT token type discrimination to prevent admin/user token confusion, timing-safe authentication to prevent user enumeration, and permission filtering on realtime events to prevent data leakage.

## Key Findings

### Recommended Stack

**Minimal additions maximize Bun's native capabilities.** Only one new production dependency is needed: nodemailer for SMTP email delivery (password resets, verification). Everything else leverages Bun's built-in APIs.

**Stack additions:**
- **nodemailer ^6.9.0** - Password reset/verification emails via SMTP (user-configurable)

**Bun native features (zero dependencies):**
- **Request.formData()** - Multipart file upload parsing (no multer needed)
- **Bun.write() / Bun.file()** - File system operations (native async I/O)
- **ReadableStream** - SSE streaming (no framework needed)
- **crypto.randomBytes()** - Reset token generation
- **Bun.password.hash()** - Extends existing argon2id pattern to users

**Existing dependencies (no changes):**
- **jose ^6.1.3** - JWT tokens (add user token type alongside admin)
- **nanoid ^5.0.9** - File name generation
- **zod ^3.24.0** - File validation schemas

**Explicitly NOT adding:**
- Hono (v0.1 shipped successfully with raw Bun.serve)
- multer (Bun native multipart parsing)
- Redis (in-process pub/sub sufficient)
- S3/cloud storage (local filesystem for v0.2)

### Expected Features

Research analyzed PocketBase, Supabase, and Appwrite to identify table stakes vs differentiators.

**Must have (table stakes):**
- Email/password signup and login with JWT sessions
- Token refresh for persistent login
- Email verification flow (request + confirm)
- Password reset flow (request + confirm)
- File field type with multipart upload
- Local filesystem storage with serving endpoint
- File size/type validation
- SSE connection with collection/record subscriptions
- Create/update/delete events broadcast to subscribers
- Automatic reconnection and connection cleanup

**Should have (differentiators):**
- Auth-aware subscriptions (apply collection rules to events)
- Protected files with auth token checking
- Multiple files per field
- Loading/transition animations in admin UI
- Username + email login flexibility

**Defer to v0.3+:**
- OAuth2 providers (significant complexity)
- S3/cloud storage (adds external dependencies)
- Image thumbnail generation (requires processing library)
- WebSocket (SSE sufficient for unidirectional notifications)
- MFA/TOTP (advanced security)

### Architecture Approach

**Separation of concerns through system tables and new modules.** User auth follows the proven admin auth pattern with separate `_users` table and distinct JWT token types. File storage uses per-record directories mirroring PocketBase's proven structure. Realtime integrates via existing lifecycle hooks, broadcasting events after successful operations.

**New components:**
1. **src/auth/users.ts** - User CRUD with timing-safe verification
2. **src/auth/user-jwt.ts** - User tokens with `type: "user"` claim (prevents admin token confusion)
3. **src/auth/user-middleware.ts** - requireUser() parallel to requireAdmin()
4. **src/files/storage.ts** - Local filesystem operations with absolute paths
5. **src/realtime/sse.ts** - SSE connection management with cleanup
6. **src/realtime/subscriptions.ts** - In-process pub/sub broker

**Modified components:**
- **src/core/database.ts** - Add `_users` table to initialization
- **src/types/collection.ts** - Add `file` to FieldType enum
- **src/core/records.ts** - Trigger realtime broadcasts in afterCreate/Update/Delete hooks
- **src/api/server.ts** - Add user auth routes, file routes, SSE endpoint

**Data flow after v0.2:**
```
Client -> API -> requireAuth() -> records.ts -> database
              |                             |-> lifecycle hooks -> realtime broadcast
              |                             |-> file storage (multipart)
              |
              +-> /api/realtime (SSE) -> subscription broker
```

### Critical Pitfalls

Research identified 24 pitfalls across user auth, file uploads, realtime, and integration. Top 5 by risk level:

1. **JWT Token Type Confusion (HIGH)** - Admin and user tokens must have distinct `type` claims. Without this, user tokens could access admin endpoints if middleware only checks "valid JWT". Prevention: Add `{ type: "admin" | "user" }` to payloads, validate in middleware.

2. **Relative Path Storage Breaks Binary (HIGH)** - If files stored with relative paths, location depends on working directory. Single binary run from different paths breaks. Prevention: Resolve storage path to absolute on startup, validate it's external filesystem (not `$bunfs`).

3. **SSE Memory Leak from Unclosed Connections (HIGH)** - Clients disconnect without cleanup leave subscribers in memory. Over time causes OOM. Prevention: Listen to `req.signal` abort event, implement heartbeat cleanup for stale connections.

4. **Realtime Events Leak Private Data (HIGH)** - Broadcasting full records without permission checks bypasses API rules. Prevention: Apply same collection rules to SSE events, only send record ID (client fetches with proper auth).

5. **Timing Attack on User Enumeration (HIGH)** - Login returns faster for "user not found" vs "wrong password", revealing valid emails. Prevention: Always hash password even when user doesn't exist (dummy hash), return identical error messages.

Additional critical pitfalls: multipart parsing issues in Bun (use native formData), file type validation (check magic bytes), HTTP/1.1 SSE connection limits (document HTTP/2 requirement), and hook auth context missing (extend BaseHookContext with admin/user).

## Implications for Roadmap

Based on dependency analysis and architecture patterns, recommend 3-phase build order.

### Phase 1: User Authentication (Foundation)

**Rationale:** File uploads and realtime both need user context for authorization. Auth provides the foundation for permission-based access. Extends existing admin auth pattern with minimal new concepts.

**Delivers:**
- Users can register with email/password
- Login returns JWT access tokens
- Email verification flow with SMTP
- Password reset flow
- Token refresh for persistent sessions
- System `_users` table separate from user collections

**Addresses features:**
- Email/password signup and login (table stakes)
- JWT sessions with refresh (table stakes)
- Email verification request/confirm (table stakes)
- Password reset request/confirm (table stakes)

**Avoids pitfalls:**
- Token type confusion (design JWT payload with type field upfront)
- Timing attack on enumeration (implement dummy hash pattern)
- Users collection confusion (use `_users` system table)
- Hook auth context missing (extend context with admin/user)

**Build steps:**
1. Add `_users` table to database.ts INIT_METADATA_SQL
2. Create src/auth/users.ts (parallel to admin.ts)
3. Create src/auth/user-jwt.ts with `type: "user"` claim
4. Create src/auth/user-middleware.ts (requireUser)
5. Add user auth routes to server.ts
6. Install nodemailer, implement email service
7. Extend BaseHookContext with auth field

**Research flags:** Standard patterns, skip deep research. Reference PocketBase auth and OWASP guidelines.

### Phase 2: File Uploads (Standalone)

**Rationale:** Simpler than realtime, provides immediate visible value. File operations are independent of SSE complexity. Bun native APIs eliminate need for multer or other libraries.

**Delivers:**
- File field type in schema
- Multipart upload via native formData()
- Local filesystem storage at pb_data/storage/{collection}/{record}/
- File serving endpoint with auth checks
- File metadata in database
- Automatic cleanup on record delete
- File size and type validation

**Addresses features:**
- File field type (table stakes)
- Multipart upload (table stakes)
- Local filesystem storage (table stakes)
- File serving endpoint (table stakes)
- File deletion on record delete (table stakes)

**Avoids pitfalls:**
- Relative path storage (resolve to absolute on startup)
- Embedded files in binary (validate storage path is external)
- Multipart parsing issues (use Bun native formData)
- File type validation missing (check magic bytes, not just MIME)
- File deletion not implemented (add afterDelete hook)

**Build steps:**
1. Add `file` to FieldType enum in types/collection.ts
2. Add `_files` table to database.ts
3. Create src/files/storage.ts with absolute path resolution
4. Add file validation to validation.ts (Zod schemas)
5. Modify record create/update to handle multipart
6. Add file download route /api/files/{collection}/{record}/{filename}
7. Register afterDelete hook for file cleanup
8. Add --storage-path CLI flag with default

**Research flags:** Standard patterns for file handling. Watch for Bun-specific multipart issues (test extensively).

### Phase 3: Realtime/SSE (Complex Integration)

**Rationale:** Most complex feature, requires integration with existing hooks infrastructure. Builds on auth foundation for permission filtering. SSE chosen over WebSocket for simplicity and automatic reconnection.

**Delivers:**
- SSE endpoint at /api/realtime
- Client ID assignment on connect
- Subscribe to collection/* or collection/record
- Broadcast create/update/delete events
- Auth-aware event filtering
- Connection lifecycle management
- Heartbeat and cleanup for stale connections

**Addresses features:**
- SSE connection endpoint (table stakes)
- Collection/record subscriptions (table stakes)
- Create/update/delete events (table stakes)
- Connection keep-alive and cleanup (table stakes)
- Auth-aware subscriptions (differentiator)

**Avoids pitfalls:**
- SSE memory leak (cleanup on disconnect, heartbeat for stale)
- Connection limit issues (document HTTP/2 requirement)
- Raw SQL misses events (document hooks requirement)
- Data leakage in events (apply collection rules to broadcasts)
- Backpressure issues (implement event queue limits)

**Build steps:**
1. Create src/realtime/sse.ts (connection management, TransformStream)
2. Create src/realtime/subscriptions.ts (in-process pub/sub)
3. Add SSE GET/POST routes to server.ts
4. Register global hooks: afterCreate/Update/Delete -> broadcast()
5. Implement permission filtering on events
6. Add connection cleanup on disconnect (req.signal.abort)
7. Implement heartbeat interval for stale connection removal
8. Add event ID for reconnection recovery

**Research flags:** SSE implementation well-documented for Bun. Test connection cleanup extensively to prevent memory leaks.

### Phase 4: Integration Testing & UI Polish

**Rationale:** Validate combined features work together. Add polish without scope creep.

**Delivers:**
- User auth + file uploads integration tests
- User auth + realtime integration tests
- File changes trigger realtime events
- Loading states and animations in admin UI
- Responsive layout refinements

**Avoids pitfalls:**
- Single binary size explosion (verify only admin UI embedded)
- API rules applied inconsistently (test with admin/user/anonymous)
- File fields not cascade delete (verify cleanup works)

### Phase Ordering Rationale

**Why authentication first:**
- File serving needs auth checks for protected files
- Realtime needs auth context for permission-filtered events
- Hooks need auth information in context
- Foundation pattern established in v0.1 (admin auth)

**Why files second:**
- Independent feature (no realtime dependency)
- Simpler than SSE (fewer moving parts)
- Visible value (developers test uploads immediately)
- No complex state management

**Why realtime third:**
- Most complex (connection management, cleanup, broadcasting)
- Depends on hooks infrastructure (already built)
- Benefits from auth context (permission filtering)
- SSE over WebSocket reduces complexity

**Dependency chain validation:**
```
Phase 1 (Auth) -> Phase 2 (Files) - auth enables protected file serving
Phase 1 (Auth) -> Phase 3 (SSE) - auth enables permission filtering
Phase 2 (Files) + Phase 3 (SSE) - file changes trigger realtime events
```

### Research Flags

**Phases with standard patterns (skip deep research):**
- **Phase 1 (Auth):** PocketBase auth patterns well-documented, OWASP guidelines comprehensive
- **Phase 2 (Files):** Bun file handling documented, PocketBase storage structure proven
- **Phase 3 (SSE):** Bun TransformStream examples available, MDN SSE spec clear

**Phases needing testing focus (not research):**
- **Phase 2 (Files):** Bun has known multipart issues - extensive testing needed
- **Phase 3 (SSE):** Memory leak prevention requires load testing

**No phases need `/gsd:research-phase` during planning.** All patterns are well-established.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Bun native APIs proven, nodemailer has official support since v0.6.13 |
| Features | HIGH | PocketBase patterns validated at scale, clear table stakes identified |
| Architecture | HIGH | Extends existing v0.1 patterns (admin auth, hooks), separation of concerns clear |
| Pitfalls | HIGH | 24 pitfalls identified from authoritative sources, prevention strategies concrete |

**Overall confidence:** HIGH

All major components have proven patterns (PocketBase) or official Bun support. The single-binary architecture is already validated in v0.1. Research uncovered specific Bun quirks (multipart parsing, embedded filesystem) with clear mitigation strategies.

### Gaps to Address

**During Phase 1 (Auth):**
- Token expiration strategy (15min access + 7day refresh vs 24h access only) - decide based on UX preference
- Token revocation approach (blacklist vs tokenVersion column) - can defer to post-v0.2 if needed
- Email templates design (plain text vs HTML) - start with plain text, upgrade later

**During Phase 2 (Files):**
- Thumbnail generation strategy - confirm defer to v0.3, or add basic image resize if time permits
- File storage location default - validate `./pb_data/storage` matches deployment expectations
- Max file size default - choose reasonable default (10MB suggested), make configurable

**During Phase 3 (SSE):**
- HTTP/2 requirement enforcement - document clearly, consider startup warning if HTTP/1.1
- Event history retention - decide if events stored for replay or client refetches on reconnect
- Connection limit per user - decide if unlimited or rate-limited

**None of these gaps block implementation.** All have reasonable defaults or documented workarounds.

## Sources

### Stack Research
- [Bun File Uploads Guide](https://bun.com/docs/guides/http/file-uploads) - Native multipart parsing
- [Bun WebSocket API](https://bun.com/docs/api/websockets) - Native WebSocket (deferred to v0.3)
- [jose npm package](https://www.npmjs.com/package/jose) - v6.1.3 JWT implementation
- [Nodemailer Bun Compatibility](https://bun.sh/blog/bun-v0.6.13) - Official support announcement
- [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html) - Reset token best practices

### Features Research
- [PocketBase Authentication Documentation](https://pocketbase.io/docs/authentication/) - Proven BaaS auth patterns
- [PocketBase Files Handling](https://pocketbase.io/docs/files-handling/) - Storage structure
- [PocketBase API Realtime](https://pocketbase.io/docs/api-realtime/) - SSE protocol
- [JWT Security Best Practices - Curity](https://curity.io/resources/learn/jwt-best-practices/) - Token design
- [MDN Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events) - SSE spec

### Architecture Research
- [Bun Single-File Executables](https://bun.com/docs/bundler/executables) - Embedded filesystem constraints
- [Bun SSE Implementation - GitHub Gist](https://gist.github.com/gtrabanco/7908bff2516a67e708509d5b224d822b) - TransformStream pattern
- [PocketBase Auth Discussion](https://github.com/pocketbase/pocketbase/discussions/169) - Token architecture insights

### Pitfalls Research
- [JWT Authorization: Avoiding Common Pitfalls - AuthZed](https://authzed.com/blog/pitfalls-of-jwt-authorization) - Token type confusion
- [Understanding Timing Attacks - PropelAuth](https://blog.propelauth.com/understanding-timing-attacks-with-code/) - User enumeration prevention
- [Password Hashing Guide 2025-2026](https://guptadeepak.com/the-complete-guide-to-password-hashing-argon2-vs-bcrypt-vs-scrypt-vs-pbkdf2-2026/) - Work factor recommendations
- [Multipart Form Data Issues in Bun - GitHub](https://github.com/oven-sh/bun/issues/21467) - Known Bun bugs
- [File Upload Vulnerabilities - Vaadata](https://www.vaadata.com/blog/file-upload-vulnerabilities-and-security-best-practices/) - Magic byte validation
- [SSE Comprehensive Guide - Medium](https://medium.com/@moali314/server-sent-events-a-comprehensive-guide-e4b15d147576) - Backpressure handling
- [PocketBase Realtime Discussion - GitHub](https://github.com/pocketbase/pocketbase/discussions/4427) - Hooks-based events

---
*Research completed: 2026-01-26*
*Ready for roadmap: yes*
