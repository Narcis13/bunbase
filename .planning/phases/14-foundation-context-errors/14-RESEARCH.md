# Phase 14: Foundation (Context & Errors) - Research

**Researched:** 2026-01-30
**Domain:** Error handling patterns + Context injection for TypeScript BaaS
**Confidence:** HIGH

## Summary

Phase 14 establishes the foundational error system and RouteContext interface that all custom routes in BunBase v0.3 will use. Research confirms that no new dependencies are needed - TypeScript class hierarchies and Bun.serve's native `error` handler provide everything required for a robust error system.

The error system follows PocketBase's API error format (`{ code, message, data }`) for compatibility and familiarity. The RouteContext interface exposes existing BunBase managers (database, records, auth, realtime, files, hooks) through a unified interface injected into custom route handlers.

Key architectural decisions: (1) Use TypeScript Error subclasses with static factory methods for ergonomic error throwing, (2) Implement a global error handler wrapper for all custom routes that catches thrown errors and converts them to consistent JSON responses, (3) Design RouteContext as an interface exposing existing managers rather than wrapping them in new APIs.

**Primary recommendation:** Create `src/api/errors.ts` with ApiError class hierarchy and `src/api/context.ts` with RouteContext interface and factory function. Existing BunBase managers remain unchanged - context factory simply composes references to them.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 5.x | Type-safe error classes and context interface | Already in BunBase, provides compile-time safety |
| Bun.serve | 1.2+ | Native `error` handler for global error catching | Built-in, no external dependency needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| bun:sqlite | native | Database access via `ctx.db` | Already used in BunBase core |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom Error classes | http-errors npm package | Custom classes are simpler, type-safe, and zero-dependency |
| Manual error catching | Hono/Express middleware | Overkill - Bun.serve error handler is sufficient |
| Wrapper APIs for context | Direct manager access | Wrappers add complexity without value; direct access is clearer |

**Installation:**
```bash
# No new packages needed - all functionality from existing BunBase
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── api/
│   ├── errors.ts        # ApiError class hierarchy + factory helpers
│   ├── context.ts       # RouteContext interface + createContext factory
│   └── server.ts        # Existing server (modified to use error handler)
├── core/
│   ├── database.ts      # Existing - exposed via ctx.db
│   ├── records.ts       # Existing - exposed via ctx.records
│   └── hooks.ts         # Existing - exposed via ctx.hooks
├── auth/
│   └── middleware.ts    # Existing - exposed via ctx.auth
├── realtime/
│   └── manager.ts       # Existing - exposed via ctx.realtime
└── storage/
    └── files.ts         # Existing - exposed via ctx.files
```

### Pattern 1: Error Class Hierarchy
**What:** Base `ApiError` class extending Error with subclasses for common HTTP errors
**When to use:** All error cases in custom route handlers
**Example:**
```typescript
// Source: PocketBase error conventions + TypeScript patterns
export class ApiError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly data: Record<string, ValidationError> = {}
  ) {
    super(message);
    this.name = 'ApiError';
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      data: this.data,
    };
  }
}

export class BadRequestError extends ApiError {
  constructor(message = 'Bad request', data?: Record<string, ValidationError>) {
    super(400, message, data);
    this.name = 'BadRequestError';
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized') {
    super(401, message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'Forbidden') {
    super(403, message);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends ApiError {
  constructor(message = 'Not found') {
    super(404, message);
    this.name = 'NotFoundError';
  }
}

export class ValidationError {
  constructor(
    public readonly code: string,
    public readonly message: string
  ) {}
}
```

### Pattern 2: Route Handler Error Wrapper
**What:** Higher-order function that wraps route handlers with try/catch
**When to use:** All custom route handlers are wrapped automatically
**Example:**
```typescript
// Source: BunBase existing error patterns + Bun.serve conventions
type RouteHandler = (req: Request, ctx: RouteContext) => Response | Promise<Response>;

export function withErrorHandling(handler: RouteHandler): RouteHandler {
  return async (req: Request, ctx: RouteContext) => {
    try {
      return await handler(req, ctx);
    } catch (error) {
      return handleApiError(error);
    }
  };
}

export function handleApiError(error: unknown): Response {
  // Handle known ApiError instances
  if (error instanceof ApiError) {
    return Response.json(error.toJSON(), { status: error.code });
  }

  // Log unexpected errors
  console.error('Unhandled error:', error);

  // Return generic 500 for unexpected errors (hide details in production)
  const isDev = Bun.env.NODE_ENV === 'development' || Bun.env.BUNBASE_DEV === 'true';
  return Response.json({
    code: 500,
    message: isDev && error instanceof Error ? error.message : 'Internal server error',
    data: {},
  }, { status: 500 });
}
```

