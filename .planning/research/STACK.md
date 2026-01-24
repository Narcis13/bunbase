# Stack Research: BunBase

> Research Date: January 2025
> Purpose: Define the optimal stack for building a PocketBase alternative as a single-binary backend-in-a-box

## Executive Summary

BunBase will leverage Bun 1.3.x as an all-in-one runtime with native SQLite, Hono for HTTP routing, and embedded React admin UI compiled into a single executable. The stack prioritizes zero external dependencies at runtime while maintaining excellent developer experience.

---

## Recommended Stack

### Runtime: Bun 1.3.6+

**Version:** `1.3.6` (latest stable as of January 2025)

**Why Bun:**
- **Single binary compilation**: `bun build --compile` creates standalone executables with embedded runtime (~90MB base)
- **Native SQLite**: `bun:sqlite` is 3-6x faster than better-sqlite3, built directly into the runtime
- **Native password hashing**: `Bun.password` supports argon2id and bcrypt without external deps
- **TypeScript-first**: No transpilation step needed, runs .ts files directly
- **All-in-one**: Runtime + bundler + test runner + package manager eliminates toolchain complexity

**Key Bun 1.3 Features Used:**
- Full-stack executable compilation (v1.2.17+)
- `with { type: "file" }` import attribute for embedding assets
- `$bunfs/` virtual filesystem for embedded files
- Unified SQL API improvements
- 10-30% memory reduction vs previous versions

**Installation:**
```bash
curl -fsSL https://bun.sh/install | bash
```

---

### HTTP Framework: Hono 4.11.x

**Version:** `4.11.4` (latest as of January 2025)

**Why Hono:**
- **Ultrafast**: Benchmarks show Hono as the fastest router for Bun
- **Tiny footprint**: `hono/tiny` preset is under 12kB with zero dependencies
- **Web Standards**: Built on fetch API, works identically across all JS runtimes
- **First-class Bun support**: Official adapter with optimized performance
- **Batteries included**: Built-in JWT middleware, validation, CORS, etc.

**Alternatives Considered:**
| Framework | Why Not |
|-----------|---------|
| Elysia | More opinionated, heavier runtime overhead, less mature ecosystem |
| Express | Not designed for Bun, requires adapter, slower |
| Fastify | Node.js-centric, plugin system adds complexity |

**Key Hono Features Used:**
- `hono/jwt` - JWT authentication middleware
- `hono/cors` - CORS handling
- `hono/logger` - Request logging
- `hono/etag` - Response caching
- `hono/compress` - Gzip compression

**Installation:**
```bash
bun add hono@^4.11.4
```

---

### Database: bun:sqlite (Native)

**Pattern:** Direct bun:sqlite with Drizzle ORM for type-safety

**Why bun:sqlite:**
- **Zero dependencies**: Built into Bun runtime
- **Fastest available**: 3-6x faster than better-sqlite3, 8-9x faster than Deno sqlite
- **Synchronous API**: Matches SQLite's synchronous nature, simpler code
- **Full SQLite feature set**: FTS5, JSON, window functions, etc.

**Why Drizzle ORM (0.45.1):**
- **Type-safe**: Full TypeScript inference from schema to queries
- **Lightweight**: ~7.4kb minified+gzipped, zero dependencies
- **SQL-first**: Generates readable SQL, no magic
- **Native bun:sqlite support**: First-class integration

**Database Configuration:**
```typescript
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";

const sqlite = new Database("bunbase.db", { strict: true });
sqlite.run("PRAGMA journal_mode = WAL");      // Better concurrency
sqlite.run("PRAGMA synchronous = NORMAL");    // Balanced durability/speed
sqlite.run("PRAGMA foreign_keys = ON");       // Enforce FK constraints
sqlite.run("PRAGMA cache_size = -64000");     // 64MB cache

export const db = drizzle(sqlite);
```

**Migrations:**
```bash
bun add drizzle-orm@^0.45.1
bun add -D drizzle-kit@^0.30.0
```

---

### Admin UI: React + Vite (Embedded)

**Approach:** Pre-build React app, embed via Virtual File System (VFS)

**Why This Approach:**
- **Single binary**: VFS bundles all assets into the executable
- **No runtime filesystem**: Admin UI served from memory
- **Standard React tooling**: Familiar DX for contributors

**Stack:**
- **React 19.x**: Latest stable with improved performance
- **Vite 6.x**: Fast builds, excellent HMR for development
- **TanStack Router**: Type-safe routing without React Router bloat
- **TanStack Query**: Server state management for API calls
- **Tailwind CSS 4.x**: Utility-first styling, tree-shakes unused styles

**Embedding Strategy:**

1. **Development**: Vite dev server with proxy to Bun backend
2. **Production Build**:
   ```bash
   # Build React app
   cd admin && bun run build

   # Generate VFS from dist
   bunx make-vfs --dir ./admin/dist --content-format string --outfile ./src/admin-vfs.ts
   ```

