# Architecture Research: BunBase v0.3 Custom API Endpoints

**Project:** BunBase
**Research Dimension:** Architecture
**Researched:** 2026-01-30
**Confidence:** HIGH

## Executive Summary

Custom API endpoints integrate cleanly with BunBase's existing architecture by leveraging Bun's native routing capabilities and the established context patterns. The current `server.ts` already demonstrates method-specific handlers (`GET`, `POST`, `PATCH`, `DELETE`) in the routes object, which is the exact pattern custom routes will follow. Route discovery at build time using glob scanning enables embedding handler code into the compiled binary. Context injection follows the existing `HookManager`/`RealtimeManager` pattern of passing initialized instances to route handlers.

## Integration Points

### 1. Route Registration in server.ts

**Current State:** Routes are statically defined in a `routes: { }` object passed to `Bun.serve()` (lines 183-1193 of server.ts).

**Integration:** Custom routes merge into this routes object at server creation time.

```typescript
// Current pattern in createServer()
return Bun.serve({
  port,
  routes: {
    "/api/collections/:name/records": { GET: ..., POST: ... },
    // ... existing routes
    // NEW: Custom routes injected here
    ...customRoutes,
  },
  fetch(req) { ... }
});
```

### 2. Auth Context Building

**Current State:** `buildAuthContext(req)` (lines 122-137) extracts admin/user from Bearer token.

**Integration:** Custom route handlers receive this same auth context. The pattern is already established:
- `extractBearerToken()` gets token from Authorization header
- `verifyAdminToken()` / `optionalUser()` resolve identity
- Result is `{ isAdmin: boolean; user: AuthenticatedUser | null }`

### 3. Hook System

**Current State:** `HookManager` instance passed to `createServer()`, used for lifecycle hooks in record operations.

**Integration:** Custom routes receive the same `HookManager` instance through context, enabling:
- Registration of custom hooks
- Triggering of existing hooks
- Integration with realtime broadcasting

### 4. Realtime Manager

**Current State:** `RealtimeManager` passed to `createServer()`, manages SSE connections.

**Integration:** Custom routes can broadcast to subscribers:
```typescript
export const POST = async (req, ctx) => {
  // ... create data
  await ctx.realtime.sendEvent(clientId, "custom_event", data);
};
```

### 5. Database Access

**Current State:** `getDatabase()` returns the SQLite instance. Schema operations via `getCollection()`, `getFields()`, etc.

**Integration:** Custom routes use the same module imports:
```typescript
import { getDatabase } from "../core/database";
import { getRecord, createRecordWithHooks } from "../core/records";
```

### 6. Error Handling

**Current State:** `errorResponse(message, status)` and `mapErrorToStatus(error)` functions provide consistent error formatting (lines 81-101).

**Integration:** Custom routes use the same error utilities, or a new `ApiError` class that integrates with them.

## New Components

### 1. Route Loader (`src/api/custom-routes.ts`)

**Purpose:** Discover and load custom route handlers from the `routes/` directory.

**Responsibilities:**
- Scan `routes/` directory for `.ts` files
- Import route modules
- Extract method handlers (`GET`, `POST`, etc.)
- Convert file paths to URL paths (`routes/stats.ts` -> `/api/stats`)
- Build the routes object for `Bun.serve()`

**Implementation Pattern:**
```typescript
interface RouteModule {
  GET?: RouteHandler;
  POST?: RouteHandler;
  PATCH?: RouteHandler;
  DELETE?: RouteHandler;
}

interface RouteHandler {
  (req: BunRequest, ctx: BunBaseContext): Response | Promise<Response>;
}

export async function loadCustomRoutes(
  routesDir: string,
  context: BunBaseContext
): Promise<Record<string, RouteHandler | Record<string, RouteHandler>>> {
  // Implementation
}
```

### 2. BunBase Context (`src/api/context.ts`)

**Purpose:** Type-safe context object passed to all custom route handlers.

