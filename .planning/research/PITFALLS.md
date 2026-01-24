# Pitfalls Research: BunBase

## Critical Pitfalls

### 1. Binary Size Bloat from Bun Compile
**Risk Level:** High
**Description:** `bun build --compile` produces very large binaries. A "hello world" program is already 57MB. With React admin UI, SQLite, and all dependencies, the binary could easily exceed 100MB, making distribution cumbersome.

**Warning Signs:**
- Binary size exceeds 80MB for basic functionality
- CI/CD pipelines timing out during artifact upload
- Users complaining about download times

**Prevention:**
- Measure binary size from day one and track it in CI
- Minify and tree-shake the React admin UI aggressively
- Use `--asset-naming="[name].[ext]"` to control embedded file naming
- Consider make-vfs to pack assets into a single .js file before compile
- Exclude dev dependencies from the build
- Profile what's actually being bundled using `bun build --analyze`

**Phase:** Phase 1 (Core Infrastructure) - Establish baseline metrics early

---

### 2. Embedded Directory Inconsistencies
**Risk Level:** High
**Description:** Bun's directory embedding via glob patterns (e.g., `./embed/**`) is described as "in beta" with known bugs. Some patterns like `./embed/**/*` cause "ModuleNotFound" errors while `./embed/**` works. Files may not be fully included in builds.

**Warning Signs:**
- 404 errors for static assets that exist in source
- `EACCES: permission denied, mkdir '/$bunfs'` errors at runtime
- Inconsistent behavior between dev and compiled binary

**Prevention:**
- Test compiled binary in isolation (not in the project directory)
- Use explicit file imports with `import ... with { type: "file" }` for critical assets
- Create a test suite that verifies all expected assets are accessible post-compile
- Consider building React app as a single inlined JS bundle rather than directory embed
- Verify each embedded file is accessible via `Bun.file()` after compilation

**Phase:** Phase 2 (Admin UI Embedding) - Critical to verify before shipping

---

### 3. Native Module/FFI Failures in Compiled Binary
**Risk Level:** Medium
**Description:** When compiling binaries that use native modules or FFI, the compiled binary may work in the development directory but fail when deployed elsewhere. The binary tries to find node_modules externally.

**Warning Signs:**
- `ERR_DLOPEN_FAILED: Failed to open library` at runtime
- Works in dev directory, fails when copied elsewhere
- Missing `.dylib` or `.so` errors

**Prevention:**
- Avoid native modules for v0.1 where possible
- If FFI needed, use `import ... with { type: "file" }` to embed .dylib files
- Use `bun:sqlite` (built-in) instead of better-sqlite3 (native)
- Test binary in a clean directory without node_modules
- For production FFI, consider Node-API modules over bun:ffi (more stable)

**Phase:** Phase 1 (Core) - Make architectural decision early

---

### 4. SQLite ALTER TABLE Limitations
**Risk Level:** High
**Description:** SQLite has extremely limited ALTER TABLE support. You cannot rename columns, drop columns, or change column types directly. This requires a 4-step dance: create new table, copy data, drop old table, rename new table.

**Warning Signs:**
- `NotSupportedException` during migrations
- Users report schema changes failing silently
- Data loss during migrations

**Prevention:**
- Build migration system aware of SQLite limitations from day one
- Implement "shadow table" pattern for schema changes:
  1. Create `_new_tablename` with new schema
  2. Copy data with transformation
  3. Drop old table
  4. Rename new table
- Always wrap migrations in transactions
- Generate migration warnings when detecting risky operations
- Implement automatic backup before migrations
- Use `PRAGMA user_version` for version tracking

**Phase:** Phase 1 (Schema Manager) - Core architecture decision

---

### 5. Migration Locking Deadlocks
**Risk Level:** Medium
**Description:** SQLite doesn't have built-in migration locking. If you implement custom locking (like EF Core's `__EFMigrationsLock` table), failed migrations can leave locks that block all future migrations.

**Warning Signs:**
- "Migration already in progress" errors when no migration is running
- Server won't start after a crash during migration
- Manual database intervention required

**Prevention:**
- Use lock timeouts with automatic cleanup
- Store lock PID and timestamp, expire stale locks
- Provide CLI command to force-release locks: `bunbase migrate --force-unlock`
- Log detailed migration state for debugging
- Consider optimistic locking over pessimistic

**Phase:** Phase 1 (Schema Manager) - Build into migration system

