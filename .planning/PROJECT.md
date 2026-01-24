# BunBase

## What This Is

A PocketBase alternative built with Bun, Hono, and SQLite — designed as a solid foundation for AI-native features in future versions. v0.1 focuses on proving the core concept: schema-driven API generation, embedded admin UI, and single-binary deployment.

## Core Value

Ship a working backend-in-a-box that compiles to a single binary and auto-generates REST APIs from schema definitions. Everything else is secondary until this works.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Schema manager with collection definitions and migrations
- [ ] Auto-generated REST API (CRUD) from schema
- [ ] Lifecycle hooks (before/after create, update, delete)
- [ ] Embedded React admin UI (browse collections, CRUD records, define collections)
- [ ] Admin-only authentication (protect admin UI)
- [ ] Single binary compilation via `bun build --compile`
- [ ] SQLite as the database layer
- [ ] Basic field types: text, number, boolean, datetime
- [ ] Relation fields (foreign keys between collections)
- [ ] JSON field type for flexible data

### Out of Scope

- Realtime/SSE subscriptions — adds complexity, defer to v0.2
- File/image uploads — storage layer adds scope, defer to v0.2
- User authentication (email/password, OAuth) — admin-only auth sufficient for v0.1
- Password reset flow — no user auth means no reset needed
- AI features — this is the foundation layer for AI, not the AI layer itself
- PostgreSQL support — SQLite only for v0.1
- CLI scaffolding tool — manual setup is fine for v0.1

## Context

**Tech stack alignment:**
- Bun.js runtime with native SQLite support
- Hono.js for HTTP routing (fast, minimal, good DX)
- React for admin UI (to be embedded in binary)
- TypeScript throughout

**PocketBase reference:**
- Single binary deployment model
- Port 8090 default
- `/_/` prefix for admin routes
- `/api/collections/:name/records` pattern for data

**Admin UI embedding challenge:**
- Need to explore Bun's `--embed` flag vs pre-built asset inlining
- Goal: zero external files after compilation

**Demo goal:**
- Build a mini app (todo or blog backend) to prove the full loop works

## Constraints

- **Single binary**: Must compile to one executable via `bun build --compile`
- **Zero runtime deps**: No external files needed to run
- **SQLite only**: No Postgres or other DBs in v0.1
- **Timeline**: 2 weekends to working prototype
- **Port**: Default to 8090 (PocketBase convention)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Admin-only auth for v0.1 | Reduces complexity, user auth not needed to prove concept | — Pending |
| No file uploads in v0.1 | Storage layer adds significant scope | — Pending |
| No realtime/SSE in v0.1 | REST-only sufficient to prove API generation | — Pending |
| Explore embed approaches | Both Bun --embed and asset inlining are viable | — Pending |
| Hooks in v0.1 | Critical for extensibility, worth the scope | — Pending |

---
*Last updated: 2025-01-24 after initialization*
