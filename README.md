# BunBase

A self-contained, PocketBase-inspired backend-as-a-service built on **Bun + SQLite**. Ships as a single compiled binary with zero runtime dependencies.

---

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [CLI Reference](#cli-reference)
- [Admin UI](#admin-ui)
- [Core Concepts](#core-concepts)
  - [Collections](#collections)
  - [Field Types](#field-types)
  - [Access Rules](#access-rules)
  - [System Fields](#system-fields)
- [REST API Reference](#rest-api-reference)
  - [Records API](#records-api)
  - [File Serving API](#file-serving-api)
  - [Realtime API (SSE)](#realtime-api-sse)
  - [User Auth API](#user-auth-api)
  - [Admin Management API](#admin-management-api)
- [Authentication](#authentication)
  - [Admin Auth](#admin-auth)
  - [User Auth (Auth Collections)](#user-auth-auth-collections)
  - [Token Usage](#token-usage)
- [File Uploads](#file-uploads)
- [Query & Filtering](#query--filtering)
- [Lifecycle Hooks](#lifecycle-hooks)
- [Realtime / SSE](#realtime--sse)
- [Custom Routes](#custom-routes)
- [Email / SMTP](#email--smtp)
- [Development Mode](#development-mode)
- [Building from Source](#building-from-source)
- [Environment Variables](#environment-variables)
- [Database Internals](#database-internals)

---

## Overview

BunBase provides instant CRUD APIs, auth, file storage, and realtime subscriptions — all from a single SQLite file. It is a PocketBase alternative built natively on Bun's APIs:

| Feature | BunBase approach |
|---|---|
| Database | `bun:sqlite` (WAL mode, 64 MB cache) |
| HTTP server | `Bun.serve()` with pattern-matched routes |
| Auth tokens | `jose` JWT (HS256), argon2id passwords |
| File storage | Local filesystem under `./data/storage/` |
| Realtime | Server-Sent Events (SSE) |
| Admin UI | React SPA embedded in the binary |
| Email | Nodemailer SMTP |

---

## Quick Start

### Download pre-built binary

```sh
# Start on default port 8090 with bunbase.db
./bunbase

# Custom port and database
./bunbase --port 3000 --db ./data/myapp.db
```

### Or run from source

```sh
bun install
bun run dev        # dev mode with hot reload
```

On first start, BunBase prints an auto-generated admin password:

```
Initial admin created: admin@bunbase.local
Generated password: xK7mQ3pN9rT2wZ4v
```

Open `http://localhost:8090/_/` for the Admin UI.

---

## CLI Reference

```
Usage: bunbase [options]

Options:
  -p, --port <port>    Port to listen on (default: 8090)
  --db <path>          Database file path (default: bunbase.db)
  -h, --help           Show this help message

SMTP Options:
  --smtp-host <host>   SMTP server hostname (or SMTP_HOST env var)
  --smtp-port <port>   SMTP server port (default: 587, or SMTP_PORT)
  --smtp-user <user>   SMTP username (or SMTP_USER env var)
  --smtp-pass <pass>   SMTP password (or SMTP_PASS env var)
  --smtp-from <addr>   Default from address (or SMTP_FROM, defaults to smtp-user)

Examples:
  bunbase                        # Port 8090, bunbase.db
  bunbase -p 3000                # Custom port
  bunbase --db /var/data/app.db  # Custom DB path
  bunbase --smtp-host smtp.gmail.com --smtp-user me@gmail.com --smtp-pass secret
```

---

## Admin UI

The Admin UI is served at `/_/` and is a full React SPA embedded in the binary.

| Path | Description |
|---|---|
| `/_/` | Dashboard — collection list with record/field counts |
| `/_/login` | Admin login page |
| `/_/collections/:name` | Browse and manage records in a collection |
| `/_/collections/:name/schema` | Edit collection schema (fields) |
| `/_/collections/:name/auth` | Manage users in an auth collection |

**First login:** `admin@bunbase.local` / (printed on first start)

---

## Core Concepts

### Collections

A **collection** is a named table. There are two types:

| Type | Description |
|---|---|
| `base` | General purpose data collection |
| `auth` | User authentication collection — adds `email`, `password_hash`, `verified` columns automatically |

Collection names must start with a letter and contain only `[a-zA-Z0-9_]`.

### Field Types

| Type | SQLite storage | Notes |
|---|---|---|
| `text` | `TEXT` | Optional `maxLength` |
| `number` | `REAL` | Optional `min`, `max` |
| `boolean` | `INTEGER` | Stored as `0`/`1`, returned as `true`/`false` |
| `datetime` | `TEXT` | ISO 8601 string |
| `json` | `TEXT` | JSON-stringified, parsed on read |
| `relation` | `TEXT` | Foreign record ID. Requires `options.collection` (target collection name) |
| `file` | `TEXT` | Filename(s) stored; served via `/api/files/…`. Options: `maxFiles`, `maxSize` (bytes), `allowedTypes` (MIME) |

**Field options example:**

```json
{
  "name": "avatar",
  "type": "file",
  "required": false,
  "options": {
    "maxFiles": 1,
    "maxSize": 5242880,
    "allowedTypes": ["image/jpeg", "image/png", "image/*"]
  }
}
```

```json
{
  "name": "author",
  "type": "relation",
  "required": true,
  "options": { "collection": "users" }
}
```

### Access Rules

Every collection has five rules. Each rule is one of:

| Value | Meaning |
|---|---|
| `null` | Locked — admin only |
| `""` (empty string) | Public — anyone can access |
| `"expression"` | Evaluated per-request |

**Rule expressions** support:

```
@request.auth.id = id              # user can only see their own records
@request.auth.verified = true      # require verified email
@request.auth.collectionName = 'users'
id = @request.auth.id              # same as first example
@request.auth.id != ""             # any logged-in user
```

Logical operators `&&` and `||` are supported. Comparison operators: `=`, `!=`, `>`, `<`, `>=`, `<=`.

**Example rules object:**

```json
{
  "listRule": "@request.auth.id != \"\"",
  "viewRule": "id = @request.auth.id",
  "createRule": "@request.auth.id != \"\"",
  "updateRule": "id = @request.auth.id",
  "deleteRule": "id = @request.auth.id"
}
```

Rules are evaluated at the HTTP API level. Admin tokens bypass all rules.

### System Fields

Every record automatically gets:

| Field | Type | Description |
|---|---|---|
| `id` | `string` | nanoid — unique record identifier |
| `created_at` | `string` | ISO 8601 creation timestamp |
| `updated_at` | `string` | ISO 8601 last-update timestamp |

Auth collections additionally have `email`, `verified` (boolean), `password_hash` (never returned to clients).

---

## REST API Reference

All public data APIs are under `/api/`. Admin management APIs are under `/_/api/`. All responses use `Content-Type: application/json`. Errors return `{ "error": "message" }`.

### Records API

#### List records

```
GET /api/collections/:name/records
```

Returns a paginated list. Respects the collection's `listRule`.

**Query parameters:**

| Parameter | Description | Default |
|---|---|---|
| `page` | Page number (1-based) | `1` |
| `perPage` | Items per page (max 500) | `30` |
| `sort` | Comma-separated fields. Prefix `-` for desc, `+` or nothing for asc. | — |
| `expand` | Comma-separated relation field names to inline | — |
| `<field>` | Equality filter: `?title=hello` | — |
| `<field>~` | LIKE filter: `?title~=hel` | — |
| `<field>!=` | Not-equal: `?status!=draft` | — |
| `<field>>` | Greater than: `?age>=18` | — |
| `<field><` | Less than: `?price<=100` | — |

**Response:**

```json
{
  "page": 1,
  "perPage": 30,
  "totalItems": 42,
  "totalPages": 2,
  "items": [
    {
      "id": "abc123",
      "title": "Hello",
      "created_at": "2025-01-15T10:00:00.000Z",
      "updated_at": "2025-01-15T10:00:00.000Z"
    }
  ]
}
```

**Examples:**

```sh
# All posts, newest first
GET /api/collections/posts/records?sort=-created_at

# Filter + pagination
GET /api/collections/posts/records?status=published&page=2&perPage=10

# Expand relation field
GET /api/collections/posts/records?expand=author

# LIKE filter
GET /api/collections/posts/records?title~=bun
```

---

#### Get single record

```
GET /api/collections/:name/records/:id
```

Respects the collection's `viewRule`. Returns file fields as full URLs.

**Response:** The record object, or `404` if not found.

---

#### Create record

```
POST /api/collections/:name/records
Content-Type: application/json
```

Respects the collection's `createRule`. Triggers `beforeCreate` / `afterCreate` hooks.

**Body:** Record fields (without system fields).

```json
{ "title": "My Post", "content": "Hello world", "published": true }
```

**Response:** `201` with the created record.

For file uploads use `multipart/form-data` (see [File Uploads](#file-uploads)).

---

#### Update record

```
PATCH /api/collections/:name/records/:id
Content-Type: application/json
```

Partial updates — only send the fields you want to change. Respects `updateRule`. Triggers `beforeUpdate` / `afterUpdate` hooks.

**Body:**

```json
{ "title": "Updated Title" }
```

**Response:** The full updated record.

For file updates use `multipart/form-data`.

---

#### Delete record

```
DELETE /api/collections/:name/records/:id
```

Respects `deleteRule`. Triggers `beforeDelete` / `afterDelete` hooks. Also deletes any associated files from storage.

**Response:** `204 No Content`

---

### File Serving API

```
GET /api/files/:collection/:recordId/:filename
```

Serves a stored file. Enforces the collection's `viewRule` — the same access control as viewing the record.

Supports token via query parameter for direct browser access (links, `<img src>` tags):

```
GET /api/files/posts/abc123/photo.jpg?token=<jwt>
```

The Content-Type is automatically set from the file extension.

---

### Realtime API (SSE)

BunBase implements PocketBase-compatible Server-Sent Events.

#### Connect

```
GET /api/realtime
Accept: text/event-stream
```

Opens a persistent SSE connection. Immediately sends a `PB_CONNECT` event:

```
id: <event-id>
event: PB_CONNECT
data: {"clientId":"<clientId>"}
```

Keep-alive `# ping` comments are sent every 30 seconds. Inactive connections are cleaned up after 5 minutes.

#### Subscribe

```
POST /api/realtime
Content-Type: application/json
Authorization: Bearer <token>   (optional)
```

**Body:**

```json
{
  "clientId": "<clientId from PB_CONNECT>",
  "subscriptions": [
    "posts/*",
    "posts/abc123"
  ]
}
```

Subscription topics:
- `collectionName/*` — all events in a collection
- `collectionName/recordId` — events for a specific record

Send an empty `subscriptions: []` array to unsubscribe from everything.

**Response:** `204 No Content`

#### Realtime events

When records change, subscribers receive an SSE event named after the collection:

```
id: <event-id>
event: posts
data: {"action":"create","record":{...}}
```

Actions: `create`, `update`, `delete`.

Access rules are enforced per-subscriber: wildcard subscriptions use `listRule`, specific-record subscriptions use `viewRule`.

---

### User Auth API

Auth collections (type `auth`) expose authentication endpoints under `/api/collections/:name/auth/`.

#### Sign up

```
POST /api/collections/:name/auth/signup
Content-Type: application/json
```

```json
{ "email": "user@example.com", "password": "secure123" }
```

**Response:** `201`

```json
{
  "user": {
    "id": "abc123",
    "email": "user@example.com",
    "verified": false,
    "created_at": "...",
    "updated_at": "..."
  }
}
```

---

#### Log in

```
POST /api/collections/:name/auth/login
Content-Type: application/json
```

```json
{ "email": "user@example.com", "password": "secure123" }
```

**Response:**

```json
{
  "token": "<access-token>",
  "refreshToken": "<refresh-token>",
  "user": { "id": "...", "email": "...", "verified": true, ... }
}
```

- **Access token** — JWT, valid for **15 minutes**
- **Refresh token** — JWT, valid for **7 days**

Uses argon2id + timing-safe comparison. Returns `401` on failure with generic message (prevents user enumeration).

If the collection has `requireEmailVerification: true`, unverified users cannot log in.

---

#### Refresh tokens

```
POST /api/collections/:name/auth/refresh
Content-Type: application/json
```

```json
{ "refreshToken": "<refresh-token>" }
```

Implements **token rotation** — the old refresh token is revoked and a new pair is issued.

**Response:**

```json
{
  "token": "<new-access-token>",
  "refreshToken": "<new-refresh-token>"
}
```

---

#### Request email verification

```
POST /api/collections/:name/auth/request-verification
Authorization: Bearer <access-token>
```

Sends a verification email to the authenticated user. Requires SMTP to be configured. Returns `400` if already verified.

**Response:** `{ "message": "Verification email sent" }`

---

#### Confirm email verification

```
POST /api/collections/:name/auth/confirm-verification
Content-Type: application/json
```

```json
{ "token": "<verification-token>" }
```

Also supports `GET /api/collections/:name/auth/confirm-verification?token=<token>` for direct link clicks — returns an HTML page.

**Response:** `{ "message": "Email verified successfully" }`

---

#### Request password reset

```
POST /api/collections/:name/auth/request-reset
Content-Type: application/json
```

```json
{ "email": "user@example.com" }
```

Always returns the same message (prevents email enumeration). Sends a reset email if the account exists.

**Response:** `{ "message": "If an account exists, a reset email has been sent" }`

---

#### Confirm password reset

```
POST /api/collections/:name/auth/confirm-reset
Content-Type: application/json
```

```json
{ "token": "<reset-token>", "newPassword": "newSecure456" }
```

Revokes all existing refresh tokens (forces re-login on all devices).

Also supports `GET /api/collections/:name/auth/confirm-reset?token=<token>` which returns an HTML form.

**Response:** `{ "message": "Password reset successfully" }`

---

### Admin Management API

All `/_/api/` endpoints require an admin JWT (`Authorization: Bearer <admin-token>`).

#### Admin authentication

| Method | Path | Description |
|---|---|---|
| `POST` | `/_/api/auth/login` | Login: `{ email, password }` → `{ token, admin }` |
| `GET` | `/_/api/auth/me` | Get current admin info |
| `POST` | `/_/api/auth/password` | Change password: `{ newPassword }` |

---

#### Collection management

| Method | Path | Description |
|---|---|---|
| `GET` | `/_/api/collections` | List all collections (with `fieldCount`, `recordCount`) |
| `POST` | `/_/api/collections` | Create collection: `{ name, type?, fields? }` |
| `PATCH` | `/_/api/collections/:name` | Rename collection: `{ newName }` |
| `DELETE` | `/_/api/collections/:name` | Delete collection and all records |

**Create collection body:**

```json
{
  "name": "posts",
  "type": "base",
  "fields": [
    { "name": "title", "type": "text", "required": true },
    { "name": "content", "type": "text", "required": false }
  ]
}
```

For auth collections, set `"type": "auth"`. The `email`, `password_hash`, and `verified` fields are added automatically — do not include them in `fields`.

---

#### Field management

| Method | Path | Description |
|---|---|---|
| `GET` | `/_/api/collections/:name/fields` | List all fields |
| `POST` | `/_/api/collections/:name/fields` | Add a field |
| `PATCH` | `/_/api/collections/:name/fields/:fieldName` | Update a field |
| `DELETE` | `/_/api/collections/:name/fields/:fieldName` | Remove a field |

**Add field body:**

```json
{
  "name": "score",
  "type": "number",
  "required": false,
  "options": { "min": 0, "max": 100 }
}
```

Field type or `required` changes use shadow-table migration (data is preserved). Column renames use `ALTER TABLE RENAME COLUMN`.

---

#### Admin: send verification email

```
POST /_/api/collections/:name/auth/send-verification
Authorization: Bearer <admin-token>

{ "userId": "<user-record-id>" }
```

Sends a verification email to a specific user in an auth collection.

---

## Authentication

### Admin Auth

The admin account is created automatically on first start. The email is always `admin@bunbase.local`. Set `BUNBASE_ADMIN_PASSWORD` to control the password; otherwise a 16-character random password is generated and printed.

Admin JWTs are signed with a random secret generated per-run (stored in memory). They have no expiry by default — use `POST /_/api/auth/password` to rotate credentials.

### User Auth (Auth Collections)

Each `auth`-type collection is a fully independent user database. You can have multiple auth collections (e.g., `users`, `admins`, `vendors`).

Auth collection options (set at collection creation or edit):

```json
{
  "minPasswordLength": 8,
  "requireEmailVerification": false
}
```

Passwords are hashed with **argon2id** (`memoryCost: 65536`, `timeCost: 2`).

### Token Usage

Send the access token in the `Authorization` header:

```
Authorization: Bearer <access-token>
```

For file downloads where headers can't be set:

```
GET /api/files/posts/abc123/photo.jpg?token=<access-token>
```

---

## File Uploads

Use `multipart/form-data` for record create/update with files.

```sh
# Create record with file
curl -X POST http://localhost:8090/api/collections/posts/records \
  -H "Authorization: Bearer <token>" \
  -F "title=My Post" \
  -F "cover=@/path/to/image.jpg"

# Update, adding files to a multi-file field
curl -X PATCH http://localhost:8090/api/collections/posts/records/abc123 \
  -H "Authorization: Bearer <token>" \
  -F "gallery=@/path/to/photo1.jpg" \
  -F "gallery=@/path/to/photo2.jpg"
```

File storage path: `./data/storage/<collection>/<recordId>/<filename>`

Override with `BUNBASE_STORAGE_DIR` environment variable.

File fields in API responses include full URLs:

```json
{
  "id": "abc123",
  "cover": "http://localhost:8090/api/files/posts/abc123/cover.jpg"
}
```

Multi-file fields return arrays of URLs.

**File field options:**

| Option | Type | Default | Description |
|---|---|---|---|
| `maxFiles` | number | `1` | Max files per record field |
| `maxSize` | number | `10485760` (10 MB) | Max file size in bytes |
| `allowedTypes` | string[] | any | Allowed MIME types (supports wildcards: `image/*`) |

When a record is deleted, all associated files are automatically cleaned up.

---

## Query & Filtering

### Filter operators

Applied as URL query parameters:

| Parameter syntax | Operator | Example |
|---|---|---|
| `field=value` | equals | `?status=published` |
| `field!=value` | not equals | `?status!=draft` |
| `field~=value` | LIKE (contains) | `?title~=bun` |
| `field!~=value` | NOT LIKE | `?title!~=draft` |
| `field>=value` | greater or equal | `?age>=18` |
| `field<=value` | less or equal | `?price<=100` |
| `field>=value` | greater | `?score>50` |
| `field<=value` | less | `?score<100` |

Multiple filters are combined with `AND`.

### Sorting

```
?sort=-created_at,title
```

- Prefix `-` for descending
- Prefix `+` or no prefix for ascending
- Comma-separate multiple fields

### Pagination

```
?page=2&perPage=20
```

Max `perPage` is 500.

### Relation expansion

```
?expand=author,category
```

Inlines the referenced record(s) into the response. Chaining is not yet supported.

---

## Lifecycle Hooks

Hooks fire synchronously (awaited) around record mutations. Register hooks in `routes/` files using the `ctx.hooks` reference or by registering on the shared `HookManager`.

### Hook events

| Event | Fires | Can cancel? | Context |
|---|---|---|---|
| `beforeCreate` | Before INSERT | Yes (throw) | `{ collection, data, request }` |
| `afterCreate` | After INSERT | No (errors logged) | `{ collection, record, request }` |
| `beforeUpdate` | Before UPDATE | Yes (throw) | `{ collection, id, data, existing, request }` |
| `afterUpdate` | After UPDATE | No (errors logged) | `{ collection, record, request }` |
| `beforeDelete` | Before DELETE | Yes (throw) | `{ collection, id, existing, request }` |
| `afterDelete` | After DELETE | No (errors logged) | `{ collection, id, request }` |

### Registering hooks

In a custom route file (`routes/myroute.ts`):

```ts
import type { RouteContext } from '../src/api/context';

// Register hook at module load time
export const GET = async (req: Request, ctx: RouteContext) => {
  ctx.hooks.on('beforeCreate', 'posts', async (hookCtx, next) => {
    // Modify data before insert
    hookCtx.data.slug = hookCtx.data.title?.toString().toLowerCase().replace(/\s+/g, '-');
    await next(); // continue chain
  });

  return Response.json({ ok: true });
};
```

Or with a global hook:

```ts
ctx.hooks.on('afterCreate', async (hookCtx, next) => {
  console.log(`Created in ${hookCtx.collection}:`, hookCtx.record.id);
  await next();
});
```

Handlers execute in registration order. If a handler does not call `next()`, the chain stops silently. If a `before*` handler throws, the operation is cancelled and the error propagates as an HTTP `400`.

---

## Realtime / SSE

Realtime events are pushed via SSE after every create, update, or delete that goes through the HTTP API. Hooks also trigger broadcasts.

### JavaScript client example

```js
// 1. Connect
const eventSource = new EventSource('http://localhost:8090/api/realtime');
let clientId;

eventSource.addEventListener('PB_CONNECT', (e) => {
  clientId = JSON.parse(e.data).clientId;

  // 2. Subscribe
  fetch('http://localhost:8090/api/realtime', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + myToken,
    },
    body: JSON.stringify({
      clientId,
      subscriptions: ['posts/*'],
    }),
  });
});

// 3. Listen for events
eventSource.addEventListener('posts', (e) => {
  const { action, record } = JSON.parse(e.data);
  console.log(action, record); // "create" | "update" | "delete", record
});
```

Access rules are enforced per-subscriber using the token provided in the POST subscription request.

---

## Custom Routes

BunBase supports file-based routing in the `routes/` directory. Files are scanned at build time and injected at startup.

### File naming

| File path | API route |
|---|---|
| `routes/health.ts` | `/api/health` |
| `routes/stats.ts` | `/api/stats` |
| `routes/users/index.ts` | `/api/users` |
| `routes/users/[id].ts` | `/api/users/:id` |
| `routes/users/[id]/posts.ts` | `/api/users/:id/posts` |

### Route file format

Export named functions for each HTTP method (uppercase):

```ts
// routes/health.ts
import type { RouteContext } from '../src/api/context';

export const GET = async (req: Request, ctx: RouteContext): Promise<Response> => {
  return Response.json({ status: 'ok', timestamp: new Date().toISOString() });
};
```

### RouteContext API

Every handler receives `(req: Request, ctx: RouteContext)` where `ctx` provides:

| Property | Type | Description |
|---|---|---|
| `ctx.db` | `Database` | Direct SQLite access (`bun:sqlite`) |
| `ctx.records.get(col, id)` | sync | Fetch one record |
| `ctx.records.list(col, options?)` | sync | List records with filter/sort/page |
| `ctx.records.create(col, data)` | async | Create (fires hooks) |
| `ctx.records.update(col, id, data)` | async | Update (fires hooks) |
| `ctx.records.delete(col, id)` | async | Delete (fires hooks) |
| `ctx.auth.buildContext(req)` | async | Returns `{ isAdmin, user }` |
| `ctx.auth.optionalUser(req)` | async | Returns user or `null` |
| `ctx.auth.requireAdmin(req)` | async | Throws if not admin |
| `ctx.realtime` | `RealtimeManager` | Send custom SSE events |
| `ctx.files.save(col, id, file)` | async | Save a file, returns filename |
| `ctx.files.getPath(col, id, name)` | sync | Full filesystem path |
| `ctx.files.exists(col, id, name)` | async | Check existence |
| `ctx.files.delete(col, id, name)` | async | Delete a file |
| `ctx.hooks` | `HookManager` | Register lifecycle hooks |
| `ctx.params` | `Record<string,string>` | URL path params |

### Build and rebuild routes

```sh
bun run build:routes   # Scan routes/ and regenerate src/routes-generated.ts
bun run dev            # Rebuilds routes + admin, then starts with --watch
```

Custom routes in `routes/` are automatically included in `bun build --compile` output.

---

## Email / SMTP

Email is optional. Configure it to enable email verification and password reset flows.

### Configuration

Via CLI flags:

```sh
bunbase --smtp-host smtp.gmail.com --smtp-port 587 \
        --smtp-user me@gmail.com --smtp-pass secret \
        --smtp-from "MyApp <me@gmail.com>"
```

Via environment variables:

```sh
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=SG.xxxx
SMTP_FROM=noreply@myapp.com
```

CLI flags take precedence over environment variables.

When SMTP is not configured, verification and reset email endpoints return errors. All other auth flows work without email.

---

## Development Mode

```sh
bun run dev
```

Enables:
- `--watch` on `src/cli.ts` for automatic restart
- HMR and browser console forwarding via `Bun.serve({ development: { hmr: true, console: true } })`
- Custom route logging on startup

Set `NODE_ENV=development` or `BUNBASE_DEV=true` to enable dev mode features when running outside `bun run dev`.

---

## Building from Source

```sh
# Build admin UI (React → dist/admin/)
bun run build:admin

# Scan routes/ and generate src/routes-generated.ts
bun run build:routes

# Compile to single binary
bun run build

# Output: ./bunbase (self-contained, no Node/Bun required to run)
```

The binary embeds:
- The admin UI (JS + CSS + HTML) as inline text
- All route handlers via static imports
- The Bun runtime itself

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `BUNBASE_ADMIN_PASSWORD` | (random, printed) | Initial admin password |
| `BUNBASE_STORAGE_DIR` | `./data/storage` | File storage root directory |
| `BUNBASE_DEV` | `false` | Enable dev mode features |
| `NODE_ENV` | — | Set to `development` to enable dev mode |
| `SMTP_HOST` | — | SMTP server hostname |
| `SMTP_PORT` | `587` | SMTP server port |
| `SMTP_USER` | — | SMTP username |
| `SMTP_PASS` | — | SMTP password |
| `SMTP_FROM` | `SMTP_USER` | Default from address |

---

## Database Internals

BunBase uses a single SQLite file with WAL mode and the following system tables (all prefixed with `_`):

| Table | Purpose |
|---|---|
| `_collections` | Collection definitions (name, type, options, rules) |
| `_fields` | Field definitions per collection |
| `_admins` | Admin accounts (email + argon2id hash) |
| `_refresh_tokens` | User refresh token store (supports revocation) |
| `_verification_tokens` | Email verification and password reset tokens (SHA-256 hashed) |

User data lives in tables named after collections (e.g., `posts`, `users`).

SQLite pragmas applied at startup:

```sql
PRAGMA journal_mode = WAL;       -- concurrent reads
PRAGMA synchronous = NORMAL;     -- balanced durability
PRAGMA foreign_keys = ON;        -- FK constraints enforced
PRAGMA cache_size = -64000;      -- 64 MB cache
```

Schema migrations run automatically on startup to handle version upgrades of existing databases.
