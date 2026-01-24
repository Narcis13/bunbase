# Research Summary: BunBase

## One-Liner
Build a single-binary, PocketBase alternative using Bun's native SQLite and TypeScript ecosystem to deliver auto-generated REST APIs with an embedded React admin UI—zero external dependencies.

## Stack (from STACK.md)
**Runtime:** Bun 1.3.6+ (native SQLite, password hashing, single-binary compilation)
**Framework:** Hono 4.11.4 (ultrafast router, built-in JWT middleware)
**Database:** bun:sqlite with Drizzle ORM 0.45.1 (type-safe, zero deps, 3-6x faster than better-sqlite3)
**Admin UI:** React 19 + Vite 6 + TanStack Router/Query + Tailwind 4 (embedded via make-vfs)
**Auth:** Bun.password (argon2id) + hono/jwt
**Validation:** Zod 3.24 + @hono/zod-validator
**IDs:** nanoid 5.0.9 (21 chars, URL-safe, collision-resistant)

## Table Stakes Features

### Schema & Collections
- Collection CRUD (create, read, update, delete collections)
- System fields (id, created_at, updated_at)
- Basic field types: text, number, boolean, datetime, JSON, relation
- Field validation (required, unique)
- Indexes for performance
- Migration system with SQLite-aware shadow table patterns

### Auto-Generated REST API
- CRUD endpoints for all collections (`/api/collections/:collection/records`)
- List with pagination (page, perPage params)
- Filtering with operators (`=`, `!=`, `>`, `<`, `~` like, `&&`, `||`)
- Sorting (ASC/DESC with `-field` prefix)
- Field selection (return only requested fields)
- Relation expansion (auto-fetch related records)

### Admin UI
- Collection browser with pagination
- Record create/edit/delete forms (auto-generated from schema)
- Schema editor (add/edit/remove fields dynamically)
- Settings page for app configuration
- Responsive design
- Dashboard overview with stats

### Authentication (Admin-Only v0.1)
- Admin login with JWT
- Session/token management
- Protected API routes
- Password change capability

### Hooks System
- beforeCreate, afterCreate, beforeUpdate, afterUpdate, beforeDelete, afterDelete
- Collection-specific hooks
- Async hook support
- Middleware-style chain execution
- Priority-based ordering

## Build Order

Based on dependency analysis from ARCHITECTURE.md, these phases minimize rework:

1. **Database & Schema Foundation** - Core SQLite wrapper, SchemaManager, internal tables (`_collections`, `_fields`, `_migrations`). Enables programmatic collection creation.

2. **Migration System** - Schema evolution with SQLite-aware shadow table pattern (create new, copy data, drop old, rename). Critical to get right early.

3. **REST API Generator** - Auto-generate CRUD endpoints from schema. Basic list/get/create/update/delete without filters yet. Core value proposition.

4. **Filtering, Sorting, Pagination** - Query parameter support (`filter`, `sort`, `page`, `perPage`). Makes API production-ready.

5. **Relation Expansion** - Auto-fetch related records via `expand` parameter. High complexity but expected feature.

6. **Hook Manager + Model Hooks** - Lifecycle hooks (before/after CRUD). Enable extensibility without touching generated code.

7. **Admin Authentication** - JWT-based admin login, `requireAdmin()` middleware. Secures the system before adding UI.

8. **Admin UI (Collection Browser)** - React app with collection list, record browser, CRUD forms. First visual interface.

9. **Admin UI (Schema Editor)** - Runtime schema changes through UI. Completes the backend-in-a-box vision.

10. **Single Binary Compilation** - Embed React assets via make-vfs, compile with `bun build --compile`. Final distribution format.

## Top 5 Pitfalls to Avoid

1. **SQLite ALTER TABLE Limitations** (High Risk - Phase 1)
   Prevention: Build migration system with shadow table pattern from day one. Wrap in transactions, generate warnings, implement automatic backups.

2. **Hook Execution Order Chaos** (High Risk - Phase 6)
   Prevention: Implement explicit priority system (numeric, lower = first). Require `next()` calls. Log execution order in debug mode.

3. **Embedded Directory Inconsistencies** (High Risk - Phase 10)
   Prevention: Test compiled binary in isolation. Use explicit file imports with `import ... with { type: "file" }`. Create test suite verifying all assets accessible post-compile.