### Pattern 3: RouteContext Interface
**What:** TypeScript interface defining all context available to custom routes
**When to use:** Type-safe access to BunBase features in route handlers
**Example:**
```typescript
// Source: BunBase existing managers + custom routes requirements
import type { Database } from 'bun:sqlite';
import type { HookManager } from '../core/hooks';
import type { RealtimeManager } from '../realtime/manager';
import type { AuthenticatedUser } from '../auth/middleware';

export interface RouteContext {
  // Request info
  request: Request;
  params: Record<string, string>;

  // Database access
  db: Database;

  // Records API (hook-aware operations)
  records: RecordsAPI;

  // Auth helpers
  auth: AuthAPI;

  // Realtime manager
  realtime: RealtimeManager;

  // File storage
  files: FilesAPI;

  // Hook system
  hooks: HookManager;
}

export interface RecordsAPI {
  get(collection: string, id: string): Record<string, unknown> | null;
  list(collection: string, options?: QueryOptions): PaginatedResponse;
  create(collection: string, data: Record<string, unknown>): Promise<Record<string, unknown>>;
  update(collection: string, id: string, data: Record<string, unknown>): Promise<Record<string, unknown>>;
  delete(collection: string, id: string): Promise<void>;
}

export interface AuthAPI {
  /** Build auth context from request (returns {isAdmin, user}) */
  buildContext(req: Request): Promise<{ isAdmin: boolean; user: AuthenticatedUser | null }>;
  /** Get current user from request (null if not authenticated) */
  optionalUser(req: Request): Promise<AuthenticatedUser | null>;
  /** Require admin authentication (throws UnauthorizedError if not admin) */
  requireAdmin(req: Request): Promise<void>;
}

export interface FilesAPI {
  save(collection: string, recordId: string, file: File): Promise<string>;
  getPath(collection: string, recordId: string, filename: string): string;
  exists(collection: string, recordId: string, filename: string): Promise<boolean>;
  delete(collection: string, recordId: string, filename: string): Promise<void>;
}
```

### Pattern 4: Context Factory
**What:** Function that creates RouteContext from initialized managers
**When to use:** Called by server integration layer when handling custom routes
**Example:**
```typescript
// Source: BunBase architecture patterns
export interface ContextDependencies {
  db: Database;
  hooks: HookManager;
  realtime: RealtimeManager;
}

export function createRouteContext(
  req: Request,
  params: Record<string, string>,
  deps: ContextDependencies
): RouteContext {
  return {
    request: req,
    params,
    db: deps.db,
    records: createRecordsAPI(deps.hooks),
    auth: createAuthAPI(),
    realtime: deps.realtime,
    files: createFilesAPI(),
    hooks: deps.hooks,
  };
}
```

### Anti-Patterns to Avoid
- **Catching errors too early:** Don't catch errors in individual handlers and return custom JSON - let the wrapper handle it for consistency
- **Modifying shared state:** RouteContext provides read-only access to managers; mutations should go through APIs
- **Exposing raw error details:** Never send stack traces, SQL queries, or file paths in production error responses
- **Creating new manager instances:** Context factory receives existing manager instances, doesn't create new ones

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Error JSON serialization | Custom JSON formatting | Error class toJSON() method | Consistent format, single source of truth |
| Auth context extraction | Parsing tokens manually | Existing buildAuthContext() | Already handles admin vs user tokens, edge cases |
| Records with hooks | Direct SQL operations | createRecordWithHooks() etc. | Ensures hooks fire, realtime events broadcast |
| File path resolution | Manual path.join() | Existing getFilePath() | Handles storage dir config, sanitization |

**Key insight:** BunBase v0.2 already has all the managers needed. Phase 14 is about exposing them through a unified interface, not reimplementing them.

## Common Pitfalls

### Pitfall 1: Inconsistent Error Format
**What goes wrong:** Custom routes return `{ error: "message" }` while system uses `{ code, message, data }`
**Why it happens:** Developers copy existing BunBase errorResponse() pattern which uses old format
**How to avoid:** Provide new error helpers that enforce PocketBase format; deprecate old errorResponse()
**Warning signs:** Frontend code has special cases for different error shapes