---

### 6. Hook Execution Order Chaos
**Risk Level:** High
**Description:** With multiple hooks (beforeCreate, afterCreate, beforeUpdate, etc.) registered by different sources (user code, plugins, system), execution order becomes unpredictable. Hooks may have implicit dependencies on each other.

**Warning Signs:**
- "Random" failures depending on hook registration order
- Race conditions between hooks modifying same data
- Users confused why their hook doesn't see changes from another hook

**Prevention:**
- Implement explicit priority system (PocketBase uses numeric priority, lower = first)
- Document hook execution order clearly
- Require hooks to call `next()` or equivalent to continue chain
- Provide hook context with `stopPropagation()` capability
- Log hook execution order in debug mode
- Validate no circular dependencies at registration time

**Phase:** Phase 2 (Hooks System) - Design carefully before implementation

---

### 7. Hook Error Handling Ambiguity
**Risk Level:** High
**Description:** When a hook throws an error, what happens? Does the transaction roll back? Does the API return 500? Do subsequent hooks run? Unclear semantics lead to data corruption and debugging nightmares.

**Warning Signs:**
- Partial data created when hook fails
- Users unsure how to handle errors in hooks
- Inconsistent error responses from API

**Prevention:**
- Define clear error handling semantics in docs:
  - `before*` errors: Cancel operation, return error to client, no DB changes
  - `after*` errors: Operation committed, error logged, optionally returned
- Wrap all operations in transactions that roll back on beforeHook failure
- Provide `ctx.fail(message)` for clean hook failures vs thrown exceptions
- Consider `onError` hook for centralized error handling
- Log all hook errors with full context

**Phase:** Phase 2 (Hooks System) - Document before implementing

---

### 8. React Admin UI Hot Reload vs Embedded Binary Mismatch
**Risk Level:** Medium
**Description:** During development, the React admin UI hot-reloads. But the compiled binary has a frozen snapshot. Developers may test features in dev mode that work differently (or not at all) in the compiled binary.

**Warning Signs:**
- "Works in dev, broken in prod" reports
- Admin UI features that rely on dev server behavior
- File upload paths that work in dev but fail compiled

**Prevention:**
- Always test compiled binary before release
- Set up CI that tests both dev and compiled modes
- Document differences between dev and production modes
- Use same code paths for serving assets in both modes where possible
- Create "production preview" command: `bunbase preview --compile`

**Phase:** Phase 2 (Admin UI) - Establish testing workflow

---

### 9. Schema-Code Drift in API Generation
**Risk Level:** Medium
**Description:** When generating APIs from schema, the generated code can drift from the schema definition over time. Users may modify generated code, then regenerate and lose changes. Or schema updates don't propagate.

**Warning Signs:**
- API behavior doesn't match schema definition
- Regenerating APIs breaks existing functionality
- Users modifying generated code directly

**Prevention:**
- Generate APIs at runtime, not build time (like PocketBase)
- Store schema as source of truth in SQLite `_collections` table
- Never generate user-editable files
- Hooks provide extension point instead of code modification
- Clear separation: schema -> generated (untouchable) -> hooks (user code)

**Phase:** Phase 1 (API Generator) - Core architecture decision

---

### 10. Cross-Platform Binary Issues
**Risk Level:** Medium
**Description:** Bun's cross-compilation can produce binaries that fail on target platforms. Specifically, building on Mac for Linux ARM64 in devcontainers produces "cannot execute binary file: Exec format error".

**Warning Signs:**
- CI builds fail on different architectures
- Users report binary won't run on their platform
- "Exec format error" messages

**Prevention:**
- Build binaries natively on each target platform in CI
- Use GitHub Actions matrix for darwin-arm64, darwin-x64, linux-arm64, linux-x64
- Provide clear platform support documentation
- Test each platform binary before release
- Consider Bun's `--target` flag carefully, test results

**Phase:** Phase 4 (Distribution) - CI/CD setup

---

## Bun-Specific Gotchas

### SQLite Version Discrepancy
- **Issue:** On macOS, `bun:sqlite` may report SQLite 3.37.0 even when release notes say 3.51.0
- **Solution:** Don't rely on specific SQLite features without testing on all platforms. Document minimum SQLite version required.

### Parameter Binding Prefix
- **Issue:** By default, `bun:sqlite` requires `$`, `:`, or `@` prefix for parameters and doesn't error on missing params
- **Solution:** Always use `strict: true` in Database constructor: `new Database('data.db', { strict: true })`