3. **Serve from VFS:**
   ```typescript
   import { adminFiles } from "./admin-vfs";

   app.get("/admin/*", (c) => {
     const path = c.req.path.replace("/admin", "") || "/index.html";
     const file = adminFiles[path];
     if (!file) return c.notFound();
     return c.body(file, { headers: { "Content-Type": getMimeType(path) } });
   });
   ```

**Dependencies:**
```bash
# Admin UI
bun add react@^19.0.0 react-dom@^19.0.0
bun add @tanstack/react-router@^1.95.0 @tanstack/react-query@^5.64.0
bun add -D vite@^6.0.0 @vitejs/plugin-react@^4.3.0 tailwindcss@^4.0.0

# VFS generation
bun add -D make-vfs@^1.0.0
```

---

### Authentication

**JWT Handling:** Hono built-in + jose for advanced cases

**Why:**
- `hono/jwt` covers 90% of use cases with zero config
- `jose` (JOSE/JWT library) for JWK, JWE, or complex token scenarios
- No external auth service dependency

**Password Hashing:** Bun.password (Native)

**Configuration:**
```typescript
// Hash with argon2id (OWASP recommended)
const hash = await Bun.password.hash(password, {
  algorithm: "argon2id",
  memoryCost: 19456,  // 19 MiB (OWASP minimum)
  timeCost: 2,        // iterations
});

// Verify (auto-detects algorithm from hash)
const valid = await Bun.password.verify(password, hash);
```

**Why argon2id over bcrypt:**
- Winner of Password Hashing Competition (2015)
- Resistant to GPU/ASIC attacks
- Memory-hard (configurable)
- OWASP 2025 recommendation

**JWT Middleware:**
```typescript
import { jwt } from "hono/jwt";

app.use("/api/*", jwt({ secret: process.env.JWT_SECRET! }));
```

---

### ID Generation: nanoid

**Version:** `5.0.9`

**Why nanoid over UUID:**
- **Shorter**: 21 chars vs 36 chars (40% smaller)
- **URL-safe**: No encoding needed
- **Same collision probability**: 126 random bits vs UUID's 122
- **Smaller index sizes**: 15-25% faster database queries

**Usage:**
```typescript
import { nanoid } from "nanoid";

const id = nanoid(); // "V1StGXR8_Z5jdHi6B-myT"
```

---

### Validation: Zod + @hono/zod-validator

**Versions:**
- `zod@^3.24.0`
- `@hono/zod-validator@^0.7.6`

**Why Zod:**
- TypeScript-first with excellent inference
- Standard Schema compliant (industry standard)
- Works seamlessly with Hono middleware

**Usage:**
```typescript
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

app.post("/users", zValidator("json", createUserSchema), async (c) => {
  const { email, password } = c.req.valid("json");
  // Type-safe: email is string, password is string
});
```

---

### Development

**TypeScript Configuration:**
```json
{
  "compilerOptions": {
    "lib": ["ESNext"],
    "target": "ESNext",
    "module": "Preserve",
    "moduleDetection": "force",
    "jsx": "react-jsx",
    "allowJs": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "types": ["bun-types"]
  }
}
```

**Testing:** `bun test` (Native)

**Why:**
- Built into Bun, zero setup
- Jest-compatible API
- 10-30x faster than Jest
- Automatic GitHub Actions integration

**Test Structure:**
```typescript
import { describe, test, expect, beforeAll, afterAll } from "bun:test";

describe("users API", () => {
  test("creates user", async () => {
    const res = await app.request("/api/users", {
      method: "POST",
      body: JSON.stringify({ email: "test@example.com", password: "password123" }),
    });
    expect(res.status).toBe(201);
  });
});
```

**Development Server:**
```bash
# Hot reload (soft reload, preserves state)
bun --hot src/index.ts

# Watch mode (full restart on change)
bun --watch src/index.ts
```

---

### Build & Compile

**Single Binary Build:**
```bash
# Development build
bun build --compile --minify --sourcemap ./src/index.ts --outfile bunbase

# Cross-compile for Linux
bun build --compile --minify --target=bun-linux-x64 ./src/index.ts --outfile bunbase-linux

# Cross-compile for macOS ARM
bun build --compile --minify --target=bun-darwin-arm64 ./src/index.ts --outfile bunbase-macos
```

**Build Script (package.json):**
```json
{
  "scripts": {
    "dev": "bun --hot src/index.ts",
    "build:admin": "cd admin && bun run build",
    "build:vfs": "bunx make-vfs --dir ./admin/dist --content-format string --outfile ./src/admin-vfs.ts",
    "build": "bun run build:admin && bun run build:vfs && bun build --compile --minify ./src/index.ts --outfile dist/bunbase",
    "test": "bun test",
    "test:watch": "bun test --watch"
  }
}
```

---

## Key Decisions

