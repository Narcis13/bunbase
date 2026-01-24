# BunBase MVP Planning Session

Review `bunbase-reference.md` and create a detailed, implementable MVP plan.

## Context
Building a PocketBase alternative with Bun + SQLite + TypeScript + AI-native features. Target: working prototype in 2 weekends.

## Deliverables Needed

### 1. Project Structure
Define the exact folder/file structure for the monorepo (core library + admin UI + example app).

### 2. Core Modules Breakdown
For each module, specify:
- Public API (types/interfaces)
- Internal implementation approach
- Dependencies
- Test strategy

Modules to plan:
- **SchemaManager** - collection definitions, migrations, metadata storage
- **APIGenerator** - auto CRUD routes from schema
- **HookManager** - before/after lifecycle hooks
- **AuthManager** - JWT auth, sessions, password hashing
- **RealtimeManager** - SSE subscriptions
- **AdminEmbed** - serving bundled React UI from memory

### 3. Database Schema
Design the internal SQLite tables (`_collections`, `_users`, `_migrations`, `_hooks`, etc.) with exact CREATE statements.

### 4. MVP Scope Definition
Draw a clear line: what's IN vs OUT for MVP. Be ruthless - no AI features in v0.1, just PocketBase parity.

### 5. Implementation Order
Numbered sequence of tasks with estimated hours. Each task should be completable in one sitting (2-4h max).

### 6. API Contract
Define the REST API spec for:
- Collection management (`/_/api/collections`)
- Record CRUD (`/api/collections/:name/records`)
- Auth endpoints (`/api/auth/*`)
- Realtime (`/api/realtime`)

### 7. Risk Assessment
Top 3 technical risks and mitigation strategies.

## Constraints
- Single `bun build --compile` output
- Zero external runtime dependencies
- Port 8090 default (configurable)
- SQLite only (no Postgres in MVP)
- No AI features in MVP core (add as separate phase)

## Output Format
Structured markdown with code examples where helpful. Prioritize clarity over comprehensiveness.