### No WAL2 Support
- **Issue:** Bun's built-in SQLite doesn't support WAL2 journal mode
- **Solution:** Use WAL mode (not WAL2) for concurrent reads. Document this limitation.

### better-sqlite3 Compatibility
- **Issue:** Libraries expecting better-sqlite3 (like better-auth) won't work with bun:sqlite
- **Solution:** Create adapter layer or use bun:sqlite directly. Avoid libraries requiring better-sqlite3.

### Vite Dev Mode Conflict
- **Issue:** `bun:sqlite` imports fail in Vite dev/preview with `ERR_UNSUPPORTED_ESM_URL_SCHEME`
- **Solution:** Use Bun's native dev server, not Vite, for backend. Vite only for admin UI build.

### bun:ffi is Experimental
- **Issue:** bun:ffi has known bugs and should not be used in production
- **Solution:** Use Node-API modules for native code, or avoid native code entirely in v0.1

---

## Single Binary Challenges

### Read-Only Embedded Files
- **Challenge:** Embedded files are read-only; cannot be modified at runtime
- **Approach:** SQLite database file must be external (not embedded). Only embed static assets like UI.

### Development Workflow Friction
- **Challenge:** Hot reloading doesn't work with embedded assets; must rebuild binary to test changes
- **Approach:** Implement dev mode that serves files directly from disk. Only embed for production build.

### Larger Binary = Slower CI
- **Challenge:** Large binaries slow down CI/CD pipelines and distribution
- **Approach:** Use artifact caching aggressively. Consider delta updates for releases. Compress assets before embedding.

### Security of Embedded Code
- **Challenge:** Compiled binaries may still contain readable JS/CSS source in plaintext
- **Approach:** Accept this limitation (like Electron apps). Don't embed secrets. Document that binary is not obfuscated.

### Debugging Production Issues
- **Challenge:** Source maps don't work in compiled binaries; stack traces point to bundled code
- **Approach:** Implement comprehensive logging. Include version info in error reports. Provide debug mode flag.

---

## Lessons from PocketBase

### Backward Compatibility Not Guaranteed (Pre-v1)
- **Learning:** PocketBase explicitly states backward compatibility isn't guaranteed before v1, requiring manual migration steps
- **How to Apply:** Version BunBase clearly. Document all breaking changes. Provide migration guides for each release.

### Single Developer Risk
- **Learning:** PocketBase is a hobby project with one maintainer; users accept this tradeoff
- **How to Apply:** Be transparent about project status. Build with maintainability in mind. Consider bus factor.

### API Rules Complexity
- **Learning:** PocketBase's API rules translate to SQL and create unexpected joins; they're hard to debug
- **How to Apply:** Keep API rules simple for v0.1. Document how rules translate to queries. Provide rule debugging tools.

### Write-Heavy Workloads
- **Learning:** PocketBase/SQLite not suitable for write-heavy, high-availability, or horizontally-scaled apps
- **How to Apply:** Document limitations clearly. Target appropriate use cases (MVPs, side projects, single-server). Don't overpromise.

### Auto-Migration Gotcha
- **Learning:** PocketBase auto-generates migrations from admin UI changes, which can surprise developers
- **How to Apply:** Make auto-migration opt-in, not default. Always show what migration will be generated before applying.

### Hooks Must Call next()
- **Learning:** PocketBase hooks use chain-of-responsibility; forgetting `e.Next()` stops all subsequent hooks
- **How to Apply:** Make this very clear in docs. Consider auto-calling next unless explicitly stopped. Warn in dev mode if next() not called.

---

## Migration/Schema Pitfalls

### Large Table Migrations
- **Issue:** Copying millions of rows during shadow table migration can take minutes and lock the database
- **Prevention:** Implement batched migrations. Show progress. Allow resumable migrations. Warn on large tables.

### Modifying Executed Migrations
- **Issue:** Changing an already-run migration script causes state mismatch and potential data loss
- **Prevention:** Make migration files immutable once applied. Hash-check migration content. Warn if modified.

### No Procedural Language
- **Issue:** SQLite has no stored procedures; can't generate idempotent migration scripts easily
- **Prevention:** Track migration state in `_migrations` table. Check before running. Generate simple SQL only.

