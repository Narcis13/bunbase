# Architecture Research: BunBase

## System Overview

BunBase is a backend-in-a-box system that compiles to a single binary, auto-generates REST APIs from schema definitions, and serves an embedded React admin UI. The architecture follows PocketBase's proven single-process model while leveraging Bun's native SQLite support and TypeScript ecosystem.

**Core Philosophy:**
- Single binary, zero external files
- Schema-driven API generation
- Middleware-style hook chains
- Embedded admin UI served from memory
- SQLite as the sole database (v0.1)

## Component Architecture

### SchemaManager

**Responsibility:** Define and manage collection schemas, track metadata, handle migrations, generate SQL DDL.

**Dependencies:**
- `bun:sqlite` Database instance
- Internal metadata tables (`_collections`, `_fields`, `_migrations`)

**Exposes:**
```typescript
interface SchemaManager {
  // Collection CRUD
  createCollection(def: CollectionDefinition): Collection
  updateCollection(name: string, changes: Partial<CollectionDefinition>): Collection
  deleteCollection(name: string): void
  getCollection(name: string): Collection | null
  listCollections(): Collection[]

  // Migration tracking
  runMigrations(): MigrationResult[]
  getMigrationStatus(): MigrationStatus

  // Schema introspection
  getFields(collection: string): Field[]
  validateRecord(collection: string, data: unknown): ValidationResult
}
```

**Internal Tables:**
- `_collections`: Stores collection metadata (name, created_at, updated_at)
- `_fields`: Stores field definitions (collection_id, name, type, required, unique, default, options)
- `_migrations`: Tracks applied migrations (version, applied_at)

**Key Insight from PocketBase:** PocketBase stores schema in the database itself, not in code files. This enables runtime schema changes through the admin UI. BunBase should follow this pattern.

---

### APIGenerator

**Responsibility:** Dynamically create Hono routes for each collection based on schema definitions.

**Dependencies:**
- SchemaManager (for collection/field metadata)
- HookManager (for lifecycle hooks)
- Hono app instance
- Database instance

**Exposes:**
```typescript
interface APIGenerator {
  // Route generation
  generateRoutes(app: Hono): void
  regenerateForCollection(collection: string): void

  // Route handlers (internal, but testable)
  listRecords(collection: string, query: QueryParams): Record[]
  getRecord(collection: string, id: string): Record | null
  createRecord(collection: string, data: unknown): Record
  updateRecord(collection: string, id: string, data: unknown): Record
  deleteRecord(collection: string, id: string): void
}
```

**Generated Endpoints Pattern:**
```
GET    /api/collections/:collection/records      → listRecords
GET    /api/collections/:collection/records/:id  → getRecord
POST   /api/collections/:collection/records      → createRecord
PATCH  /api/collections/:collection/records/:id  → updateRecord
DELETE /api/collections/:collection/records/:id  → deleteRecord
```

**Query Parameters (list endpoint):**
- `filter`: SQL WHERE-like filter syntax
- `sort`: Field name with optional `-` prefix for descending
- `page`: Page number (default 1)
- `perPage`: Records per page (default 30, max 500)
- `expand`: Relation fields to expand

---

### HookManager

**Responsibility:** Register and execute lifecycle hooks before/after database operations.

**Dependencies:**
- None (standalone event system)

**Exposes:**
```typescript
interface HookManager {
  // Registration
  on(event: HookEvent, handler: HookHandler): () => void  // Returns unsubscribe

  // Execution
  trigger(event: HookEvent, context: HookContext): Promise<HookContext>
}

type HookEvent =
  | 'beforeCreate' | 'afterCreate'
  | 'beforeUpdate' | 'afterUpdate'
  | 'beforeDelete' | 'afterDelete'
  | 'beforeList'   | 'afterList'
  | 'beforeGet'    | 'afterGet'

interface HookContext {
  collection: string
  record?: Record
  records?: Record[]
  data?: unknown
  error?: Error
  // Allow hooks to modify or abort
  abort(reason: string): void
  modify(data: Partial<Record>): void
}
```

**Execution Model:** Hooks execute as a middleware chain (like Hono middleware). Each handler receives context and can:
1. Modify the context
2. Abort the operation
3. Pass through unchanged