**Contents:**
```typescript
export interface BunBaseContext {
  // Database access
  db: Database;

  // Record operations (with hooks)
  records: {
    get: (collection: string, id: string) => Record<string, unknown> | null;
    list: (collection: string, options?: QueryOptions) => PaginatedResponse;
    create: (collection: string, data: Record<string, unknown>) => Promise<Record<string, unknown>>;
    update: (collection: string, id: string, data: Record<string, unknown>) => Promise<Record<string, unknown>>;
    delete: (collection: string, id: string) => Promise<void>;
  };

  // Schema operations
  schema: {
    getCollection: (name: string) => Collection | null;
    getFields: (name: string) => Field[];
  };

  // Auth helpers
  auth: {
    buildContext: (req: Request) => Promise<RecordAuthContext>;
    requireAdmin: (req: Request) => Promise<Admin | Response>;
    optionalUser: (req: Request) => Promise<AuthenticatedUser | null>;
  };

  // Realtime broadcasting
  realtime: RealtimeManager;

  // Hook system
  hooks: HookManager;

  // File storage
  files: {
    save: (collection: string, recordId: string, file: File) => Promise<string>;
    delete: (collection: string, recordId: string, filename: string) => Promise<void>;
    getPath: (collection: string, recordId: string, filename: string) => string;
  };

  // Error helpers
  error: (message: string, status?: number) => Response;
  json: (data: unknown, status?: number) => Response;
}
```

### 3. Route Generator (`scripts/generate-routes.ts`)

**Purpose:** Build-time script that generates a routes manifest for binary embedding.

**Why Needed:** At compile time (`bun build --compile`), dynamic `import()` and filesystem scanning don't work. The generator:
1. Scans `routes/` directory
2. Generates TypeScript with static imports
3. Exports a routes object for the server

**Output Example (`src/api/generated-routes.ts`):**
```typescript
// AUTO-GENERATED - DO NOT EDIT
import * as stats from "../../routes/stats";
import * as usersId from "../../routes/users/[id]";

export const customRoutes = {
  "/api/stats": stats,
  "/api/users/:id": usersId,
};
```

### 4. Unified Error Handler (`src/api/errors.ts`)

**Purpose:** Consistent error handling across all endpoints.

```typescript
export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number = 400, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }

  toResponse(): Response {
    return Response.json(
      { error: this.message, code: this.code },
      { status: this.status }
    );
  }
}

// Middleware for try/catch wrapping
export function withErrorHandling(handler: RouteHandler): RouteHandler {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (error) {
      if (error instanceof ApiError) {
        return error.toResponse();
      }
      console.error("Unhandled error:", error);
      return Response.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}
```

## Modified Components

### 1. `src/api/server.ts`

**Changes:**
- Import generated routes: `import { customRoutes } from "./generated-routes";`
- Merge custom routes into routes object
- Pass context to custom route handlers
- Update `createServer()` signature to accept routes directory

**Diff Summary:**
```typescript
// Before
export function createServer(
  port: number = 8090,
  hooks?: HookManager,
  realtime?: RealtimeManager
) {

// After
export function createServer(
  port: number = 8090,
  hooks?: HookManager,
  realtime?: RealtimeManager,
  customRoutes?: Record<string, RouteHandler | MethodHandlers>
) {
```

### 2. `src/cli.ts`

**Changes:**
- Import route generator/loader
- Load custom routes during startup
- Pass to `startServer()`

### 3. `scripts/build-admin.ts` (rename to `scripts/build.ts`)

**Changes:**
- Add route generation step before compilation
- Generate `src/api/generated-routes.ts`
- Update build script to run route generation

### 4. `package.json`

**Changes:**
```json
{
  "scripts": {
    "build:routes": "bun scripts/generate-routes.ts",
    "build": "bun run build:routes && bun run build:admin && bun build --compile --minify src/cli.ts --outfile bunbase"
  }
}
```

## Route Discovery Pattern

### At Development Time (Hot Reload)

Use glob scanning for dynamic discovery:

```typescript
import { Glob } from "bun";

const glob = new Glob("**/*.ts");
const routes: Record<string, RouteModule> = {};

for await (const file of glob.scan("./routes")) {
  const urlPath = filePathToUrlPath(file);
  const module = await import(`./routes/${file}`);
  routes[urlPath] = module;
}
```

### At Build Time (Binary Embedding)

Generate static imports via script:

