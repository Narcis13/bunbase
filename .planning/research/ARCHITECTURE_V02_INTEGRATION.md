# Architecture Integration: v0.2

**Project:** BunBase v0.2
**Researched:** 2026-01-26
**Focus:** User auth, file uploads, realtime/SSE integration

## Component Overview

### Current Architecture (v0.1)

```
src/
├── api/
│   └── server.ts          # Bun.serve() with route definitions
├── auth/
│   ├── admin.ts           # Admin CRUD (create, verify, update)
│   ├── jwt.ts             # JWT token create/verify (jose library)
│   └── middleware.ts      # requireAdmin() middleware
├── core/
│   ├── database.ts        # SQLite init, _collections, _fields, _admins tables
│   ├── schema.ts          # Collection/field CRUD
│   ├── records.ts         # Record CRUD with hooks
│   ├── hooks.ts           # HookManager middleware pattern
│   ├── validation.ts      # Zod-based field validation
│   ├── query.ts           # Filter/sort/pagination
│   └── expand.ts          # Relation expansion
├── types/
│   ├── collection.ts      # FieldType, Field, Collection types
│   ├── hooks.ts           # Hook context types
│   └── query.ts           # QueryOptions, PaginatedResponse
└── admin/                 # React admin UI
```

### New Components for v0.2

| Component | Location | Purpose |
|-----------|----------|---------|
| `src/auth/users.ts` | NEW | User CRUD, password hashing, email verification |
| `src/auth/user-jwt.ts` | NEW | User token create/verify (separate from admin tokens) |
| `src/auth/user-middleware.ts` | NEW | requireUser() middleware |
| `src/files/storage.ts` | NEW | Local filesystem storage operations |
| `src/files/routes.ts` | NEW | Upload/download route handlers |
| `src/realtime/sse.ts` | NEW | SSE connection management |
| `src/realtime/subscriptions.ts` | NEW | Subscription broker, client tracking |
| `src/realtime/events.ts` | NEW | Event types, record change events |
| `src/types/user.ts` | NEW | User, UserWithHash types |
| `src/types/file.ts` | NEW | File metadata types |
| `src/types/realtime.ts` | NEW | SSE message, subscription types |

### Modified Components

| Component | Changes |
|-----------|---------|
| `src/core/database.ts` | Add `_users`, `_files` tables to init |
| `src/core/schema.ts` | Add `file` field type support |
| `src/types/collection.ts` | Add `file` to FieldType union |
| `src/core/validation.ts` | Add file field validation |
| `src/core/records.ts` | Trigger realtime events in afterCreate/Update/Delete |
| `src/core/hooks.ts` | No changes (reuse existing hook types) |
| `src/api/server.ts` | Add user auth routes, file routes, SSE endpoint |

## User Authentication Integration

### Data Model

**_users table** (parallel to _admins, stored in database.ts INIT_METADATA_SQL):

```sql
CREATE TABLE IF NOT EXISTS _users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  verified INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

**Key differences from _admins:**
- `verified` field for email verification status
- Separate table = separate token namespace (user tokens != admin tokens)
- Users subject to collection API rules; admins bypass all rules

### Token Architecture

Following PocketBase's stateless model:

```typescript
// src/auth/user-jwt.ts
export interface UserTokenPayload extends JWTPayload {
  userId: string;    // Different claim name from adminId
  type: 'user';      // Explicit type to prevent token confusion
}

