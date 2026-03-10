# BunBase Operations Skill

Use this skill when an AI agent needs to interact with a BunBase backend instance via its REST API, CLI, or by extending it with custom routes. This skill provides complete operational knowledge for creating collections, managing records, handling authentication, uploading files, subscribing to realtime events, and administering the system.

---

## Quick Reference: Authentication

Every API call requires one of these auth methods. Choose based on context:

| Method | Header | Access Level | When to Use |
|---|---|---|---|
| API Key | `X-API-Key: bb_<key>` | Admin (bypasses all rules) | Agent automation, programmatic access |
| Admin JWT | `Authorization: Bearer <admin-jwt>` | Admin (bypasses all rules) | After admin login, 24h expiry |
| User JWT | `Authorization: Bearer <user-access-token>` | Subject to collection rules | User-scoped operations, 15min expiry |

**Priority**: API Key > Admin JWT > User JWT (checked in this order).

### Get an Admin JWT

```bash
curl -X POST http://HOST:PORT/_/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@bunbase.local","password":"<password>"}'
```
Response: `{"token":"<jwt>","admin":{"id":"...","email":"..."}}`

### Create an API Key (recommended for agents)

```bash
bunbase apikeys create --name "my-agent"
```
Returns `{"id":"...","name":"...","key":"bb_...","key_prefix":"...","created_at":"..."}`. Store the `key` value - it is only shown once.

---

## Collections Management

### Collection Types

- `base` - Standard data collection
- `auth` - User authentication collection (auto-adds `email`, `password_hash`, `verified` columns)

### Field Types

| Type | Input | Storage | Options |
|---|---|---|---|
| `text` | string | TEXT | `maxLength` |
| `number` | number | REAL | `min`, `max` |
| `boolean` | true/false | INTEGER (0/1) | - |
| `datetime` | ISO 8601 string | TEXT | - |
| `json` | any JSON value | TEXT (stringified) | - |
| `relation` | record ID string | TEXT | `collection` (required), `target` (alias) |
| `file` | File (multipart) | TEXT (filename/JSON array) | `maxFiles` (default 1), `maxSize` (default 10MB), `allowedTypes` |

### Create Collection via API

```bash
curl -X POST http://HOST:PORT/_/api/collections \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "tasks",
    "type": "base",
    "fields": [
      {"name": "title", "type": "text", "required": true},
      {"name": "status", "type": "text", "required": false},
      {"name": "priority", "type": "number", "required": false, "options": {"min": 1, "max": 5}},
      {"name": "metadata", "type": "json", "required": false},
      {"name": "assignee", "type": "relation", "required": false, "options": {"collection": "users"}},
      {"name": "attachment", "type": "file", "required": false, "options": {"maxFiles": 3, "maxSize": 5242880, "allowedTypes": ["image/*", "application/pdf"]}}
    ],
    "rules": {
      "listRule": "",
      "viewRule": "",
      "createRule": "@request.auth.id != \"\"",
      "updateRule": null,
      "deleteRule": null
    }
  }'
```

### Create Auth Collection

```bash
curl -X POST http://HOST:PORT/_/api/collections \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "users",
    "type": "auth",
    "fields": [
      {"name": "display_name", "type": "text", "required": false},
      {"name": "avatar", "type": "file", "required": false, "options": {"maxFiles": 1}}
    ]
  }'
```

Do NOT include `email`, `password_hash`, or `verified` in fields - they are auto-created for auth collections.

### Create Collection via CLI

```bash
echo '{"name":"tasks","type":"base","fields":[{"name":"title","type":"text","required":true}]}' | bunbase collections create --stdin
```

### List Collections

```bash
# API
curl http://HOST:PORT/_/api/collections -H "Authorization: Bearer <token>"

# CLI
bunbase collections list
bunbase collections list --format table
```

### Delete Collection

```bash
# API
curl -X DELETE http://HOST:PORT/_/api/collections/tasks -H "Authorization: Bearer <token>"

# CLI
bunbase collections delete tasks --confirm
```

### Manage Fields