### Foreign Key Constraints During Migration
- **Issue:** Foreign key checks can cause migration failures when reordering tables
- **Prevention:** Disable foreign key checks during migration: `PRAGMA foreign_keys = OFF`, then re-enable and validate.

### Index Creation Performance
- **Issue:** Creating indexes on large tables is slow and blocks reads
- **Prevention:** Create indexes after bulk inserts, not during. Consider `CREATE INDEX CONCURRENTLY` equivalent patterns.

### Lost Data on Column Removal
- **Issue:** Shadow table migrations permanently delete data from removed columns
- **Prevention:** Archive removed columns to `_schema_archive` table. Warn before destructive migrations. Require `--force` for data loss.

---

## Authentication/Session Pitfalls (For v0.1 Admin Auth)

### Session Fixation
- **Issue:** Failing to regenerate session ID after login allows attackers to hijack sessions
- **Prevention:** Always regenerate session/token after successful authentication

### Predictable Session IDs
- **Issue:** Sequential or predictable session IDs can be guessed
- **Prevention:** Use cryptographically secure random generation (128-bit minimum)

### Missing Cookie Flags
- **Issue:** Cookies without HttpOnly, Secure, SameSite flags are vulnerable to XSS/CSRF
- **Prevention:** Always set all three flags. Default to strictest settings.

---

## Sources

### Bun Compile & Bundling
- [Bun Single-file Executable Docs](https://bun.com/docs/bundler/executables)
- [Bun Issue #14676 - Compile Not Standalone](https://github.com/oven-sh/bun/issues/14676)
- [Bun Issue #5445 - Embed Directory](https://github.com/oven-sh/bun/issues/5445)
- [Bun Issue #23852 - Embedded Directories Not Fully Included](https://github.com/oven-sh/bun/issues/23852)
- [Nuxt as Bun Executable Discussion](https://github.com/nuxt/nuxt/discussions/27746)

### Bun SQLite
- [Bun SQLite Docs](https://bun.com/docs/runtime/sqlite)
- [Bun Issue #24956 - better-sqlite3 Crashes](https://github.com/oven-sh/bun/issues/24956)
- [Bun Issue #24957 - SQLite Version Discrepancy](https://github.com/oven-sh/bun/issues/24957)

### Bun FFI
- [Bun FFI Docs](https://bun.com/docs/runtime/ffi)
- [Bun Issue #5680 - FFI Build Issues](https://github.com/oven-sh/bun/issues/5680)

### PocketBase
- [PocketBase Production Discussion](https://github.com/pocketbase/pocketbase/discussions/4032)
- [PocketBase Survival Discussion](https://github.com/pocketbase/pocketbase/discussions/3087)
- [PocketBase Hook System (DeepWiki)](https://deepwiki.com/pocketbase/pocketbase/2.3-hook-system)
- [PocketBase Migrations (DeepWiki)](https://deepwiki.com/pocketbase/pocketbase/7-migrations-system)
- [PocketBase API Rules Guide](https://dev.to/victorioberra/pocketbase-api-rules-1mj)

### SQLite Migrations
- [Declarative Schema Migration for SQLite](https://david.rothlis.net/declarative-schema-migration-for-sqlite/)
- [EF Core SQLite Limitations](https://learn.microsoft.com/en-us/ef/core/providers/sqlite/limitations)
- [Drizzle SQLite Migrations](https://andriisherman.medium.com/migrations-with-drizzle-just-got-better-push-to-sqlite-is-here-c6c045c5d0fb)

### Backend Framework Patterns
- [Top 10 Backend Mistakes 2025](https://brainhub.eu/library/mistakes-backend-developers)
- [6 Common Backend Architecture Mistakes](https://arunangshudas.com/blog/6-common-mistakes-in-backend-architecture-design/)
- [API Design Best Practices (Microsoft)](https://learn.microsoft.com/en-us/azure/architecture/best-practices/api-design)

### Hono
- [Hono Best Practices](https://hono.dev/docs/guides/best-practices)
- [Hono Middleware Guide](https://hono.dev/docs/guides/middleware)

### Single Binary Deployment
- [Embedding Frontend Assets in Go](https://leapcell.io/blog/embedding-frontend-assets-in-go-binaries-with-embed-package)
- [embed.FS in Production](https://dev.to/rezmoss/embedded-file-systems-using-embedfs-in-production-89-2fpa)

### Session Management
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [Session Management Best Practices (Stytch)](https://stytch.com/blog/session-management-best-practices/)