### Pitfall 2: Error Details Leaking in Production
**What goes wrong:** Stack traces, SQL queries, or internal paths visible in error responses
**Why it happens:** Development error messages used in production without sanitization
**How to avoid:** Check NODE_ENV/BUNBASE_DEV flag; use generic messages for non-ApiError exceptions
**Warning signs:** Security scans flag information disclosure; users report seeing technical details

### Pitfall 3: Unhandled Promise Rejections
**What goes wrong:** Async handler throws but error isn't caught, causing 500 or hung request
**Why it happens:** Route handler wrapper not awaiting async functions
**How to avoid:** Ensure withErrorHandling() wrapper uses async/await and catches all thrown errors
**Warning signs:** "Unhandled rejection" in logs; requests timing out instead of returning error

### Pitfall 4: Context Scope Leakage
**What goes wrong:** State from one request appears in another; race conditions in high traffic
**Why it happens:** Context object modified by handler and shared between requests
**How to avoid:** Create fresh context object per request; don't store request-specific state on managers
**Warning signs:** Intermittent auth issues; "Database locked" errors under load

### Pitfall 5: Hooks Bypassed
**What goes wrong:** Records created via ctx.db don't trigger beforeCreate/afterCreate hooks
**Why it happens:** Developer uses raw SQL instead of ctx.records.create()
**How to avoid:** Document that ctx.db is for raw queries only; ctx.records for CRUD with hooks
**Warning signs:** Realtime events not firing; validation hooks not running

## Code Examples

Verified patterns from official sources and existing BunBase code:

### Complete Error Module
```typescript
// src/api/errors.ts
// Source: PocketBase API conventions + existing BunBase patterns

/**
 * Field-level validation error matching PocketBase format.
 */
export interface ValidationError {
  code: string;
  message: string;
}

/**
 * Base API error class producing PocketBase-compatible JSON responses.
 * All API errors thrown from route handlers should extend this class.
 */
export class ApiError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly data: Record<string, ValidationError> = {}
  ) {
    super(message);
    this.name = 'ApiError';
    // Ensure prototype chain is correct
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Convert to JSON response format.
   */
  toJSON(): { code: number; message: string; data: Record<string, ValidationError> } {
    return {
      code: this.code,
      message: this.message,
      data: this.data,
    };
  }

  /**
   * Convert to Response object.
   */
  toResponse(): Response {
    return Response.json(this.toJSON(), { status: this.code });
  }
}

/**
 * 400 Bad Request - invalid input, malformed JSON, missing required fields
 */
export class BadRequestError extends ApiError {
  constructor(message = 'Bad request', data?: Record<string, ValidationError>) {
    super(400, message, data);
    this.name = 'BadRequestError';
  }
}

/**
 * 401 Unauthorized - missing or invalid authentication
 */
export class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized') {
    super(401, message);
    this.name = 'UnauthorizedError';
  }
}

/**
 * 403 Forbidden - authenticated but insufficient permissions
 */
export class ForbiddenError extends ApiError {
  constructor(message = 'Forbidden') {
    super(403, message);
    this.name = 'ForbiddenError';
  }
}

/**
 * 404 Not Found - resource doesn't exist
 */
export class NotFoundError extends ApiError {
  constructor(message = 'Not found') {
    super(404, message);
    this.name = 'NotFoundError';
  }
}

/**
 * 409 Conflict - resource already exists (duplicate)
 */
export class ConflictError extends ApiError {
  constructor(message = 'Conflict') {
    super(409, message);
    this.name = 'ConflictError';
  }
}

/**
 * 422 Validation Error - request understood but validation failed
 */
export class ValidationFailedError extends ApiError {
  constructor(message = 'Validation failed', data: Record<string, ValidationError> = {}) {
    super(422, message, data);
    this.name = 'ValidationFailedError';
  }
}

/**
 * Check if running in development mode.
 */
function isDevelopment(): boolean {
  return Bun.env.NODE_ENV === 'development' || Bun.env.BUNBASE_DEV === 'true';
}

/**
 * Convert any error to an API response.
 * ApiError instances are converted directly; other errors become 500s.
 */
export function handleApiError(error: unknown): Response {
  // Known ApiError - return as-is
  if (error instanceof ApiError) {
    return error.toResponse();
  }

  // Log unexpected errors
  console.error('Unhandled error:', error);

  // Return generic 500 (hide details in production)
  const message = isDevelopment() && error instanceof Error
    ? error.message
    : 'Internal server error';

  return Response.json({
    code: 500,
    message,
    data: {},
  }, { status: 500 });
}
```