```typescript
// scripts/generate-routes.ts
import { Glob } from "bun";

const glob = new Glob("**/*.ts");
const imports: string[] = [];
const routeEntries: string[] = [];

for await (const file of glob.scan("./routes")) {
  const urlPath = filePathToUrlPath(file);
  const importName = filePathToImportName(file);
  const importPath = `../../routes/${file.replace(".ts", "")}`;

  imports.push(`import * as ${importName} from "${importPath}";`);
  routeEntries.push(`  "${urlPath}": ${importName},`);
}

const output = `// AUTO-GENERATED - DO NOT EDIT
${imports.join("\n")}

export const customRoutes = {
${routeEntries.join("\n")}
};`;

await Bun.write("./src/api/generated-routes.ts", output);
```

### Path Conversion Rules

| File Path | URL Path |
|-----------|----------|
| `routes/stats.ts` | `/api/stats` |
| `routes/users/index.ts` | `/api/users` |
| `routes/users/[id].ts` | `/api/users/:id` |
| `routes/admin/reports.ts` | `/api/admin/reports` |
| `routes/[collection]/backup.ts` | `/api/:collection/backup` |

## Context Injection Pattern

### Option A: Factory Function (Recommended)

Create context once at server startup, inject via closure:

```typescript
// In server.ts
const context = createBunBaseContext(hookManager, realtimeManager);

// Wrap each custom route handler
const wrappedRoutes = wrapRoutesWithContext(customRoutes, context);

Bun.serve({
  routes: {
    ...builtInRoutes,
    ...wrappedRoutes,
  }
});
```

### Option B: Request Extension

Attach context to request object:

```typescript
// Less type-safe, but simpler
const contextMiddleware = (handler) => (req) => {
  req.bunbase = context;
  return handler(req);
};
```

**Recommendation:** Option A (factory function) because:
1. Type-safe context access
2. Matches existing HookManager/RealtimeManager pattern
3. No prototype pollution concerns

## Binary Embedding Strategy

### Current Admin UI Pattern

The existing admin UI embedding works via text imports:

```typescript
// server.ts lines 64-66
import adminHtml from "../../dist/admin/index.html" with { type: "text" };
import adminJs from "../../dist/admin/main.js" with { type: "text" };
import adminCss from "../../dist/admin/globals.css" with { type: "text" };
```

### Custom Routes Strategy

For custom routes, we use **static imports** (not text imports) because routes are TypeScript code, not assets:

1. **Build-time generation:** Script scans `routes/` and generates `generated-routes.ts`
2. **Static imports:** Generated file uses standard TypeScript imports
3. **Bundler includes code:** `bun build --compile` bundles all imported modules
4. **No runtime filesystem access:** All route code is in the binary

**Why This Works:**
- Bun's compiler follows import graph
- Static imports are resolved at build time
- Compiled binary contains all route handler code
- No need for `type: "file"` or `type: "text"` imports

## Error Handling Architecture

### Current Pattern Analysis

```typescript
// server.ts pattern
try {
  // operation
} catch (error) {
  const err = error as Error;
  if (err.message === 'Access denied') {
    return errorResponse(err.message, 403);
  }
  return errorResponse(err.message, mapErrorToStatus(err));
}
```

### Unified Error Architecture

```
                    +-----------------+
                    |   ApiError      |
                    |  (typed error)  |
                    +--------+--------+
                             |
           +-----------------+------------------+
           |                 |                  |
    +------v------+  +-------v------+  +--------v-----+
    | NotFound    |  | Validation   |  | Unauthorized |
    | (404)       |  | Error (400)  |  | (401/403)    |
    +-------------+  +--------------+  +--------------+

          |                 |                 |
          +-----------------+-----------------+
                            |
                    +-------v--------+
                    |withErrorHandler|
                    |  (middleware)  |
                    +-------+--------+
                            |
                    +-------v--------+
                    | JSON Response  |
                    | { error: ... } |
                    +----------------+
```

**Error Classes:**
```typescript
class NotFoundError extends ApiError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, "NOT_FOUND");
  }
}

class ValidationError extends ApiError {
  constructor(message: string, details?: Record<string, string>) {
    super(message, 400, "VALIDATION_ERROR");
    this.details = details;
  }
}

class UnauthorizedError extends ApiError {
  constructor(message = "Unauthorized") {
    super(message, 401, "UNAUTHORIZED");
  }
}

class ForbiddenError extends ApiError {
  constructor(message = "Access denied") {
    super(message, 403, "FORBIDDEN");
  }
}
```

## Suggested Build Order

### Phase 1: Foundation (Start Here)