```bash
# List fields
curl http://HOST:PORT/_/api/collections/tasks/fields -H "Authorization: Bearer <token>"

# Add field
curl -X POST http://HOST:PORT/_/api/collections/tasks/fields \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"due_date","type":"datetime","required":false}'

# Update field
curl -X PATCH http://HOST:PORT/_/api/collections/tasks/fields/due_date \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"deadline","type":"datetime"}'

# Remove field
curl -X DELETE http://HOST:PORT/_/api/collections/tasks/fields/status \
  -H "Authorization: Bearer <token>"
```

### Manage Rules

```bash
# Get rules
curl http://HOST:PORT/_/api/collections/tasks/rules -H "Authorization: Bearer <token>"

# Update rules
curl -X PATCH http://HOST:PORT/_/api/collections/tasks/rules \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"listRule":"","viewRule":"","createRule":"@request.auth.id != \"\"","updateRule":"assignee = @request.auth.id","deleteRule":null}'
```

---

## Records CRUD

### Create Record

```bash
# JSON body
curl -X POST http://HOST:PORT/api/collections/tasks/records \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Buy groceries","status":"pending","priority":3,"metadata":{"tags":["personal"]}}'

# With file upload (multipart)
curl -X POST http://HOST:PORT/api/collections/tasks/records \
  -H "Authorization: Bearer <token>" \
  -F "title=Report" \
  -F "attachment=@/path/to/file.pdf"
```

Response (201): Full record with system fields `id`, `created_at`, `updated_at`.

### Get Record

```bash
curl http://HOST:PORT/api/collections/tasks/records/RECORD_ID \
  -H "Authorization: Bearer <token>"

# With relation expansion
curl "http://HOST:PORT/api/collections/tasks/records/RECORD_ID?expand=assignee" \
  -H "Authorization: Bearer <token>"
```

### List Records

```bash
curl "http://HOST:PORT/api/collections/tasks/records?page=1&perPage=20&sort=-created_at&filter=status%3D'pending'" \
  -H "Authorization: Bearer <token>"
```

Response:
```json
{
  "page": 1,
  "perPage": 20,
  "totalItems": 42,
  "totalPages": 3,
  "items": [...]
}
```

### Update Record

```bash
# Partial update (only send changed fields)
curl -X PATCH http://HOST:PORT/api/collections/tasks/records/RECORD_ID \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"status":"done","priority":5}'
```

### Delete Record

```bash
curl -X DELETE http://HOST:PORT/api/collections/tasks/records/RECORD_ID \
  -H "Authorization: Bearer <token>"
```
Response: 204 No Content. Associated files are automatically deleted.

### CLI Records

```bash
# List with filters
bunbase records list tasks --filter "status='pending'" --sort "-priority,title" --page 1 --per-page 50

# Create from JSON
echo '{"title":"New task","status":"pending"}' | bunbase records create tasks --stdin

# Create from key-value pairs
bunbase records create tasks --set title="New task" --set priority=3

# Batch create (array)
echo '[{"title":"Task A"},{"title":"Task B"}]' | bunbase records create tasks --stdin

# Get single
bunbase records get tasks RECORD_ID --expand assignee

# Update
bunbase records update tasks RECORD_ID --set status="done"
echo '{"status":"done"}' | bunbase records update tasks RECORD_ID --stdin

# Delete
bunbase records delete tasks RECORD_ID --confirm

# Search across text fields
bunbase records list tasks --search "groceries"
```

---

## Query and Filtering

### URL Parameter Filters

Applied directly as query parameters. Multiple filters are ANDed.

| Syntax | Operator | Example |
|---|---|---|
| `field=value` | equals | `?status=active` |
| `field!=value` | not equals | `?status!=draft` |
| `field~=value` | LIKE (contains) | `?title~=hello` |
| `field!~=value` | NOT LIKE | `?title!~=test` |
| `field>=value` | greater or equal | `?priority>=3` |
| `field<=value` | less or equal | `?price<=100` |
| `field>value` | greater than | `?score>50` |
| `field<value` | less than | `?age<30` |

### Filter Expression (complex logic)

Use the `filter` query parameter for AND/OR/grouping:

```
# OR conditions
filter=status='active'||status='pending'

# AND conditions
filter=status='active'&&priority>=3

# Grouped
filter=(status='active'||status='pending')&&assigned_to='user1'

# LIKE / NOT LIKE
filter=title~'hello'
filter=title!~'draft'

# Null check
filter=deleted_at=null

# Boolean
filter=published=true
```

Operators: `=`, `!=`, `>`, `<`, `>=`, `<=`, `~` (LIKE), `!~` (NOT LIKE)
Values: `'string'`, `"string"`, `42`, `3.14`, `-1`, `true`, `false`, `null`

### Sorting

```
?sort=-created_at,title
```
Prefix `-` for descending, `+` or no prefix for ascending. Comma-separate multiple fields.

### Pagination

- `page`: 1-based (default 1, min 1)
- `perPage`: default 30, min 1, max 500

### Relation Expansion

```
?expand=assignee,category
```

Adds an `expand` object to each record with the full related record inlined. Only `relation` fields can be expanded. Nested expansion is not supported.

### Cross-Field Search

```
?search=hello
```
Searches `id` and all `text`/`datetime` fields using LIKE with OR logic. ANDed with other active filters.

---

## Access Rules

Rules control who can perform operations. Admin tokens and API keys bypass all rules.

| Value | Meaning |
|---|---|
| `null` | Admin-only |
| `""` | Public (anyone) |
| `"expression"` | Evaluated per-request |

### Rule Expressions

Available references:

| Reference | Description |
|---|---|
| `@request.auth.id` | Authenticated user's record ID (empty string if unauthenticated) |
| `@request.auth.email` | User's email |
| `@request.auth.verified` | User's verification status |
| `@request.auth.collectionId` | User's auth collection ID |
| `@request.auth.collectionName` | User's auth collection name |
| `@request.body.<field>` | Value from request body (create/update rules) |
| `id` | Record's ID (view/update/delete rules) |
| `<fieldName>` | Any record field (view/update/delete rules) |

### Common Rule Patterns

```json
{
  "listRule": "",
  "viewRule": "",
  "createRule": "@request.auth.id != ''",
  "updateRule": "user_id = @request.auth.id",
  "deleteRule": null
}
```

| Pattern | Meaning |
|---|---|
| `""` | Public |
| `null` | Admin only |
| `@request.auth.id != ''` | Any logged-in user |
| `id = @request.auth.id` | Owner only (record ID = user ID) |
| `user_id = @request.auth.id` | Owner via foreign key |
| `@request.auth.verified = true` | Verified users only |
| `@request.auth.collectionName = 'admins'` | Users from specific collection |
| `status = 'published' \|\| @request.auth.id != ''` | Public if published, or any user |

For **list** operations, rules become SQL WHERE clauses. For **view/update/delete**, rules are evaluated in-memory against the record.

---

## User Authentication (Auth Collections)

### Sign Up

```bash
curl -X POST http://HOST:PORT/api/collections/users/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"secure123"}'
```

Password requirements: minimum length (default 8), at least 1 letter, at least 1 number.

Response (201): `{"user":{"id":"...","email":"...","verified":false,...}}`

### Log In

```bash
curl -X POST http://HOST:PORT/api/collections/users/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"secure123"}'
```

Response: `{"token":"<access-jwt>","refreshToken":"<refresh-jwt>","user":{...}}`

Returns 401 on bad credentials (generic message prevents enumeration). Returns 403 if `requireEmailVerification` is true and user is unverified.

### Refresh Token

```bash
curl -X POST http://HOST:PORT/api/collections/users/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<refresh-token>"}'
```

Response: `{"token":"<new-access>","refreshToken":"<new-refresh>"}`

Old refresh token is revoked (token rotation).

### Email Verification Flow

```bash
# Request verification email (requires user auth + SMTP configured)
curl -X POST http://HOST:PORT/api/collections/users/auth/request-verification \
  -H "Authorization: Bearer <user-token>"

# Confirm (with token from email link)
curl -X POST http://HOST:PORT/api/collections/users/auth/confirm-verification \
  -H "Content-Type: application/json" \
  -d '{"token":"<verification-token>"}'
```

### Password Reset Flow

