# Project Milestones: BunBase

## v0.2 User Auth, Files & Realtime (Shipped: 2026-01-28)

**Delivered:** Extended BunBase with user authentication (email/password, JWT, email verification, password reset), file uploads (multipart, validation, storage), and realtime/SSE subscriptions with permission filtering.

**Phases completed:** 9-13 (24 plans total)

**Key accomplishments:**

- Email service with SMTP configuration, template placeholders, and graceful degradation
- User authentication with JWT tokens, email verification, password reset, and collection-level auth rules
- File uploads with multipart handling, validation, local storage, and automatic cleanup
- Realtime/SSE with permission-filtered event broadcasting and connection lifecycle management
- Admin UI polish with loading spinners, form validation accessibility, keyboard navigation, and responsive layout

**Stats:**

- 128 files modified
- ~23,400 lines added (20,338 total LOC TypeScript)
- 5 phases, 24 plans, 41 requirements
- 1 day from start to ship (2026-01-27)
- 470 automated tests

**Git range:** `2fcf341` → `c75fa5c`

**What's next:** OAuth login (v0.3), unique field constraints, select field type

---

## v0.1 MVP (Shipped: 2026-01-26)

**Delivered:** A complete backend-in-a-box that compiles to a single 56MB binary with auto-generated REST APIs, embedded React admin UI, and zero runtime dependencies.

**Phases completed:** 1-8 (21 plans total)

**Key accomplishments:**

- Schema-in-database with dynamic Zod validation for 6 field types (text, number, boolean, datetime, json, relation)
- Auto-generated REST API with full CRUD, filtering, sorting, pagination, and relation expansion
- Lifecycle hooks with before/after events for create/update/delete operations
- JWT-based admin authentication with argon2id password hashing and route protection
- React admin UI with TanStack Table, records management, and live schema editor
- 56MB single binary with embedded assets via `bun build --compile`

**Stats:**

- 148 files created/modified
- ~5,000 lines of TypeScript
- 8 phases, 21 plans
- 3 days from project init to ship (2026-01-24 → 2026-01-26)
- 209 automated tests

**Git range:** `b19a904` → `e9e3031`

**What's next:** User authentication (v0.2), realtime/SSE subscriptions, file uploads

---

*First milestone for BunBase - proving the core concept works*