4. **Hook Error Handling Ambiguity** (High Risk - Phase 6)
   Prevention: Define clear semantics—`before*` errors cancel operation and rollback; `after*` errors log but operation committed. Provide `ctx.fail(message)` for clean failures.

5. **Binary Size Bloat** (High Risk - Phase 1)
   Prevention: Track binary size from day one in CI. Minify/tree-shake React aggressively. Profile bundles with `bun build --analyze`. Target <80MB for v0.1.

## Key Decision Points

### During Implementation

1. **Schema Storage Strategy** - Store schema in database (`_collections`, `_fields` tables), not code files. Enables runtime changes through admin UI.

2. **Synchronous vs Async DB Operations** - Use Bun's synchronous SQLite API (simpler code, faster for single-server). Keep hooks async for external calls.

3. **API Generation Timing** - Generate routes at runtime from database schema, not build time. Prevents schema-code drift.

4. **ID Generation** - Use nanoid (21 chars, URL-safe) for all record IDs. Shorter than UUID, same collision resistance.

5. **Admin UI Embedding** - Use make-vfs to pack React build into single .ts file, then compile. Avoid Bun's beta glob embed patterns.

6. **Migration Locking** - Implement optimistic locking with timeouts. Store lock PID/timestamp, expire stale locks. Provide `--force-unlock` CLI.

7. **Cross-Platform Builds** - Build binaries natively on each platform in CI (darwin-arm64, darwin-x64, linux-arm64, linux-x64). Don't rely on cross-compilation.

### Deferred to v0.2+

- File/image uploads (requires storage layer)
- User authentication (email/password, OAuth)
- Realtime/SSE subscriptions (WebSocket infrastructure)
- Email sending (SMTP config, templates)
- Select, Editor, Autodate field types
- View collections (SQL-based)
- Batch operations

### Out of Scope v0.1

- GraphQL API
- PostgreSQL support
- Multi-tenancy
- MFA/OTP
- CLI scaffolding tool

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| **Stack** | High | Bun 1.3.x is stable, Hono proven, Drizzle mature. All dependencies actively maintained. |
| **Features** | High | PocketBase provides clear reference implementation. Feature set well-scoped for v0.1. |
| **Architecture** | High | Component boundaries clean, dependency graph acyclic. Build order validated against PocketBase patterns. |
| **Pitfalls** | Medium | Bun compilation is beta, some edge cases. SQLite migration gotchas well-documented but require careful implementation. |

### Gaps to Address

- **Binary embedding strategy**: make-vfs vs Bun's native embed needs production validation. Plan: Build POC in Phase 10 to test both approaches.
- **Hook priority API design**: Numeric priorities vs named phases (before/after/default)? Research PocketBase hook ordering implementation.
- **Migration rollback**: SQLite has no transactions across DDL. Accept this limitation or implement application-level rollback?
- **Admin UI state management**: TanStack Query sufficient or need additional state layer? Validate during Phase 8.

## Implications for Roadmap

### Suggested Phase Structure

**Phase 1: Core Foundation (Database + Schema)**
Rationale: Everything depends on database layer and schema definitions. Establishes vocabulary for entire system.
Delivers: Programmatic collection creation, schema persistence to SQLite.
Features: SchemaManager, migration tracking tables, basic field types.
Pitfalls: Binary size tracking, SQLite limitations, migration locking.
Research: No additional research needed (well-documented patterns).

**Phase 2: API Auto-Generation**
Rationale: Core value proposition. With schema + API, you have a working backend.
Delivers: REST CRUD endpoints for any collection.
Features: APIGenerator, basic list/get/create/update/delete.
Pitfalls: Schema-code drift prevention.
Research: No additional research needed.

**Phase 3: Query Capabilities**
Rationale: Makes API production-ready. Filtering/sorting are table stakes.
Delivers: Full query parameter support.
Features: Filter operators, sorting, pagination, field selection, relation expansion.
Pitfalls: SQL injection via filter syntax (use parameterized queries).
Research: Possibly—filter syntax parsing can be complex. Consider `/gsd:research-phase` for filter language design.