```bash
# Request reset (always returns success to prevent enumeration)
curl -X POST http://HOST:PORT/api/collections/users/auth/request-reset \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com"}'

# Confirm reset
curl -X POST http://HOST:PORT/api/collections/users/auth/confirm-reset \
  -H "Content-Type: application/json" \
  -d '{"token":"<reset-token>","newPassword":"newSecure456"}'
```

Revokes all refresh tokens (forces re-login on all devices).

### Admin Auth User Management

```bash
# Set user verified status directly (no email needed)
curl -X POST http://HOST:PORT/_/api/collections/users/auth/set-verified \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"userId":"<user-id>","verified":true}'

# Edit user email and custom fields
curl -X PATCH http://HOST:PORT/_/api/collections/users/auth/users/USER_ID \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"email":"new@example.com","display_name":"New Name"}'

# Send verification email via admin
curl -X POST http://HOST:PORT/_/api/collections/users/auth/send-verification \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"userId":"<user-id>"}'
```

---

## File Uploads

### Upload with Record Creation

```bash
curl -X POST http://HOST:PORT/api/collections/posts/records \
  -H "Authorization: Bearer <token>" \
  -F "title=My Post" \
  -F "cover=@/path/to/image.jpg"
```

### Upload with Record Update

```bash
curl -X PATCH http://HOST:PORT/api/collections/posts/records/RECORD_ID \
  -H "Authorization: Bearer <token>" \
  -F "gallery=@/path/to/photo1.jpg" \
  -F "gallery=@/path/to/photo2.jpg"
```

### Multi-File Updates (retaining existing files)

For multi-file fields (`maxFiles > 1`), pass `<fieldName>_existing` to keep specific files:

```bash
curl -X PATCH http://HOST:PORT/api/collections/posts/records/RECORD_ID \
  -H "Authorization: Bearer <token>" \
  -F "gallery_existing=existing_photo_abc123.jpg" \
  -F "gallery=@/path/to/new_photo.jpg"
```

### Serve Files

```bash
# With auth header
curl http://HOST:PORT/api/files/posts/RECORD_ID/filename.jpg \
  -H "Authorization: Bearer <token>"

# With query token (for browsers/img tags)
curl "http://HOST:PORT/api/files/posts/RECORD_ID/filename.jpg?token=<jwt>"

# With API key
curl http://HOST:PORT/api/files/posts/RECORD_ID/filename.jpg \
  -H "X-API-Key: bb_..."
```

File fields in API responses are returned as full URLs.

### Filename Sanitization

Uploaded filenames are automatically sanitized:
- Dangerous chars replaced with `_` (only `a-zA-Z0-9_-` kept)
- Base name truncated to 100 chars
- Extension lowercased
- 10-char random suffix appended: `originalname_aBcDeFgHiJ.jpg`

---

## Realtime / Server-Sent Events (SSE)

### Connection Flow

```javascript
// 1. Open SSE connection
const es = new EventSource('http://HOST:PORT/api/realtime');

// 2. Wait for PB_CONNECT event
es.addEventListener('PB_CONNECT', (e) => {
  const { clientId } = JSON.parse(e.data);

  // 3. Subscribe to topics
  fetch('http://HOST:PORT/api/realtime', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token,  // optional, for rule enforcement
    },
    body: JSON.stringify({
      clientId,
      subscriptions: ['tasks/*', 'tasks/specific-id'],
    }),
  });
});

// 4. Listen for events
es.addEventListener('tasks', (e) => {
  const { action, record } = JSON.parse(e.data);
  // action: "create" | "update" | "delete"
  console.log(action, record);
});
```

### Subscription Topics

- `collectionName/*` - All events in collection (uses `listRule`)
- `collectionName/recordId` - Specific record events (uses `viewRule`)
- Send `"subscriptions": []` to unsubscribe from everything

### Connection Lifecycle

- Keep-alive pings every 30 seconds
- Inactive connections cleaned up after 5 minutes

---

## Admin Management API

All `/_/api/` endpoints require admin auth.

### Admin Accounts

