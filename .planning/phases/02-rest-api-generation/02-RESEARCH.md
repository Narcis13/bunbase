# Phase 2: REST API Generation - Research

**Researched:** 2025-01-25
**Domain:** HTTP Server, REST API, Bun.serve routing
**Confidence:** HIGH

## Summary

Phase 2 wraps the existing Phase 1 record operations (`createRecord`, `getRecord`, `listRecords`, `updateRecord`, `deleteRecord`) in HTTP endpoints following the PocketBase API convention: `GET/POST/PATCH/DELETE /api/collections/:name/records[/:id]`.

The research confirms that **Bun.serve() with its native routes feature** (available since Bun v1.2.3) is the correct approach for this project. The CLAUDE.md project instructions explicitly state "Don't use express" and recommend Bun.serve() for HTTP routing. While Hono is excellent for more complex scenarios, Bun's native routing is simpler, faster, and aligns with the project's philosophy of minimal dependencies.

**Primary recommendation:** Use `Bun.serve()` with the `routes` object for HTTP routing. Define per-method handlers for each CRUD endpoint. Wrap existing Phase 1 functions in HTTP handlers that parse requests and return JSON responses.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Bun.serve() | Bun 1.2.3+ | HTTP server and routing | Native to Bun, fastest option, no external deps |
| Response.json() | Web API | JSON responses | Standard Web API, built into Bun |
| req.json() | Web API | Parse request body | Standard Web API, built into Bun |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Zod | 3.24.0 | Request validation | Already installed, use for body validation |
| HTTPException pattern | N/A | Error handling | Throw custom errors with status codes |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Bun.serve() routes | Hono.js | Hono adds middleware ecosystem but introduces dependency; Bun.serve() is simpler and per CLAUDE.md is preferred |
| Response.json() | c.json() (Hono) | Hono's helpers are convenient but require the framework |

**Installation:**
```bash
# No new dependencies needed - Bun.serve() is built-in
# Phase 1 dependencies (zod, nanoid) already installed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── api/
│   └── server.ts        # Bun.serve() setup with routes
├── core/
│   ├── database.ts      # (existing) Database initialization
│   ├── schema.ts        # (existing) Collection CRUD
│   ├── records.ts       # (existing) Record CRUD
│   ├── validation.ts    # (existing) Zod validation
│   └── migrations.ts    # (existing) Schema migrations
├── types/
│   ├── collection.ts    # (existing) Collection/Field types
│   └── record.ts        # (existing) SystemFields type
└── utils/
    └── id.ts            # (existing) nanoid ID generation
```

### Pattern 1: Dynamic Route Handlers
**What:** Use Bun.serve() routes with path parameters to handle dynamic collection names
**When to use:** All CRUD endpoints that operate on any collection
**Example:**
```typescript
// Source: Context7 Bun documentation
Bun.serve({
  routes: {
    "/api/collections/:name/records": {
      GET: async (req) => {
        const { name } = req.params;
        const records = listRecords(name);
        return Response.json({ items: records, totalItems: records.length });
      },
      POST: async (req) => {
        const { name } = req.params;
        const body = await req.json();
        const record = createRecord(name, body);
        return Response.json(record, { status: 201 });
      }
    },
    "/api/collections/:name/records/:id": {
      GET: async (req) => {
        const { name, id } = req.params;
        const record = getRecord(name, id);
        if (!record) {
          return Response.json({ error: "Record not found" }, { status: 404 });
        }
        return Response.json(record);
      },
      PATCH: async (req) => {
        const { name, id } = req.params;
        const body = await req.json();
        const record = updateRecord(name, id, body);
        return Response.json(record);
      },
      DELETE: async (req) => {
        const { name, id } = req.params;
        deleteRecord(name, id);
        return new Response(null, { status: 204 });
      }
    }
  }
});
```

### Pattern 2: Error Handling Wrapper
**What:** Wrap route handlers in try/catch to convert exceptions to HTTP responses
**When to use:** All route handlers to ensure consistent error responses
**Example:**
```typescript
// Wrapper function for consistent error handling
function apiHandler<T>(
  handler: (req: Request) => Promise<T> | T
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    try {
      const result = await handler(req);
      if (result instanceof Response) return result;
      return Response.json(result);
    } catch (error) {
      if (error instanceof Error) {
        // Map known errors to status codes
        if (error.message.includes("not found")) {
          return Response.json({ error: error.message }, { status: 404 });
        }
        if (error.message.includes("Validation failed")) {
          return Response.json({ error: error.message }, { status: 400 });
        }
        if (error.message.includes("already exists")) {
          return Response.json({ error: error.message }, { status: 409 });
        }
      }
      console.error("Unhandled error:", error);
      return Response.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}
```

### Pattern 3: PocketBase-Compatible Response Format
**What:** Match PocketBase API response format for list endpoints
**When to use:** List endpoint responses
**Example:**
```typescript
// PocketBase list response format
interface ListResponse<T> {
  page: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
  items: T[];
}

// For Phase 2 (no pagination yet), simplified:
interface SimpleListResponse<T> {
  items: T[];
  totalItems: number;
}
```