**PocketBase Insight:** PocketBase provides ~30+ hook events covering the entire lifecycle. For v0.1, BunBase focuses on the essential CRUD hooks.

---

### AuthManager

**Responsibility:** Admin authentication only (v0.1). JWT token generation, session management, password hashing.

**Dependencies:**
- Database instance (for admin credentials storage)
- `Bun.password` (for hashing)
- JWT library (jose or similar)

**Exposes:**
```typescript
interface AuthManager {
  // Setup
  initAdminAccount(email: string, password: string): void
  isAdminConfigured(): boolean

  // Auth operations
  login(email: string, password: string): Promise<{ token: string }>
  verifyToken(token: string): Promise<AdminPayload | null>

  // Middleware
  requireAdmin(): MiddlewareHandler  // Hono middleware
}
```

**Admin Storage:**
- Single `_admins` table with email, password_hash, created_at
- v0.1: Single admin user only (no multi-admin)

**JWT Structure:**
```typescript
interface AdminPayload {
  type: 'admin'
  id: string
  email: string
  iat: number
  exp: number
}
```

---

### AdminEmbed

**Responsibility:** Serve the pre-built React admin UI from memory. Handle static assets without filesystem access.

**Dependencies:**
- Pre-built React bundle (embedded at compile time)
- Hono app instance

**Exposes:**
```typescript
interface AdminEmbed {
  // Route registration
  registerRoutes(app: Hono): void

  // Asset serving
  getAsset(path: string): { content: Uint8Array, contentType: string } | null
}
```

**Embedding Strategy:**

Option A: **Bun's --embed flag** (preferred if available)
```typescript
// At build time: bun build --compile --embed admin-dist
import adminAssets from './admin-dist' with { type: 'file' }
```

Option B: **Inline assets as base64/binary in code**
```typescript
// Build script generates this:
const ADMIN_ASSETS = {
  'index.html': { content: new Uint8Array([...]), type: 'text/html' },
  'assets/index.js': { content: new Uint8Array([...]), type: 'application/javascript' },
  // ...
}
```

**Routes:**
```
GET /_/           → Serve index.html
GET /_/*          → Serve static assets
```

---

## Data Flow

### Request Lifecycle

```
                                    ┌──────────────────┐
                                    │   AdminEmbed     │
                                    │  (/_/* routes)   │
                                    └────────▲─────────┘
                                             │ (admin UI)
                                             │
┌──────────┐    ┌──────────────┐    ┌────────┴─────────┐
│  Client  │───▶│ Hono Router  │───▶│  Route Matcher   │
└──────────┘    └──────────────┘    └────────┬─────────┘
                                             │
                    ┌────────────────────────┼────────────────────────┐
                    │ (API routes)           │                        │
                    ▼                        │                        │
           ┌───────────────┐                 │                        │
           │  AuthManager  │◀────────────────┘                        │
           │  (middleware) │                                          │
           └───────┬───────┘                                          │
                   │ (if protected)                                   │
                   ▼                                                  │
           ┌───────────────┐         ┌───────────────┐               │
           │  APIGenerator │────────▶│ SchemaManager │               │
           │  (handlers)   │         │ (validation)  │               │
           └───────┬───────┘         └───────────────┘               │
                   │                                                  │
                   ▼                                                  │
           ┌───────────────┐                                          │
           │  HookManager  │◀─────────────────────────────────────────┘
           │ (before hooks)│          (user-defined hooks)
           └───────┬───────┘
                   │
                   ▼
           ┌───────────────┐
           │   Database    │
           │   (SQLite)    │
           └───────┬───────┘
                   │
                   ▼
           ┌───────────────┐
           │  HookManager  │
           │ (after hooks) │
           └───────┬───────┘
                   │
                   ▼
           ┌───────────────┐
           │   Response    │
           │   (JSON)      │
           └───────────────┘
```

### Create Record Flow (Detailed)