```bash
# Login
curl -X POST http://HOST:PORT/_/api/auth/login \
  -d '{"email":"admin@bunbase.local","password":"<pass>"}'

# Get current admin
curl http://HOST:PORT/_/api/auth/me -H "Authorization: Bearer <token>"

# Change password
curl -X POST http://HOST:PORT/_/api/auth/password \
  -H "Authorization: Bearer <token>" \
  -d '{"newPassword":"newpass123"}'
```

### CLI Admin Commands

```bash
bunbase admin create --email admin@example.com --password secret123
bunbase admin reset-password --email admin@bunbase.local --password newsecret
```

### API Key Management

```bash
# Create
bunbase apikeys create --name "agent-key"

# List
bunbase apikeys list
bunbase apikeys list --format table

# Revoke
bunbase apikeys revoke KEY_ID --confirm
```

---

## Lifecycle Hooks

Hooks fire around record mutations via the HTTP API. Register them in custom route files.

### Events

| Event | Can Cancel? | Context |
|---|---|---|
| `beforeCreate` | Yes (throw) | `collection`, `data` (mutable), `request` |
| `afterCreate` | No | `collection`, `record`, `request` |
| `beforeUpdate` | Yes (throw) | `collection`, `id`, `data` (mutable), `existing`, `request` |
| `afterUpdate` | No | `collection`, `record`, `request` |
| `beforeDelete` | Yes (throw) | `collection`, `id`, `existing`, `request` |
| `afterDelete` | No | `collection`, `id`, `request` |

### Registration

```typescript
// In routes/setup.ts
import type { RouteContext } from '../src/api/context';

export const GET = async (req: Request, ctx: RouteContext) => {
  // Collection-specific
  ctx.hooks.on('beforeCreate', 'tasks', async (hookCtx, next) => {
    hookCtx.data.slug = hookCtx.data.title?.toString().toLowerCase().replace(/\s+/g, '-');
    await next(); // MUST call next() to continue chain
  });

  // Global (all collections)
  ctx.hooks.on('afterCreate', async (hookCtx, next) => {
    console.log(`Created in ${hookCtx.collection}:`, hookCtx.record.id);
    await next();
  });

  return Response.json({ ok: true });
};
```

---

## Custom Routes

File-based routing in the `routes/` directory.

### File Naming to Route Mapping

| File | Route |
|---|---|
| `routes/health.ts` | `/api/health` |
| `routes/users/index.ts` | `/api/users` |
| `routes/users/[id].ts` | `/api/users/:id` |
| `routes/users/[id]/posts.ts` | `/api/users/:id/posts` |

### Route File Format

```typescript
import type { RouteContext } from '../src/api/context';

export const GET = async (req: Request, ctx: RouteContext): Promise<Response> => {
  // URL params
  const { id } = ctx.params;

  // Auth check
  const { isAdmin, user } = await ctx.auth.buildContext(req);

  // Direct DB query
  const stats = ctx.db.query('SELECT COUNT(*) as count FROM tasks').get();

  // Records API (with hooks)
  const tasks = ctx.records.list('tasks', { page: 1, perPage: 10, sort: [{ field: 'created_at', direction: 'desc' }] });
  const task = ctx.records.get('tasks', id);
  const created = await ctx.records.create('tasks', { title: 'New' });
  const updated = await ctx.records.update('tasks', id, { status: 'done' });
  await ctx.records.delete('tasks', id);

  // File operations
  const filename = await ctx.files.save('tasks', id, file);
  const path = ctx.files.getPath('tasks', id, 'photo.jpg');
  const exists = await ctx.files.exists('tasks', id, 'photo.jpg');
  await ctx.files.delete('tasks', id, 'photo.jpg');

  // Auth helpers
  await ctx.auth.requireAdmin(req); // throws if not admin
  const maybeUser = await ctx.auth.optionalUser(req);

  return Response.json({ tasks });
};

export const POST = async (req: Request, ctx: RouteContext): Promise<Response> => {
  const body = await req.json();
  const record = await ctx.records.create('tasks', body);
  return Response.json(record, { status: 201 });
};
```