### Error Handler Wrapper
```typescript
// src/api/handler.ts
// Source: Middleware pattern from existing BunBase hooks

import { handleApiError } from './errors';
import type { RouteContext } from './context';

/**
 * Route handler function signature for custom routes.
 */
export type RouteHandler = (
  req: Request,
  ctx: RouteContext
) => Response | Promise<Response>;

/**
 * Wrap a route handler with error handling.
 * Catches any thrown error and converts to consistent JSON response.
 */
export function withErrorHandling(handler: RouteHandler): RouteHandler {
  return async (req: Request, ctx: RouteContext): Promise<Response> => {
    try {
      const result = handler(req, ctx);
      // Handle both sync and async handlers
      return result instanceof Promise ? await result : result;
    } catch (error) {
      return handleApiError(error);
    }
  };
}
```

### RouteContext Factory
```typescript
// src/api/context.ts
// Source: BunBase manager patterns

import type { Database } from 'bun:sqlite';
import { getDatabase } from '../core/database';
import {
  getRecord,
  listRecordsWithQuery,
  createRecordWithHooks,
  updateRecordWithHooks,
  deleteRecordWithHooks
} from '../core/records';
import { HookManager } from '../core/hooks';
import { RealtimeManager } from '../realtime/manager';
import {
  saveFile,
  getFilePath,
  fileExists,
  deleteFile
} from '../storage/files';
import {
  optionalUser,
  requireAdmin as authRequireAdmin,
  type AuthenticatedUser
} from '../auth/middleware';
import { verifyAdminToken } from '../auth/jwt';
import { extractBearerToken } from '../auth/middleware';
import type { QueryOptions, PaginatedResponse } from '../types/query';
import { UnauthorizedError } from './errors';

/**
 * Dependencies needed to create RouteContext.
 */
export interface ContextDependencies {
  hooks: HookManager;
  realtime: RealtimeManager;
}

/**
 * Records API interface for CRUD operations with hooks.
 */
export interface RecordsAPI {
  get(collection: string, id: string): Record<string, unknown> | null;
  list(collection: string, options?: QueryOptions): PaginatedResponse<Record<string, unknown>>;
  create(collection: string, data: Record<string, unknown>): Promise<Record<string, unknown>>;
  update(collection: string, id: string, data: Record<string, unknown>): Promise<Record<string, unknown>>;
  delete(collection: string, id: string): Promise<void>;
}

/**
 * Auth API interface for authentication helpers.
 */
export interface AuthAPI {
  buildContext(req: Request): Promise<{ isAdmin: boolean; user: AuthenticatedUser | null }>;
  optionalUser(req: Request): Promise<AuthenticatedUser | null>;
  requireAdmin(req: Request): Promise<void>;
}

/**
 * Files API interface for file storage operations.
 */
export interface FilesAPI {
  save(collection: string, recordId: string, file: File): Promise<string>;
  getPath(collection: string, recordId: string, filename: string): string;
  exists(collection: string, recordId: string, filename: string): Promise<boolean>;
  delete(collection: string, recordId: string, filename: string): Promise<void>;
}

/**
 * Full context available to custom route handlers.
 */
export interface RouteContext {
  request: Request;
  params: Record<string, string>;
  db: Database;
  records: RecordsAPI;
  auth: AuthAPI;
  realtime: RealtimeManager;
  files: FilesAPI;
  hooks: HookManager;
}

/**
 * Create Records API that uses hooks for all operations.
 */
function createRecordsAPI(hooks: HookManager): RecordsAPI {
  return {
    get: (collection, id) => getRecord(collection, id),
    list: (collection, options = {}) => listRecordsWithQuery(collection, options),
    create: (collection, data) => createRecordWithHooks(collection, data, hooks),
    update: (collection, id, data) => updateRecordWithHooks(collection, id, data, hooks),
    delete: (collection, id) => deleteRecordWithHooks(collection, id, hooks),
  };
}

/**
 * Create Auth API wrapping existing middleware.
 */
function createAuthAPI(): AuthAPI {
  return {
    buildContext: async (req) => {
      const token = extractBearerToken(req);
      if (!token) {
        return { isAdmin: false, user: null };
      }

      // Check for admin token first
      const adminPayload = await verifyAdminToken(token);
      if (adminPayload) {
        return { isAdmin: true, user: null };
      }

      // Fall back to user token
      const user = await optionalUser(req);
      return { isAdmin: false, user };
    },
    optionalUser: (req) => optionalUser(req),
    requireAdmin: async (req) => {
      const result = await authRequireAdmin(req);
      if (result instanceof Response) {
        throw new UnauthorizedError('Admin authentication required');
      }
    },
  };
}

/**
 * Create Files API wrapping existing storage functions.
 */
function createFilesAPI(): FilesAPI {
  return {
    save: saveFile,
    getPath: getFilePath,
    exists: fileExists,
    delete: deleteFile,
  };
}

/**
 * Create RouteContext for a request.
 * Called once per request by the server integration layer.
 */
export function createRouteContext(
  req: Request,
  params: Record<string, string>,
  deps: ContextDependencies
): RouteContext {
  return {
    request: req,
    params,
    db: getDatabase(),
    records: createRecordsAPI(deps.hooks),
    auth: createAuthAPI(),
    realtime: deps.realtime,
    files: createFilesAPI(),
    hooks: deps.hooks,
  };
}
```