### Anti-Patterns to Avoid
- **Using Express or external routers:** CLAUDE.md explicitly states "Don't use express." Use Bun.serve() routes.
- **Returning raw errors:** Always wrap errors in proper HTTP responses with status codes.
- **Ignoring Content-Type:** Always return `application/json` for API responses.
- **Hardcoding collection names in routes:** Use dynamic `:name` parameter for all collection endpoints.
- **Blocking on sync operations:** While bun:sqlite is synchronous, avoid heavy computation in handlers.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON parsing | Manual JSON.parse with error handling | `req.json()` | Built-in, handles malformed JSON gracefully |
| JSON responses | Manual Response with headers | `Response.json()` | Sets Content-Type automatically |
| Path parameters | Manual URL parsing | `req.params` in Bun.serve routes | Built-in extraction, handles encoding |
| HTTP status codes | Magic numbers | Named constants or direct numbers with comments | 201 Created, 204 No Content, 400 Bad Request, 404 Not Found |
| Request validation | Manual field checking | Zod schemas (already in project) | Type-safe, good error messages |

**Key insight:** Bun's Web Standard APIs (Request, Response) handle most common HTTP operations. Don't add middleware layers or helper libraries unless genuinely needed.

## Common Pitfalls

### Pitfall 1: Forgetting async/await for request body parsing
**What goes wrong:** `req.json()` returns a Promise, forgetting await causes runtime errors
**Why it happens:** Muscle memory from synchronous SQLite operations in Phase 1
**How to avoid:** Always `await req.json()` before using the body
**Warning signs:** "Cannot read property 'x' of undefined" or "[object Promise]" in logs

### Pitfall 2: Not handling JSON parse errors
**What goes wrong:** Malformed JSON in request body throws uncaught exception
**Why it happens:** `req.json()` throws on invalid JSON
**How to avoid:** Wrap in try/catch or use error handling wrapper
**Warning signs:** 500 errors on POST/PATCH requests

### Pitfall 3: Returning wrong status codes
**What goes wrong:** Returning 200 for creation (should be 201), or 200 for delete (should be 204)
**Why it happens:** Defaulting to 200 for all success cases
**How to avoid:** Use explicit status codes: 201 Created, 204 No Content
**Warning signs:** API consumers confused about operation results

### Pitfall 4: Collection name SQL injection
**What goes wrong:** User provides malicious collection name like `users; DROP TABLE users;`
**Why it happens:** Dynamic table names in SQL
**How to avoid:** Phase 1's `getCollection()` already validates collection exists, which prevents this. Also validate name format (alphanumeric only).
**Warning signs:** None if using Phase 1 functions correctly - they validate first

### Pitfall 5: Missing error mapping
**What goes wrong:** All errors return 500 instead of appropriate status codes
**Why it happens:** Not mapping Phase 1 error messages to HTTP status codes
**How to avoid:** Parse error messages and map to: 404 (not found), 400 (validation failed), 409 (already exists)
**Warning signs:** Clients can't distinguish between different error types

## Code Examples

Verified patterns from official sources:

### Complete CRUD Endpoint Setup
```typescript
// Source: Bun documentation + Context7
import { initializeDatabase } from "./core/database";
import { getCollection } from "./core/schema";
import {
  createRecord,
  getRecord,
  listRecords,
  updateRecord,
  deleteRecord
} from "./core/records";

// Initialize database
initializeDatabase();

// Error response helper
function errorResponse(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

// Success response with custom status
function jsonResponse<T>(data: T, status = 200): Response {
  return Response.json(data, { status });
}

const server = Bun.serve({
  port: 8090,
  routes: {
    // List all records in a collection
    "/api/collections/:name/records": {
      GET: async (req) => {
        try {
          const { name } = req.params;
          const records = listRecords(name);
          return jsonResponse({
            items: records,
            totalItems: records.length
          });
        } catch (error) {
          if (error instanceof Error && error.message.includes("not found")) {
            return errorResponse(error.message, 404);
          }
          throw error;
        }
      },

      // Create a new record
      POST: async (req) => {
        try {
          const { name } = req.params;
          const body = await req.json();
          const record = createRecord(name, body);
          return jsonResponse(record, 201);
        } catch (error) {
          if (error instanceof Error) {
            if (error.message.includes("not found")) {
              return errorResponse(error.message, 404);
            }
            if (error.message.includes("Validation failed")) {
              return errorResponse(error.message, 400);
            }
          }
          throw error;
        }
      }
    },

    // Single record operations
    "/api/collections/:name/records/:id": {
      // Get single record
      GET: async (req) => {
        try {
          const { name, id } = req.params;
          const record = getRecord(name, id);
          if (!record) {
            return errorResponse(`Record "${id}" not found in collection "${name}"`, 404);
          }
          return jsonResponse(record);
        } catch (error) {
          if (error instanceof Error && error.message.includes("not found")) {
            return errorResponse(error.message, 404);
          }
          throw error;
        }
      },

      // Update record
      PATCH: async (req) => {
        try {
          const { name, id } = req.params;
          const body = await req.json();
          const record = updateRecord(name, id, body);
          return jsonResponse(record);
        } catch (error) {
          if (error instanceof Error) {
            if (error.message.includes("not found")) {
              return errorResponse(error.message, 404);
            }
            if (error.message.includes("Validation failed")) {
              return errorResponse(error.message, 400);
            }
          }
          throw error;
        }
      },

      // Delete record
      DELETE: async (req) => {
        try {
          const { name, id } = req.params;
          deleteRecord(name, id);
          return new Response(null, { status: 204 });
        } catch (error) {
          if (error instanceof Error && error.message.includes("not found")) {
            return errorResponse(error.message, 404);
          }
          throw error;
        }
      }
    }
  },

  // Fallback handler for unmatched routes
  fetch(req) {
    return errorResponse("Not found", 404);
  }
});

console.log(`BunBase server running at ${server.url}`);
```