Supported exports: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`.

### Build Routes

```bash
bun run build:routes   # Regenerates src/routes-generated.ts
bun run dev            # Build + start with --watch
```

---

## CLI Global Reference

```
bunbase <command> [options]
```

### Global Options

| Flag | Default | Description |
|---|---|---|
| `--db <path>` | `BUNBASE_DB` env or `bunbase.db` | SQLite database file |
| `--format <fmt>` | `json` | Output format: `json` or `table` |
| `--quiet` | `false` | Suppress non-essential output |
| `-h, --help` | | Show help |

### Serve Options

| Flag | Default | Description |
|---|---|---|
| `-p, --port <port>` | `8090` | Port (1-65535) |
| `--db <path>` | `bunbase.db` | Database file |
| `--smtp-host` | `SMTP_HOST` env | SMTP hostname |
| `--smtp-port` | `SMTP_PORT` env or `587` | SMTP port |
| `--smtp-user` | `SMTP_USER` env | SMTP username |
| `--smtp-pass` | `SMTP_PASS` env | SMTP password |
| `--smtp-from` | `SMTP_FROM` env | Default sender |

### Output Convention

- **stdout**: Data (JSON or table)
- **stderr**: Errors as `{"error":"<CODE>","message":"<description>"}`
- **Exit codes**: 0 = success, 1 = runtime error, 2 = validation/usage error

---

## Environment Variables

| Variable | Default | Required | Description |
|---|---|---|---|
| `JWT_SECRET` | - | **Yes** | Secret for signing all JWT tokens |
| `BUNBASE_DB` | `bunbase.db` | No | Database file path |
| `BUNBASE_ADMIN_PASSWORD` | random (printed) | No | Initial admin password |
| `BUNBASE_STORAGE_DIR` | `./data/storage` | No | File storage directory |
| `BUNBASE_DEV` | `false` | No | Dev mode |
| `SMTP_HOST` | - | For email | SMTP hostname |
| `SMTP_PORT` | `587` | No | SMTP port (465 = implicit TLS) |
| `SMTP_USER` | - | For email | SMTP username |
| `SMTP_PASS` | - | For email | SMTP password |
| `SMTP_FROM` | `SMTP_USER` | No | Default sender address |

---

## Error Handling

All API errors return JSON: `{"error":"<message>"}`

| Status | Condition |
|---|---|
| 400 | Validation failed, invalid filter/sort, hook cancellation |
| 401 | Missing or invalid authentication |
| 403 | Email verification required |
| 404 | Record/collection/file not found |
| 409 | Name conflict (collection/field exists) |

CLI error codes: `UNKNOWN_COMMAND`, `MISSING_SUBCOMMAND`, `UNKNOWN_SUBCOMMAND`, `VALIDATION_ERROR`, `NOT_FOUND`, `CONFIRMATION_REQUIRED`, `COLLECTION_ERROR`, `RECORD_ERROR`, `ADMIN_ERROR`, `FATAL`.

---

## Complete API Endpoint Map

### Public Data API (`/api/`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/collections/:name/records` | Rules | List records (paginated) |
| GET | `/api/collections/:name/records/:id` | Rules | Get single record |
| POST | `/api/collections/:name/records` | Rules | Create record |
| PATCH | `/api/collections/:name/records/:id` | Rules | Update record (partial) |
| DELETE | `/api/collections/:name/records/:id` | Rules | Delete record |
| GET | `/api/files/:collection/:recordId/:filename` | viewRule | Serve file |
| GET | `/api/realtime` | None | SSE connection |
| POST | `/api/realtime` | Optional | Subscribe to topics |

### Auth Collection Endpoints (`/api/collections/:name/auth/`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `.../auth/signup` | None | Create user account |
| POST | `.../auth/login` | None | Get token pair |
| POST | `.../auth/refresh` | None | Rotate tokens |
| POST | `.../auth/request-verification` | User | Send verification email |
| POST | `.../auth/confirm-verification` | None | Verify with token |
| GET | `.../auth/confirm-verification?token=` | None | Verify (HTML page) |
| POST | `.../auth/request-reset` | None | Request password reset |
| POST | `.../auth/confirm-reset` | None | Reset with token |
| GET | `.../auth/confirm-reset?token=` | None | Reset (HTML form) |

### Admin API (`/_/api/`)