### Usage Example in Custom Route
```typescript
// routes/stats.ts
// Source: How custom routes will use the context

import type { RouteContext } from 'bunbase';
import { NotFoundError, BadRequestError } from 'bunbase/errors';

export const GET = async (req: Request, ctx: RouteContext) => {
  // Use records API (fires hooks, respects rules)
  const result = ctx.records.list('posts', { perPage: 100 });

  // Direct database access for custom queries
  const stats = ctx.db.query(`
    SELECT collection, COUNT(*) as count
    FROM _collections
    GROUP BY collection
  `).all();

  return Response.json({
    totalPosts: result.totalItems,
    collections: stats,
  });
};

export const POST = async (req: Request, ctx: RouteContext) => {
  // Require admin authentication
  await ctx.auth.requireAdmin(req);

  const body = await req.json();
  if (!body.collection) {
    throw new BadRequestError('Collection name required', {
      collection: { code: 'required', message: 'Collection is required' }
    });
  }

  // Create record with hooks
  const record = await ctx.records.create(body.collection, body.data);

  // Broadcast realtime event
  ctx.realtime.sendEvent('admin', 'record_created', { record });

  return Response.json(record, { status: 201 });
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Express middleware chains | Bun.serve routes + error handler | Bun 1.2+ (2025) | Simpler, faster, native |
| http-errors package | Custom Error subclasses | Always valid | Zero dependencies, type-safe |
| Wrapper APIs for everything | Direct manager access + thin wrappers | BunBase v0.2 | Cleaner, easier to maintain |
| `{ error: string }` format | `{ code, message, data }` format | PocketBase standard | Client compatibility |

**Deprecated/outdated:**
- Express-style `next()` middleware: Bun.serve handles this differently with routes + error handler
- Using `http-errors` package: Custom classes are simpler for this use case

## Open Questions

Things that couldn't be fully resolved:

1. **Migration of existing endpoints to new error format**
   - What we know: New custom routes should use PocketBase format exclusively
   - What's unclear: Should existing system routes be migrated in Phase 14 or later?
   - Recommendation: Keep existing routes unchanged; migrate gradually in future. Phase 14 only establishes the pattern.

2. **Error logging strategy**
   - What we know: Unexpected errors should be logged server-side
   - What's unclear: Should we integrate with existing logging or console.error is sufficient?
   - Recommendation: Use console.error for now; logging can be enhanced later without API changes

## Sources

### Primary (HIGH confidence)
- [PocketBase Go Routing](https://pocketbase.io/docs/go-routing/) - ApiError structure, error codes, global handler pattern
- [PocketBase Error Discussion](https://github.com/pocketbase/pocketbase/discussions/196) - Error format conventions
- [Bun HTTP Server](https://bun.sh/docs/api/http) - Routes configuration, error handler, server lifecycle
- BunBase `src/api/server.ts` - Existing error handling patterns, buildAuthContext()
- BunBase `src/core/records.ts` - Hook-aware record operations
- BunBase `src/core/hooks.ts` - HookManager interface

### Secondary (MEDIUM confidence)
- [Bun Middleware Feature Request](https://github.com/oven-sh/bun/issues/17608) - Current state of middleware support
- BunBase `.planning/research/v0.3-FEATURES.md` - RouteContext interface design
- BunBase `.planning/research/v0.3-PITFALLS.md` - Error handling pitfalls

### Tertiary (LOW confidence)
- None - all findings verified with official sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new dependencies, uses existing Bun/TypeScript patterns
- Architecture: HIGH - Extends existing BunBase patterns cleanly
- Pitfalls: HIGH - 5 pitfalls identified with clear mitigations from v0.3 research

**Research date:** 2026-01-30
**Valid until:** 90 days (stable patterns, no fast-moving dependencies)