```
POST /api/collections/posts/records
         │
         ▼
┌─────────────────────────────────────┐
│ 1. AuthManager.requireAdmin()       │
│    - Verify JWT token               │
│    - Reject if not admin            │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ 2. SchemaManager.getCollection()    │
│    - Load collection metadata       │
│    - Load field definitions         │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ 3. SchemaManager.validateRecord()   │
│    - Check required fields          │
│    - Validate field types           │
│    - Check unique constraints       │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ 4. HookManager.trigger('beforeCreate')
│    - Execute user hooks             │
│    - Allow modification/abort       │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ 5. Database.insert()                │
│    - Generate ID                    │
│    - Set timestamps                 │
│    - Execute INSERT SQL             │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ 6. HookManager.trigger('afterCreate')
│    - Execute user hooks             │
│    - Cannot modify record           │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ 7. Return JSON response             │
│    { id, ...fields, created_at }    │
└─────────────────────────────────────┘
```

---

## Proposed File Structure

```
bunbase/
├── src/
│   ├── index.ts              # Entry point, app bootstrap
│   ├── app.ts                # Hono app configuration
│   │
│   ├── core/
│   │   ├── schema.ts         # SchemaManager implementation
│   │   ├── api.ts            # APIGenerator implementation
│   │   ├── hooks.ts          # HookManager implementation
│   │   ├── auth.ts           # AuthManager implementation
│   │   └── database.ts       # Database wrapper & utilities
│   │
│   ├── admin/
│   │   ├── embed.ts          # AdminEmbed implementation
│   │   └── assets.ts         # Generated asset map (build artifact)
│   │
│   ├── types/
│   │   ├── collection.ts     # Collection, Field types
│   │   ├── record.ts         # Record types
│   │   ├── hooks.ts          # Hook event types
│   │   └── api.ts            # Request/Response types
│   │
│   └── utils/
│       ├── id.ts             # ID generation (nanoid/cuid)
│       ├── sql.ts            # SQL query builder helpers
│       └── validation.ts     # Shared validation utilities
│
├── admin-ui/                 # React admin UI (separate build)
│   ├── src/
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── Collections.tsx
│   │   │   ├── Records.tsx
│   │   │   └── Settings.tsx
│   │   └── components/
│   ├── package.json
│   └── vite.config.ts
│
├── scripts/
│   ├── build.ts              # Build script (compile + embed)
│   └── embed-assets.ts       # Asset embedding utility
│
├── package.json
├── tsconfig.json
└── bunfig.toml
```

---

## Build Order (Phases)

### Phase 1: Database & Schema Foundation

**Build:** `src/core/database.ts`, `src/core/schema.ts`, `src/types/collection.ts`

**Rationale:** Everything depends on the database layer and schema definitions. The SchemaManager creates internal tables (`_collections`, `_fields`, `_migrations`) and provides the vocabulary for the entire system.

**Deliverable:** Can create collections programmatically, persist schema to SQLite.

---

### Phase 2: API Generation

**Build:** `src/core/api.ts`, `src/types/record.ts`, `src/types/api.ts`

**Dependencies:** SchemaManager (to know what collections exist and their fields)

**Rationale:** API generation is the core value proposition. With schema + API, you have a working backend (minus hooks and auth).

**Deliverable:** CRUD endpoints work for any collection defined in schema.

---

### Phase 3: Hook System

**Build:** `src/core/hooks.ts`, `src/types/hooks.ts`

**Dependencies:** None (standalone), but integrates with APIGenerator

**Rationale:** Hooks enable extensibility. APIGenerator calls HookManager at appropriate lifecycle points.

**Deliverable:** Can register hooks that fire before/after CRUD operations.

---

### Phase 4: Admin Authentication

**Build:** `src/core/auth.ts`

**Dependencies:** Database (for admin storage)

**Rationale:** Admin auth protects the system. Before embedding the admin UI, we need authentication to secure it.

**Deliverable:** JWT-based admin login, middleware to protect routes.

---

### Phase 5: Admin UI Embedding

**Build:** `src/admin/embed.ts`, `src/admin/assets.ts`, `admin-ui/*`

**Dependencies:** AuthManager (to protect admin routes), full working backend to interact with

**Rationale:** Admin UI is the final integration layer. It requires all other components to be functional.

**Deliverable:** Admin UI served from memory, can browse collections and CRUD records.

---

### Phase 6: Single Binary Compilation

**Build:** `scripts/build.ts`, build configuration

**Dependencies:** All components complete