1. **Create context type definitions** (`src/api/context.ts`)
   - Define `BunBaseContext` interface
   - Define `RouteHandler` type
   - No dependencies on new code

2. **Create error handling utilities** (`src/api/errors.ts`)
   - `ApiError` class hierarchy
   - `withErrorHandling` middleware
   - Update existing `errorResponse` to use it

**Rationale:** These are independent modules with no circular dependencies. They establish the patterns all other code will use.

### Phase 2: Route Loading

3. **Create route generator script** (`scripts/generate-routes.ts`)
   - Scan routes directory
   - Generate `src/api/generated-routes.ts`
   - Test with empty routes directory

4. **Create route loader for development** (`src/api/custom-routes.ts`)
   - `loadCustomRoutes()` function
   - Development mode: dynamic imports
   - Production mode: use generated routes

**Rationale:** Route loading needs to work before routes can be integrated into the server.

### Phase 3: Server Integration

5. **Modify server.ts**
   - Create `buildBunBaseContext()` function
   - Accept custom routes parameter
   - Merge routes into routes object
   - Wrap handlers with context and error handling

6. **Modify cli.ts**
   - Load custom routes at startup
   - Pass to `startServer()`

**Rationale:** Server changes depend on context types and route loader being ready.

### Phase 4: Build Pipeline

7. **Update build scripts**
   - Add `build:routes` script
   - Update `build` script sequence
   - Test full build pipeline

8. **Add example custom route**
   - `routes/health.ts` - simple health check
   - `routes/stats.ts` - uses database context
   - Verify binary embedding works

**Rationale:** Build pipeline should be last to ensure all components work in development first.

## Data Flow Diagram

```
                            +---------------------------------------------+
                            |              Bun.serve()                    |
                            |                                             |
  Incoming Request -------->  routes: {                                   |
                            |    "/api/collections/:name": builtIn,       |
                            |    "/api/stats": customHandler,  <----------+-- Generated
                            |    "/api/users/:id": customHandler,         |   at build time
                            |  }                                          |
                            +----------------------+-----------------------+
                                                   |
                                                   v
                            +---------------------------------------------+
                            |          Route Handler                      |
                            |                                             |
                            |  async (req: BunRequest, ctx) => {          |
                            |    const auth = await ctx.auth              |
                            |      .buildContext(req);                    |
                            |                                             |
                            |    const data = ctx.records                 |
                            |      .list("posts", { ... });               |
                            |                                             |
                            |    return ctx.json(data);                   |
                            |  }                                          |
                            +----------------------+-----------------------+
                                                   |
                       +---------------------------+---------------------------+
                       |                           |                           |
               +-------v-------+           +-------v-------+           +-------v-------+
               |   Database    |           |  HookManager  |           |   Realtime    |
               |   (SQLite)    |           |               |           |   Manager     |
               +---------------+           +---------------+           +---------------+
```

## File Structure After Implementation

```
bunbase/
├── src/
│   ├── api/
│   │   ├── server.ts          # Modified: accept custom routes
│   │   ├── context.ts         # NEW: BunBaseContext definition
│   │   ├── errors.ts          # NEW: ApiError classes
│   │   ├── custom-routes.ts   # NEW: Route loader
│   │   └── generated-routes.ts # GENERATED: Static imports
│   └── cli.ts                 # Modified: load custom routes
├── routes/                    # NEW: User's custom routes
│   ├── health.ts              # Example: GET /api/health
│   ├── stats.ts               # Example: GET /api/stats
│   └── users/
│       └── [id].ts            # Example: GET/PATCH /api/users/:id
├── scripts/
│   ├── build-admin.ts         # Existing
│   └── generate-routes.ts     # NEW: Route code generator
└── package.json               # Modified: build scripts
```

## Sources

- [Bun HTTP Server Documentation](https://bun.sh/docs/api/http) - Method-specific route handlers
- [Bun Routing Documentation](https://bun.com/docs/runtime/http/routing) - Dynamic routes, parameters
- [Bun FileSystemRouter API](https://bun.com/docs/api/file-system-router) - File-based route discovery
- BunBase source code analysis:
  - `src/api/server.ts` - Current routing patterns
  - `src/core/hooks.ts` - Context injection pattern
  - `scripts/build-admin.ts` - Asset embedding pattern
