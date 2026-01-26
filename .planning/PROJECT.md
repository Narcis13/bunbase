# BunBase

## What This Is

A PocketBase alternative built with Bun, Hono-style routing, and SQLite — a complete backend-in-a-box that compiles to a single 56MB binary. Features schema-driven REST API generation, embedded React admin UI, lifecycle hooks, and JWT authentication.

## Core Value

Ship a working backend-in-a-box that compiles to a single binary and auto-generates REST APIs from schema definitions. Everything else is secondary until this works.

## Requirements

### Validated

- ✓ Schema manager with collection definitions and migrations — v0.1
- ✓ Auto-generated REST API (CRUD) from schema — v0.1
- ✓ Query capabilities (filtering, sorting, pagination, expansion) — v0.1
- ✓ Lifecycle hooks (before/after create, update, delete) — v0.1
- ✓ Embedded React admin UI (browse collections, CRUD records, define collections) — v0.1
- ✓ Admin-only authentication (protect admin UI) — v0.1
- ✓ Single binary compilation via `bun build --compile` — v0.1
- ✓ SQLite as the database layer — v0.1
- ✓ All 6 field types: text, number, boolean, datetime, json, relation — v0.1

### Active

- [ ] User authentication (email/password sign up/login)
- [ ] OAuth login (Google, GitHub)
- [ ] Realtime/SSE subscriptions
- [ ] File/image uploads with local storage
- [ ] Unique field constraints
- [ ] Select field type (predefined options)

### Out of Scope

- GraphQL API — REST sufficient, adds complexity
- PostgreSQL support — SQLite-only keeps scope tight
- Multi-tenancy — Enterprise feature, not needed for MVP
- MFA/OTP — Overkill for admin-only auth in v0.1
- Email sending — Requires SMTP config, defer with user auth
- API rate limiting — Can add via middleware later
- Audit logging — Nice-to-have, not core
- AI features — Foundation first, AI layer comes later

## Context

**Current state (v0.1 shipped):**
- ~5,000 lines TypeScript
- 209 automated tests
- Tech stack: Bun, bun:sqlite, React, Tailwind CSS v4, shadcn/ui, jose (JWT), zod

**Codebase structure:**
```
src/
├── api/        # HTTP server, routes, auth endpoints
├── auth/       # Admin CRUD, JWT, middleware
├── core/       # Database, schema, records, validation, hooks, query
├── admin/      # React admin UI components
└── cli.ts      # CLI entry point
```

**How to use:**
1. Build: `bun run build` → produces `bunbase` binary (56MB)
2. Run: `./bunbase --port 8090 --db app.db`
3. Admin: http://localhost:8090/_/

## Constraints

- **Single binary**: Must compile to one executable via `bun build --compile`
- **Zero runtime deps**: No external files needed to run
- **SQLite only**: No Postgres or other DBs yet
- **Port**: Default to 8090 (PocketBase convention)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Schema-in-database pattern | Runtime flexibility for collections | ✓ Good |
| nanoid for IDs | URL-safe, 21 chars, no hyphens | ✓ Good |
| Bun.serve() routes | Declarative, fast, built-in | ✓ Good |
| PocketBase-style hook middleware | Familiar pattern, cancellable | ✓ Good |
| Tailwind CSS v4 | CSS-based config, simpler setup | ✓ Good |
| shadcn/ui copy-paste | No npm package dependency | ✓ Good |
| Admin-only auth for v0.1 | Reduces complexity, user auth not needed to prove concept | ✓ Good |
| No file uploads in v0.1 | Storage layer adds significant scope | ✓ Good |
| No realtime/SSE in v0.1 | REST-only sufficient to prove API generation | ✓ Good |
| Hooks in v0.1 | Critical for extensibility, worth the scope | ✓ Good |

## Tech Debt

Minor items to address in v0.2:

- TypeScript type definitions for bun:sqlite need updating (runtime works)
- 2 orphaned exports to remove (listRecords, default hooks singleton)
- CSS warnings during build (cosmetic, no functional impact)

---
*Last updated: 2026-01-26 after v0.1 milestone*