export async function createUserToken(userId: string): Promise<string> {
  return await new SignJWT({ userId, type: 'user' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(getSecret());
}

export async function verifyUserToken(token: string): Promise<UserTokenPayload | null> {
  // Verify AND check type === 'user'
}
```

**Security consideration:** Same JWT_SECRET is acceptable since payload structure differs (userId vs adminId, type field). Tokens are not interchangeable.

### API Routes

New routes in `src/api/server.ts`:

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/auth/register` | POST | Create new user account |
| `/api/auth/login` | POST | Authenticate, return JWT |
| `/api/auth/refresh` | POST | Verify token, return fresh token |
| `/api/auth/password` | POST | Change password (requires auth) |
| `/api/auth/verify-email` | POST | Complete email verification |
| `/api/auth/request-verification` | POST | Send verification email |

**Note:** No logout endpoint needed (stateless). Client clears local token.

### Middleware Evolution

```typescript
// src/auth/user-middleware.ts

export async function requireUser(req: Request): Promise<User | Response> {
  const token = extractBearerToken(req);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const payload = await verifyUserToken(token);
  if (!payload || payload.type !== 'user') {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = getUserById(payload.userId);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { password_hash: _, ...safeUser } = user;
  return safeUser;
}

// Optional: Combined middleware for routes accepting either
export async function requireAuth(req: Request): Promise<Admin | User | Response> {
  // Try admin first, then user
}
```

### Integration with Hook Context

Extend hook context to include authenticated user:

```typescript
// src/types/hooks.ts (modified)
export interface BaseHookContext {
  collection: string;
  request?: {
    method: string;
    path: string;
    headers: Headers;
  };
  admin?: Admin;    // NEW: Admin if admin-authenticated
  user?: User;      // NEW: User if user-authenticated
}
```

This allows hooks to access the authenticated user for:
- Row-level security checks
- Audit logging
- Ownership assignment (e.g., `ctx.data.owner = ctx.user?.id`)

## File Uploads Integration

### Storage Architecture

**Local filesystem storage** (following PocketBase pattern):

```
pb_data/               # Data directory (configurable)
├── bunbase.db         # SQLite database
└── storage/           # File storage root
    └── {collection}/  # Per-collection directories
        └── {record}/  # Per-record directories
            └── {filename}  # Actual files
```

**Why per-record directories:**
- Avoids filename collisions
- Enables easy cleanup on record delete
- Matches PocketBase's proven pattern

### File Metadata Table

```sql
CREATE TABLE IF NOT EXISTS _files (
  id TEXT PRIMARY KEY,
  collection_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  field_name TEXT NOT NULL,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT,
  size INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_files_record ON _files(collection_name, record_id);
```

**Alternative:** Store file metadata directly in the record's file field as JSON. This is simpler but requires schema changes. Recommend separate table for flexibility.

### File Field Type

Add to `src/types/collection.ts`:

```typescript
export type FieldType =
  | 'text'
  | 'number'
  | 'boolean'
  | 'datetime'
  | 'json'
  | 'relation'
  | 'file';       // NEW

export interface FieldOptions {
  // ... existing options

  // For file fields:
  maxSize?: number;       // Max file size in bytes
  mimeTypes?: string[];   // Allowed MIME types
  maxFiles?: number;      // For multi-file fields (default: 1)
}
```

### Storage Operations

```typescript
// src/files/storage.ts

const STORAGE_ROOT = Bun.env.BUNBASE_STORAGE_PATH || './pb_data/storage';

export async function saveFile(
  collectionName: string,
  recordId: string,
  fieldName: string,
  file: Blob,
  originalName: string
): Promise<FileMetadata> {
  const fileId = generateId();
  const ext = getExtension(originalName);
  const filename = `${fileId}${ext}`;

  const dir = `${STORAGE_ROOT}/${collectionName}/${recordId}`;
  await Bun.write(`${dir}/${filename}`, file);

  // Insert metadata to _files table
  const metadata = insertFileMetadata({...});
  return metadata;
}

export function getFilePath(
  collectionName: string,
  recordId: string,
  filename: string
): string {
  return `${STORAGE_ROOT}/${collectionName}/${recordId}/${filename}`;
}

export async function deleteRecordFiles(
  collectionName: string,
  recordId: string
): Promise<void> {
  const dir = `${STORAGE_ROOT}/${collectionName}/${recordId}`;
  // Delete directory and all contents
}
```

### API Routes for Files

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/files/{collection}/{record}/{filename}` | GET | Download/serve file |
| `/api/collections/{name}/records` | POST | Create with file (multipart) |
| `/api/collections/{name}/records/{id}` | PATCH | Update with file (multipart) |

**Upload handling** (using Bun's native FormData):

```typescript
// In server.ts POST handler
async function handleCreateWithFiles(req: Request, collectionName: string) {
  const contentType = req.headers.get('Content-Type') || '';

  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData();
    const data: Record<string, unknown> = {};
    const files: Map<string, Blob> = new Map();

    for (const [key, value] of formData.entries()) {
      if (value instanceof Blob) {
        files.set(key, value);
      } else {
        data[key] = value;
      }
    }

    // Create record first
    const record = await createRecordWithHooks(collectionName, data, hooks, req);

    // Then save files
    for (const [fieldName, blob] of files) {
      await saveFile(collectionName, record.id, fieldName, blob, blob.name);
    }

    return record;
  }

  // Fall through to JSON handling
  const body = await req.json();
  return createRecordWithHooks(collectionName, body, hooks, req);
}
```

### File Cleanup Hook

Register automatic cleanup on record delete:

```typescript
// In server.ts or hooks setup
hooks.on('afterDelete', async (ctx, next) => {
  await deleteRecordFiles(ctx.collection, ctx.id);
  await next();
});
```

## Realtime/SSE Integration

### Architecture Overview

Following PocketBase's proven SSE pattern:

```
Client                    Server
  |                         |
  |--- GET /api/realtime -->|  Establish SSE connection
  |<-- PB_CONNECT event ----|  Send client ID
  |                         |
  |--- POST /api/realtime ->|  Subscribe to topics
  |<-- 200 OK --------------|
  |                         |
  |       (record created)  |
  |<-- create event --------|  Push to subscribers
  |                         |
```

### SSE Connection Management

```typescript
// src/realtime/sse.ts

interface SSEClient {
  id: string;
  writer: WritableStreamDefaultWriter<Uint8Array>;
  subscriptions: Set<string>;
  user?: User;      // Authenticated user (if any)
  admin?: Admin;    // Authenticated admin (if any)
  createdAt: Date;
  lastActivity: Date;
}

const clients = new Map<string, SSEClient>();

export function createSSEResponse(clientId: string): Response {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  clients.set(clientId, {
    id: clientId,
    writer,
    subscriptions: new Set(),
    createdAt: new Date(),
    lastActivity: new Date(),
  });

  // Send initial connect event
  const connectEvent = `event: PB_CONNECT\ndata: ${JSON.stringify({ clientId })}\n\n`;
  writer.write(encoder.encode(connectEvent));

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
```

### Subscription Broker

```typescript
// src/realtime/subscriptions.ts

export interface SubscriptionMessage {
  action: 'create' | 'update' | 'delete';
  record: Record<string, unknown>;
}

export function subscribe(clientId: string, topics: string[]): void {
  const client = clients.get(clientId);
  if (!client) return;

  // Clear previous subscriptions, set new ones
  client.subscriptions.clear();
  for (const topic of topics) {
    client.subscriptions.add(topic);
  }
}

export function broadcast(
  collection: string,
  recordId: string,
  action: 'create' | 'update' | 'delete',
  record: Record<string, unknown>
): void {
  const encoder = new TextEncoder();
  const message: SubscriptionMessage = { action, record };

  for (const [, client] of clients) {
    // Check if client is subscribed to collection/* or collection/recordId
    if (
      client.subscriptions.has(`${collection}/*`) ||
      client.subscriptions.has(`${collection}/${recordId}`)
    ) {
      const event = `event: ${collection}\ndata: ${JSON.stringify(message)}\n\n`;
      client.writer.write(encoder.encode(event));
      client.lastActivity = new Date();
    }
  }
}
```

### Subscription Patterns

Following PocketBase conventions:

| Pattern | Example | Receives |
|---------|---------|----------|
| `{collection}/*` | `posts/*` | All create/update/delete in collection |
| `{collection}/{id}` | `posts/abc123` | Changes to specific record |

### Hook Integration

Connect to existing lifecycle hooks to trigger realtime events:

```typescript
// In records.ts or server.ts setup

// Register global after hooks for realtime
hooks.on('afterCreate', async (ctx, next) => {
  broadcast(ctx.collection, ctx.record.id as string, 'create', ctx.record);
  await next();
});

hooks.on('afterUpdate', async (ctx, next) => {
  broadcast(ctx.collection, ctx.record.id as string, 'update', ctx.record);
  await next();
});

hooks.on('afterDelete', async (ctx, next) => {
  broadcast(ctx.collection, ctx.id, 'delete', { id: ctx.id });
  await next();
});
```

**Why afterX hooks (not beforeX):**
- Only broadcast after successful operation
- Record has final state (id, timestamps)
- Doesn't block the operation

### SSE Route in Server

```typescript
// In server.ts routes

"/api/realtime": {
  GET: (req) => {
    const clientId = generateId();
    return createSSEResponse(clientId);
  },
  POST: async (req) => {
    const { clientId, subscriptions } = await req.json();

    // Optional: Authenticate and attach user/admin to client
    const token = extractBearerToken(req);
    if (token) {
      const userPayload = await verifyUserToken(token);
      const adminPayload = await verifyAdminToken(token);
      // Attach to client for authorization checks
    }

    subscribe(clientId, subscriptions || []);
    return Response.json({ subscribed: subscriptions });
  },
},
```

### Connection Lifecycle

```typescript
// Heartbeat and cleanup
setInterval(() => {
  const now = Date.now();
  const timeout = 5 * 60 * 1000; // 5 minutes

  for (const [clientId, client] of clients) {
    if (now - client.lastActivity.getTime() > timeout) {
      client.writer.close();
      clients.delete(clientId);
    }
  }
}, 60 * 1000); // Check every minute
```

## Data Flow Changes

### Before v0.2 (Admin-only)

```
Client -> API -> requireAdmin() -> records.ts -> database
                                              -> hooks
```

### After v0.2 (User + Admin + Realtime)

```
Client -> API -> requireAuth() -> records.ts -> database
              |                             |-> hooks -> realtime broadcast
              |                             |-> file storage
              |
              +-> /api/realtime (SSE) -> subscription broker
```

## Suggested Build Order

Based on dependencies between components:

### Phase 1: User Authentication (Foundation)

**Why first:** File uploads and realtime both need user context for authorization.

1. Add `_users` table to database.ts
2. Create `src/auth/users.ts` (parallel to admin.ts)
3. Create `src/auth/user-jwt.ts` (parallel to jwt.ts)
4. Create `src/auth/user-middleware.ts`
5. Add user auth routes to server.ts
6. Extend hook context with user/admin

**Deliverable:** Users can register, login, and access protected endpoints.

### Phase 2: File Uploads (Standalone)

**Why second:** Simpler than realtime, provides visible value.

1. Add `file` field type to collection.ts
2. Create `_files` table in database.ts
3. Create `src/files/storage.ts`
4. Add file validation to validation.ts
5. Modify record create/update to handle multipart
6. Add file download route
7. Add afterDelete hook for cleanup

**Deliverable:** Records can have file fields, files are stored locally.

### Phase 3: Realtime/SSE (Complex)

**Why third:** Most complex, builds on hooks infrastructure.

1. Create `src/realtime/sse.ts` (connection management)
2. Create `src/realtime/subscriptions.ts` (broker)
3. Add SSE endpoint to server.ts
4. Register afterCreate/Update/Delete hooks for broadcast
5. Add heartbeat and connection cleanup
6. Add authorization checks for subscriptions

**Deliverable:** Clients can subscribe to record changes via SSE.

### Phase 4: Integration Testing

1. Test user auth + file uploads together
2. Test user auth + realtime together
3. Test file changes triggering realtime events
4. Load testing SSE connections

## Key Architecture Decisions

### 1. Separate User and Admin Auth

**Decision:** Keep `_users` and `_admins` as separate tables with separate token types.

**Rationale:**
- Clear security boundary (admins bypass all rules)
- Prevents accidental admin privilege escalation
- Follows PocketBase's proven pattern
- Tokens not interchangeable due to different payload structure

### 2. Local File Storage Only (v0.2)

**Decision:** Store files on local filesystem, not S3/cloud storage.

**Rationale:**
- Simpler implementation
- No external dependencies
- Sufficient for single-server deployments
- Can add S3 adapter in v0.3 if needed

### 3. SSE over WebSocket

**Decision:** Use SSE for realtime, not WebSocket.

**Rationale:**
- One-way communication sufficient for record change notifications
- Simpler server implementation
- Automatic reconnection built into SSE spec
- Works through proxies without special configuration
- PocketBase uses SSE successfully

### 4. Hook-Based Realtime Integration

**Decision:** Trigger realtime broadcasts from afterCreate/Update/Delete hooks.

**Rationale:**
- Reuses existing hook infrastructure
- Consistent with BunBase's middleware pattern
- Easy to add authorization filtering later
- Broadcasts only after successful operations

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| User Auth | HIGH | Follows existing admin auth pattern, proven PocketBase model |
| File Storage | MEDIUM | Bun's FormData has some known issues at high concurrency |
| SSE | HIGH | TransformStream approach well-documented for Bun |
| Hook Integration | HIGH | Existing infrastructure, minimal changes needed |

## Sources

- [Bun File Upload Documentation](https://bun.com/docs/guides/http/file-uploads)
- [PocketBase Realtime API](https://pocketbase.io/docs/api-realtime/)
- [PocketBase Authentication](https://pocketbase.io/docs/authentication/)
- [Bun SSE Implementation (GitHub Gist)](https://gist.github.com/gtrabanco/7908bff2516a67e708509d5b224d822b)
- [PocketBase Auth Discussion](https://github.com/pocketbase/pocketbase/discussions/169)