| Method | Path | Description |
|---|---|---|
| POST | `/_/api/auth/login` | Admin login |
| GET | `/_/api/auth/me` | Current admin info |
| POST | `/_/api/auth/password` | Change admin password |
| GET | `/_/api/collections` | List all collections |
| POST | `/_/api/collections` | Create collection |
| PATCH | `/_/api/collections/:name` | Rename collection |
| DELETE | `/_/api/collections/:name` | Delete collection |
| GET | `/_/api/collections/:name/fields` | List fields |
| POST | `/_/api/collections/:name/fields` | Add field |
| PATCH | `/_/api/collections/:name/fields/:fieldName` | Update field |
| DELETE | `/_/api/collections/:name/fields/:fieldName` | Remove field |
| GET | `/_/api/collections/:name/rules` | Get rules |
| PATCH | `/_/api/collections/:name/rules` | Update rules |
| POST | `/_/api/collections/:name/auth/send-verification` | Send verification email |
| POST | `/_/api/collections/:name/auth/set-verified` | Set verified status |
| PATCH | `/_/api/collections/:name/auth/users/:id` | Edit auth user |

---

## Agent Workflow Patterns

### Pattern 1: Bootstrap a new app

```bash
# 1. Create API key for ongoing use
bunbase apikeys create --name "agent"
# Save the bb_... key

# 2. Create collections
curl -X POST http://localhost:8090/_/api/collections \
  -H "X-API-Key: bb_..." \
  -H "Content-Type: application/json" \
  -d '{"name":"users","type":"auth","fields":[{"name":"role","type":"text","required":false}]}'

curl -X POST http://localhost:8090/_/api/collections \
  -H "X-API-Key: bb_..." \
  -H "Content-Type: application/json" \
  -d '{"name":"posts","type":"base","fields":[{"name":"title","type":"text","required":true},{"name":"body","type":"text","required":false},{"name":"author","type":"relation","required":true,"options":{"collection":"users"}}],"rules":{"listRule":"","viewRule":"","createRule":"@request.auth.id != \"\"","updateRule":"author = @request.auth.id","deleteRule":"author = @request.auth.id"}}'
```

### Pattern 2: Seed data

```bash
echo '[
  {"title":"First Post","body":"Hello world","author":"USER_ID"},
  {"title":"Second Post","body":"Another post","author":"USER_ID"}
]' | bunbase records create posts --stdin
```

### Pattern 3: Query with complex filters

```bash
curl "http://localhost:8090/api/collections/posts/records?filter=(status%3D'published'%7C%7Cauthor%3D'USER_ID')%26%26priority%3E%3D3&sort=-created_at&expand=author&perPage=50" \
  -H "X-API-Key: bb_..."
```

### Pattern 4: User auth flow

```bash
# Sign up
curl -X POST http://localhost:8090/api/collections/users/auth/signup \
  -d '{"email":"agent@example.com","password":"agentPass1"}'

# Admin-verify the user (skip email)
curl -X POST http://localhost:8090/_/api/collections/users/auth/set-verified \
  -H "X-API-Key: bb_..." \
  -d '{"userId":"USER_ID","verified":true}'

# Login as user
curl -X POST http://localhost:8090/api/collections/users/auth/login \
  -d '{"email":"agent@example.com","password":"agentPass1"}'
```

---

## Database Internals

- Single SQLite file, WAL mode
- Pragmas: `journal_mode=WAL`, `synchronous=NORMAL`, `foreign_keys=ON`, `cache_size=-64000` (64MB)
- System tables: `_collections`, `_fields`, `_admins`, `_refresh_tokens`, `_verification_tokens`, `_api_keys`
- Record IDs: nanoid, 21 characters
- Collection names: `^[a-zA-Z][a-zA-Z0-9_]*$`
- Field names: `^[a-zA-Z][a-zA-Z0-9_]*$`
- Passwords: argon2id (memoryCost: 65536, timeCost: 2)
- Tokens: SHA-256 hashed before storage, 1-hour expiry for verification/reset

### Build Scripts

```bash
bun run dev            # Dev mode with watch
bun run build:routes   # Regenerate route registry
bun run build:admin    # Build admin UI
bun run build          # Full build to single binary
bun test               # Run all tests
bun run typecheck      # TypeScript check
```