| Choice | Rationale | Confidence |
|--------|-----------|------------|
| **Bun 1.3.x** | Only runtime with native SQLite + single-binary compile + password hashing | **High** |
| **Hono** | Fastest framework for Bun, tiny footprint, built-in middleware | **High** |
| **bun:sqlite** | Native, fastest, zero deps, matches SQLite's sync nature | **High** |
| **Drizzle ORM** | Type-safe, lightweight, SQL-first, native bun:sqlite support | **High** |
| **make-vfs for Admin UI** | Proven pattern for embedding directories in Bun executables | **Medium** |
| **React + Vite** | Industry standard, excellent DX, large ecosystem | **High** |
| **argon2id** | OWASP 2025 recommended, built into Bun.password | **High** |
| **nanoid** | Shorter than UUID, URL-safe, same collision resistance | **High** |
| **Zod** | TypeScript-first, Standard Schema, Hono integration | **High** |

---

## What NOT to Use

| Avoid | Reason |
|-------|--------|
| **Prisma** | Heavy, requires binary download, doesn't support bun:sqlite natively |
| **TypeORM** | Complex, performance issues, not optimized for Bun |
| **Express** | Node.js-centric, requires adapters, slower than native alternatives |
| **bcrypt npm package** | Native module compilation issues; use `Bun.password` instead |
| **jsonwebtoken** | Older, use `hono/jwt` or `jose` for modern JWT handling |
| **UUID** | Longer, not URL-safe; use nanoid for most cases |
| **better-sqlite3** | Requires native compilation; bun:sqlite is faster and built-in |
| **webpack** | Complex config, slower than Vite for frontend |
| **Jest** | External dependency; `bun test` is faster and built-in |
| **node:crypto for passwords** | Use `Bun.password` which handles worker threads automatically |
| **External auth services** | Adds runtime dependency; build auth into the binary |
| **MongoDB/PostgreSQL** | Requires external process; SQLite is embedded |

---

## Version Matrix

| Package | Version | Purpose |
|---------|---------|---------|
| bun | ^1.3.6 | Runtime |
| hono | ^4.11.4 | HTTP framework |
| drizzle-orm | ^0.45.1 | ORM |
| drizzle-kit | ^0.30.0 | Migrations CLI |
| zod | ^3.24.0 | Validation |
| @hono/zod-validator | ^0.7.6 | Hono + Zod integration |
| nanoid | ^5.0.9 | ID generation |
| jose | ^5.9.0 | Advanced JWT (optional) |
| react | ^19.0.0 | Admin UI |
| react-dom | ^19.0.0 | Admin UI |
| @tanstack/react-router | ^1.95.0 | Admin routing |
| @tanstack/react-query | ^5.64.0 | Admin data fetching |
| vite | ^6.0.0 | Admin build tool |
| @vitejs/plugin-react | ^4.3.0 | Vite React plugin |
| tailwindcss | ^4.0.0 | Admin styling |
| make-vfs | ^1.0.0 | Asset embedding |
| bun-types | latest | TypeScript types |

---

## Architecture Overview

```
bunbase (single binary)
├── Bun Runtime (~90MB embedded)
├── HTTP Layer (Hono)
│   ├── /api/* - REST API routes
│   ├── /admin/* - Admin UI (served from VFS)
│   └── /auth/* - Authentication endpoints
├── Database (bun:sqlite)
│   ├── WAL mode for concurrency
│   ├── Drizzle ORM for type-safety
│   └── Auto-migrations on startup
├── Admin UI (embedded)
│   ├── React 19 + Vite build
│   ├── TanStack Router/Query
│   └── Tailwind CSS
└── Auth (built-in)
    ├── Bun.password (argon2id)
    └── hono/jwt
```

---

## Sources

- [Bun Official Documentation](https://bun.com/docs)
- [Bun 1.3 Release Blog](https://bun.com/blog/bun-v1.3)
- [Bun Single-file Executable Docs](https://bun.com/docs/bundler/executables)
- [Bun SQLite Documentation](https://bun.com/docs/runtime/sqlite)
- [Bun Password Hashing](https://bun.com/docs/guides/util/hash-a-password)
- [Hono Official Documentation](https://hono.dev)
- [Hono JWT Middleware](https://hono.dev/docs/middleware/builtin/jwt)
- [Hono GitHub Releases](https://github.com/honojs/hono/releases)
- [Drizzle ORM Bun SQLite](https://orm.drizzle.team/docs/connect-bun-sqlite)
- [Drizzle ORM npm](https://www.npmjs.com/package/drizzle-orm)
- [@hono/zod-validator npm](https://www.npmjs.com/package/@hono/zod-validator)
- [make-vfs GitHub](https://github.com/seveibar/make-vfs)
- [nanoid GitHub](https://github.com/ai/nanoid)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [PocketBase Official](https://pocketbase.io/)
- [Bun Embed Directory Discussion](https://github.com/oven-sh/bun/issues/5445)
- [VFS Embedding Pattern](https://dev.to/calumk/using-bun-compilebuild-to-embed-an-express-vite-vue-application-1e41)