**Rationale:** Final polish. Combines admin assets + backend into one executable.

**Deliverable:** `./bunbase` single binary that runs everything.

---

## Integration Points

| Component A | Component B | Interface | Direction |
|-------------|-------------|-----------|-----------|
| APIGenerator | SchemaManager | `getCollection()`, `validateRecord()` | APIGenerator calls SchemaManager |
| APIGenerator | HookManager | `trigger(event, context)` | APIGenerator triggers hooks |
| APIGenerator | Database | `query()`, `run()` | APIGenerator executes SQL |
| AuthManager | Database | `query()`, `run()` | Auth reads/writes admin table |
| AdminEmbed | AuthManager | `requireAdmin()` middleware | Admin routes protected |
| Hono App | APIGenerator | `generateRoutes(app)` | App registers API routes |
| Hono App | AdminEmbed | `registerRoutes(app)` | App registers admin routes |
| Hono App | AuthManager | Middleware injection | Auth middleware in chain |

### Dependency Graph

```
                    ┌────────────┐
                    │  Database  │
                    └─────┬──────┘
                          │
          ┌───────────────┼───────────────┐
          │               │               │
          ▼               ▼               ▼
    ┌───────────┐   ┌───────────┐   ┌───────────┐
    │ SchemaMan │   │ AuthMan   │   │ HookMan   │
    └─────┬─────┘   └─────┬─────┘   └─────┬─────┘
          │               │               │
          └───────────────┼───────────────┘
                          │
                          ▼
                   ┌─────────────┐
                   │ APIGenerator│
                   └──────┬──────┘
                          │
                          ▼
                   ┌─────────────┐
                   │  Hono App   │◀──────┐
                   └──────┬──────┘       │
                          │              │
                          ▼              │
                   ┌─────────────┐       │
                   │ AdminEmbed  │───────┘
                   └─────────────┘
```

---

## Key Design Decisions

### 1. Schema in Database vs Code Files

**Decision:** Store schema in database (like PocketBase), not in code files (like Strapi).

**Rationale:**
- Enables runtime schema changes through admin UI
- Single source of truth
- No sync issues between code and database
- Simpler deployment (just the binary + data.db)

### 2. Synchronous SQLite Operations

**Decision:** Use Bun's synchronous SQLite API.

**Rationale:**
- `bun:sqlite` is synchronous by design
- Simpler code (no async/await for DB operations)
- Performance: synchronous is often faster for single-server SQLite
- Hooks still async (for external API calls)

### 3. Middleware-Style Hook Chain

**Decision:** Hooks execute as a chain, each can modify or abort.

**Rationale:**
- Familiar pattern (Express/Hono middleware)
- Composable (multiple hooks per event)
- Controllable (abort prevents DB operation)
- PocketBase uses this exact pattern with `e.Next()`

### 4. ID Generation Strategy

**Decision:** Use nanoid (21 chars, URL-safe) for record IDs.

**Rationale:**
- Collision-resistant
- URL-safe (no encoding needed)
- Shorter than UUIDs
- PocketBase uses 15-char random IDs (similar approach)

### 5. Admin UI as Embedded Asset

**Decision:** Compile React build into binary, serve from memory.

**Rationale:**
- Zero external files requirement
- Instant deployment
- Version consistency (UI matches backend version)
- PocketBase approach proven at scale

---

## Sources

- [PocketBase GitHub Repository](https://github.com/pocketbase/pocketbase)
- [PocketBase Architecture Discussion](https://github.com/pocketbase/pocketbase/discussions/2448)
- [PocketBase DeepWiki - Core Architecture](https://deepwiki.com/pocketbase/pocketbase)
- [Hono Best Practices](https://hono.dev/docs/guides/best-practices)
- [Bun SQLite Documentation](https://bun.com/docs/runtime/sqlite)
- [FreeCodeCamp - Build Production-Ready Web Apps with Hono](https://www.freecodecamp.org/news/build-production-ready-web-apps-with-hono/)
- [Directus vs Strapi Architecture Comparison](https://punits.dev/blog/directus-vs-strapi/)
- [Supabase vs Strapi Comparison](https://www.leanware.co/insights/supabase-vs-strapi)