### Testing Endpoints with Bun
```typescript
// Source: Bun testing documentation
import { test, expect, describe, beforeAll, afterAll } from "bun:test";

describe("REST API", () => {
  let server: ReturnType<typeof Bun.serve>;
  const baseUrl = "http://localhost:8091";

  beforeAll(() => {
    // Start server on test port
    server = Bun.serve({
      port: 8091,
      routes: { /* ... */ }
    });
  });

  afterAll(() => {
    server.stop();
  });

  test("GET /api/collections/:name/records returns list", async () => {
    const res = await fetch(`${baseUrl}/api/collections/posts/records`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("items");
    expect(data).toHaveProperty("totalItems");
  });

  test("POST creates record and returns 201", async () => {
    const res = await fetch(`${baseUrl}/api/collections/posts/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test Post", content: "Hello" })
    });
    expect(res.status).toBe(201);
    const record = await res.json();
    expect(record).toHaveProperty("id");
    expect(record.title).toBe("Test Post");
  });

  test("GET non-existent record returns 404", async () => {
    const res = await fetch(`${baseUrl}/api/collections/posts/records/nonexistent`);
    expect(res.status).toBe(404);
  });

  test("DELETE returns 204 No Content", async () => {
    // First create a record
    const createRes = await fetch(`${baseUrl}/api/collections/posts/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "To Delete" })
    });
    const { id } = await createRes.json();

    // Then delete it
    const deleteRes = await fetch(`${baseUrl}/api/collections/posts/records/${id}`, {
      method: "DELETE"
    });
    expect(deleteRes.status).toBe(204);
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Express.js router | Bun.serve() routes | Bun 1.2.3 (Jan 2025) | No external HTTP framework needed |
| Manual JSON response | Response.json() | Web Standard | Cleaner code, automatic Content-Type |
| External body-parser | req.json() | Built into Fetch API | No middleware needed |
| Multiple middleware layers | Direct route handlers | Bun routes pattern | Simpler architecture |

**Deprecated/outdated:**
- **Express.js on Bun:** While it works, Bun.serve() is faster and simpler. CLAUDE.md explicitly says not to use Express.
- **body-parser middleware:** Not needed, `req.json()` is built-in.
- **cors middleware:** Can be handled with Response headers directly.

## Open Questions

Things that couldn't be fully resolved:

1. **CORS Configuration**
   - What we know: Cross-origin requests may need CORS headers
   - What's unclear: Whether Phase 2 needs CORS (admin UI in Phase 6 might)
   - Recommendation: Don't add CORS yet. Add in Phase 6 when admin UI is implemented.

2. **Request Size Limits**
   - What we know: Large JSON bodies could be problematic
   - What's unclear: Bun.serve() default limits, if any
   - Recommendation: Monitor during testing. Add explicit limits if issues arise.

3. **Concurrent Request Handling**
   - What we know: SQLite has write locking
   - What's unclear: How Bun handles concurrent requests to sync SQLite
   - Recommendation: Phase 1 uses transactions appropriately. Monitor for issues under load.

## Sources

### Primary (HIGH confidence)
- Context7 `/oven-sh/bun` - Bun.serve() routes documentation, HTTP method handlers, path parameters
- Context7 `/honojs/website` - Error handling patterns (HTTPException), request/response handling
- CLAUDE.md project instructions - Explicit guidance to use Bun.serve() not Express

### Secondary (MEDIUM confidence)
- WebSearch "Bun.serve routes vs Hono REST API 2025" - Performance comparison confirming Bun's native routing is performant
- Bun official GitHub documentation via Context7 - Route patterns, dynamic parameters

### Tertiary (LOW confidence)
- None - all findings verified with primary sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Bun.serve() routes are documented, working, and recommended in CLAUDE.md
- Architecture: HIGH - Pattern directly maps Phase 1 functions to HTTP endpoints
- Pitfalls: HIGH - Based on Bun documentation and common HTTP API patterns

**Research date:** 2025-01-25
**Valid until:** 60 days (stable API surface in Bun)