**Phase 4: Extensibility (Hooks)**
Rationale: Enables customization without touching generated code.
Delivers: Lifecycle hooks for CRUD operations.
Features: HookManager, before/after hooks, priority system.
Pitfalls: Hook execution order chaos, error handling ambiguity.
Research: No additional research needed (PocketBase pattern clear).

**Phase 5: Security (Admin Auth)**
Rationale: Must secure system before adding UI.
Delivers: JWT-based admin authentication.
Features: AuthManager, login endpoint, `requireAdmin()` middleware.
Pitfalls: Session fixation, cookie flags, predictable IDs.
Research: No additional research needed (OWASP documented).

**Phase 6: Admin UI (Browser)**
Rationale: First visual interface. Requires full backend working.
Delivers: Collection/record browsing through web UI.
Features: React app, collection list, record browser, CRUD forms.
Pitfalls: Dev vs production mode differences.
Research: Possibly—React state management architecture. Standard patterns likely sufficient.

**Phase 7: Admin UI (Schema Editor)**
Rationale: Completes backend-in-a-box vision with runtime schema changes.
Delivers: Dynamic schema editing through UI.
Features: Field add/edit/remove, migration preview, validation.
Pitfalls: Schema editor generating unsafe migrations.
Research: Possibly—migration preview UX and safety validations.

**Phase 8: Single Binary Packaging**
Rationale: Final distribution format. Validates entire stack.
Delivers: `./bunbase` executable with embedded UI.
Features: make-vfs asset embedding, compile script, cross-platform builds.
Pitfalls: Embedded directory inconsistencies, binary size bloat, cross-platform issues.
Research: Possibly—embedding strategy POC if make-vfs insufficient.

### Research Flags

**Needs `/gsd:research-phase`:**
- Phase 3 (Query): Filter language parsing if complex syntax needed
- Phase 7 (Schema Editor): Migration safety validations
- Phase 8 (Packaging): Embedding strategy if make-vfs fails

**Standard Patterns (Skip Research):**
- Phase 1: Schema manager patterns well-documented
- Phase 2: REST API generation straightforward
- Phase 4: PocketBase hook system provides clear blueprint
- Phase 5: OWASP authentication patterns established
- Phase 6: React CRUD UI is standard problem

### Critical Path

1. Phase 1 (Foundation) must complete before all others—it's the keystone
2. Phase 2 (API) depends on Phase 1 but blocks Phase 3-4
3. Phase 5 (Auth) must complete before Phase 6-7 (Admin UI)
4. Phase 8 (Packaging) requires all phases complete

Parallel opportunities:
- Phase 4 (Hooks) and Phase 5 (Auth) can develop concurrently after Phase 2
- Phase 6 (Browser UI) and Phase 7 (Schema Editor UI) share React foundation

## Sources

### Stack Research
- [Bun Official Documentation](https://bun.com/docs)
- [Bun 1.3 Release Blog](https://bun.com/blog/bun-v1.3)
- [Hono Official Documentation](https://hono.dev)
- [Drizzle ORM Bun SQLite](https://orm.drizzle.team/docs/connect-bun-sqlite)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

### Features Research
- [PocketBase Documentation](https://pocketbase.io/docs/)
- [PocketBase API Collections Reference](https://pocketbase.io/docs/api-collections/)
- [PocketBase Event Hooks](https://pocketbase.io/docs/go-event-hooks/)

### Architecture Research
- [PocketBase GitHub Repository](https://github.com/pocketbase/pocketbase)
- [PocketBase DeepWiki - Core Architecture](https://deepwiki.com/pocketbase/pocketbase)
- [Hono Best Practices](https://hono.dev/docs/guides/best-practices)

### Pitfalls Research
- [Bun Single-file Executable Docs](https://bun.com/docs/bundler/executables)
- [Bun Embed Directory Issue #5445](https://github.com/oven-sh/bun/issues/5445)
- [EF Core SQLite Limitations](https://learn.microsoft.com/en-us/ef/core/providers/sqlite/limitations)
- [PocketBase Hook System (DeepWiki)](https://deepwiki.com/pocketbase/pocketbase/2.3-hook-system)
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)

---

*Research synthesized from 4 parallel research threads on 2026-01-24*
