# BunBase

A self-contained backend-as-a-service built on Bun + SQLite. Provides instant CRUD APIs, authentication, file storage, realtime subscriptions, and an admin UI from a single binary and a single database file.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Authentication](#authentication)
  - [Admin JWT](#admin-jwt)
  - [User JWT (Auth Collections)](#user-jwt-auth-collections)
  - [API Keys](#api-keys)
  - [Token Precedence](#token-precedence)
- [CLI Reference](#cli-reference)
  - [Global Options](#global-options)
  - [serve](#serve)
  - [collections](#collections)
  - [records](#records)
  - [admin](#admin)
  - [apikeys](#apikeys)
  - [CLI Output Format](#cli-output-format)
- [REST API Reference](#rest-api-reference)
  - [Records API](#records-api)
  - [File Serving API](#file-serving-api)
  - [Realtime API (SSE)](#realtime-api-sse)
  - [User Auth API](#user-auth-api)
  - [Admin Management API](#admin-management-api)
  - [Error Responses](#error-responses)
- [Collections](#collections-1)
  - [Collection Types](#collection-types)
  - [Field Types](#field-types)
  - [Field Options](#field-options)
  - [System Fields](#system-fields)
  - [Auth Collection Options](#auth-collection-options)
- [Access Rules](#access-rules)
  - [Rule Values](#rule-values)
  - [Rule Expressions](#rule-expressions)
  - [Available References](#available-references)
  - [Rule Examples](#rule-examples)
- [Query and Filtering](#query-and-filtering)
  - [URL Parameter Filters](#url-parameter-filters)
  - [Filter Expressions](#filter-expressions)
  - [Cross-Field Search](#cross-field-search)
  - [Sorting](#sorting)
  - [Pagination](#pagination)
  - [Relation Expansion](#relation-expansion)
- [File Uploads](#file-uploads)
- [Lifecycle Hooks](#lifecycle-hooks)
- [Realtime / SSE](#realtime--sse-1)
- [Custom Routes](#custom-routes)
- [Email / SMTP](#email--smtp)
- [Environment Variables](#environment-variables)
- [Building from Source](#building-from-source)
- [Database Internals](#database-internals)

---

## Quick Start

### Run the binary

```sh
# Defaults: port 8090, database file bunbase.db
./bunbase

# Custom port and database
./bunbase serve --port 3000 --db ./data/myapp.db
```

### Run from source

```sh
bun install
bun run dev
```

On first start, an admin account is created automatically:

```
Initial admin created: admin@bunbase.local
Generated password: xK7mQ3pN9rT2wZ4v
```

Set `BUNBASE_ADMIN_PASSWORD` to control the initial password.

Admin UI: `http://localhost:8090/_/`

---

## Authentication

BunBase supports three authentication mechanisms. All three can be used to access the REST API.

### Admin JWT

Obtained by calling `POST /_/api/auth/login` with admin credentials. Sent as:

```
Authorization: Bearer <admin-jwt>
```

Admin tokens bypass all access rules. They expire after **24 hours**. The signing secret is read from the `JWT_SECRET` environment variable (required).

### User JWT (Auth Collections)

Obtained by calling `POST /api/collections/:name/auth/login`. Sent as:

```
Authorization: Bearer <user-access-token>
```

- **Access token**: JWT, 15-minute expiry
- **Refresh token**: 7-day expiry, supports rotation. Tokens are 64-character random strings (nanoid), SHA-256 hashed before storage. Old refresh tokens are revoked on rotation.

User tokens are subject to collection access rules. The access token payload includes `userId`, `collectionId`, and `collectionName`.

Verification and password reset tokens also use 64-character nanoid strings, SHA-256 hashed before storage, with 1-hour expiry. They are single-use (marked used after consumption).

### API Keys

API keys grant **admin-level access** and are designed for programmatic/agent use. Format: `bb_<32-char-nanoid>`.

Sent as:

```
X-API-Key: bb_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

API keys are hashed with argon2id and stored in the `_api_keys` table. The raw key is only returned once at creation time. Manage keys via the CLI `apikeys` command or the admin API.

### Token Precedence

When authenticating a request, BunBase checks in order:

1. `X-API-Key` header (if present, verified against API key store, grants admin access)
2. `Authorization: Bearer` header with admin JWT
3. `Authorization: Bearer` header with user JWT

For file downloads where headers cannot be set, a `?token=<jwt>` query parameter is also accepted.

---

## CLI Reference

```
bunbase <command> [options]
```

If no command is given, defaults to `serve`.

### Global Options

| Flag | Type | Default | Description |
|---|---|---|---|
| `--db <path>` | string | `BUNBASE_DB` env or `bunbase.db` | SQLite database file path |
| `--format <fmt>` | string | `json` | Output format: `json` or `table` |
| `--quiet` | boolean | `false` | Suppress non-essential output |
| `-h, --help` | boolean | | Show help |

### serve

Start the HTTP server. This is the default command.

```sh
bunbase serve [options]
bunbase [options]           # equivalent
```

| Flag | Type | Default | Description |
|---|---|---|---|
| `-p, --port <port>` | number | `8090` | Port to listen on (1-65535) |
| `--db <path>` | string | `bunbase.db` | Database file path |
| `--smtp-host <host>` | string | `SMTP_HOST` env | SMTP server hostname |
| `--smtp-port <port>` | number | `SMTP_PORT` env or `587` | SMTP server port |
| `--smtp-user <user>` | string | `SMTP_USER` env | SMTP username |
| `--smtp-pass <pass>` | string | `SMTP_PASS` env | SMTP password |
| `--smtp-from <addr>` | string | `SMTP_FROM` env or smtp-user | Default sender address |

CLI flags take precedence over environment variables for SMTP.

### collections

Manage collections (schema, fields, rules).

#### list

```sh
bunbase collections list
```

Returns array of `{ name, type, fields, created_at, updated_at }`.

#### create

```sh
echo '{"name":"posts","type":"base","fields":[{"name":"title","type":"text","required":true},{"name":"body","type":"text","required":false}]}' | bunbase collections create --stdin
```

Required stdin JSON fields: `name`, `fields`. Optional: `type` (`base` | `auth`), `rules`.

For auth collections, set `"type":"auth"`. The fields `email`, `password_hash`, `verified` are added automatically. Do not include them in `fields`.

#### delete

```sh
bunbase collections delete <name> --confirm
```

`--confirm` is required. Deletes the collection, all its records, and field metadata.

#### fields

```sh
# List fields
bunbase collections fields <name>

# Add field
echo '{"name":"score","type":"number","required":false,"options":{"min":0,"max":100}}' | bunbase collections fields <name> --add --stdin

# Update field
echo '{"name":"new_name","type":"text"}' | bunbase collections fields <name> --update <fieldName> --stdin

# Remove field
bunbase collections fields <name> --remove <fieldName>
```

#### rules

```sh
# Get current rules
bunbase collections rules <name>

# Set rules
echo '{"listRule":"","viewRule":"","createRule":"@request.auth.id != \"\"","updateRule":"id = @request.auth.id","deleteRule":null}' | bunbase collections rules <name> --stdin
```

### records

Manage records within collections.

#### list

```sh
bunbase records list <collection> [options]
```

| Flag | Type | Description |
|---|---|---|
| `--filter <expr>` | string | Filter expression (e.g. `status='active'`) |
| `--sort <fields>` | string | Sort fields (e.g. `-created_at,title`) |
| `--page <n>` | number | Page number (default: 1) |
| `--per-page <n>` | number | Items per page (default: 30) |
| `--expand <fields>` | string | Comma-separated relation fields to expand |
| `--search <term>` | string | Full-text search across text fields |

Returns `{ page, perPage, totalItems, totalPages, items }`.

CLI record operations bypass access rules (admin-level).

#### create

```sh
# From JSON stdin (single record)
echo '{"title":"Hello","published":true}' | bunbase records create posts --stdin

# From JSON stdin (batch array, executed in a transaction)
echo '[{"title":"A"},{"title":"B"}]' | bunbase records create posts --stdin

# From inline key-value pairs
bunbase records create posts --set title="Hello" --set published=true
```

`--set` values are parsed as JSON first (for numbers/booleans/null), falling back to string.

#### get

```sh
bunbase records get <collection> <id> [--expand <fields>]
```

Returns the record object, or exits with error code 1 if not found.

#### update

```sh
# From JSON stdin (partial update)
echo '{"title":"Updated"}' | bunbase records update posts <id> --stdin

# From inline key-value pairs
bunbase records update posts <id> --set title="Updated"
```

#### delete

```sh
bunbase records delete <collection> <id> --confirm
```

`--confirm` is required.

### admin

Manage admin accounts.

#### create

```sh
bunbase admin create --email admin@example.com --password secret123
```

#### reset-password

```sh
bunbase admin reset-password --email admin@bunbase.local --password newsecret
```

### apikeys

Manage API keys for programmatic access.

#### create

```sh
bunbase apikeys create --name "my-agent"
```

Returns `{ id, name, key, key_prefix, created_at, last_used_at }`. The `key` field contains the raw API key (`bb_...`) and is **only returned once**. Store it securely.

#### list

```sh
bunbase apikeys list
```

Returns array of `{ id, name, key_prefix, created_at, last_used_at }`. The full key is never returned after creation.

#### revoke

```sh
bunbase apikeys revoke <id> --confirm
```

`--confirm` is required. Permanently deletes the API key.

### CLI Output Format

- **stdout**: all data output (JSON or table format)
- **stderr**: all errors, formatted as JSON: `{"error":"<CODE>","message":"<description>"}`
- **Exit codes**: `0` = success, `1` = runtime error, `2` = validation/usage error

Error codes used: `UNKNOWN_COMMAND`, `MISSING_SUBCOMMAND`, `UNKNOWN_SUBCOMMAND`, `VALIDATION_ERROR`, `NOT_FOUND`, `CONFIRMATION_REQUIRED`, `COLLECTION_ERROR`, `RECORD_ERROR`, `ADMIN_ERROR`, `FATAL`.

---

## REST API Reference

All public data APIs are under `/api/`. Admin management APIs are under `/_/api/`. All responses use `Content-Type: application/json`.

### Records API

#### List records

```
GET /api/collections/:name/records
```

Respects the collection's `listRule`. Returns a paginated response.

**Query parameters:**

| Parameter | Description | Default |
|---|---|---|
| `page` | Page number (1-based, min 1) | `1` |
| `perPage` | Items per page (min 1, max 500) | `30` |
| `sort` | Comma-separated fields. Prefix `-` for desc, `+` or none for asc | - |
| `expand` | Comma-separated relation field names to inline | - |
| `filter` | Filter expression with `&&`, `\|\|`, grouping (see [Filter Expressions](#filter-expressions)) | - |
| `search` | Cross-field text search term | - |
| `<field>=value` | Equality filter | - |
| `<field>!=value` | Not-equal filter | - |
| `<field>~=value` | LIKE (contains) filter | - |
| `<field>!~=value` | NOT LIKE filter | - |
| `<field>>=value` | Greater-or-equal filter | - |
| `<field><=value` | Less-or-equal filter | - |
| `<field>>value` | Greater-than filter | - |
| `<field><value` | Less-than filter | - |

Multiple URL parameter filters are combined with AND. The `filter` expression parameter is also ANDed with URL parameter filters.

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

#### Get single record

```
GET /api/collections/:name/records/:id
```

Respects `viewRule`. Returns the record or `404`.

Supports `?expand=field1,field2` to inline related records.

File fields are returned as full URLs.

#### Create record

```
POST /api/collections/:name/records
Content-Type: application/json
```

Respects `createRule`. Triggers `beforeCreate` / `afterCreate` hooks. Returns `201` with the created record.

For file uploads, use `Content-Type: multipart/form-data` instead.

#### Update record

```
PATCH /api/collections/:name/records/:id
Content-Type: application/json
```

Partial update (only send fields to change). Respects `updateRule`. Triggers `beforeUpdate` / `afterUpdate` hooks. Returns the full updated record.

For file updates, use `Content-Type: multipart/form-data`.

#### Delete record

```
DELETE /api/collections/:name/records/:id
```

Respects `deleteRule`. Triggers `beforeDelete` / `afterDelete` hooks. Deletes associated files from storage. Returns `204 No Content`.

### File Serving API

```
GET /api/files/:collection/:recordId/:filename
```

Serves a stored file. Enforces `viewRule`. Content-Type is set from file extension.

Supports authentication via query parameter for direct browser access:

```
GET /api/files/posts/abc123/photo.jpg?token=<jwt>
```

Also supports `X-API-Key` header for programmatic access.

### Realtime API (SSE)

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
Authorization: Bearer <token>   (optional, for access rule enforcement)
```

```json
{
  "clientId": "<clientId from PB_CONNECT>",
  "subscriptions": ["posts/*", "posts/abc123"]
}
```

Subscription topics:
- `collectionName/*` - all events in a collection (uses `listRule`)
- `collectionName/recordId` - events for a specific record (uses `viewRule`)

Send `"subscriptions": []` to unsubscribe from everything.

**Response:** `204 No Content`

#### Realtime events

```
id: <event-id>
event: posts
data: {"action":"create","record":{...}}
```

Actions: `create`, `update`, `delete`.

### User Auth API

Auth collections (type `auth`) expose endpoints under `/api/collections/:name/auth/`.

#### Sign up

```
POST /api/collections/:name/auth/signup
Content-Type: application/json

{"email":"user@example.com","password":"secure123"}
```

**Response (201):**

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

Password validation enforces:
- Minimum length: `minPasswordLength` (default: 8)
- Must contain at least one letter (a-z or A-Z)
- Must contain at least one number (0-9)

Passwords are hashed with argon2id (`memoryCost: 65536`, `timeCost: 2`).

#### Log in

```
POST /api/collections/:name/auth/login
Content-Type: application/json

{"email":"user@example.com","password":"secure123"}
```

**Response:**

```json
{
  "token": "<access-token>",
  "refreshToken": "<refresh-token>",
  "user": {"id":"...","email":"...","verified":true}
}
```

Returns `401` on failure with a generic message (prevents user enumeration). Uses timing-safe comparison.

If the collection has `requireEmailVerification: true`, unverified users receive a `403` error.

#### Refresh tokens

```
POST /api/collections/:name/auth/refresh
Content-Type: application/json

{"refreshToken":"<refresh-token>"}
```

Implements token rotation: the old refresh token is revoked, a new token pair is issued.

**Response:**

```json
{
  "token": "<new-access-token>",
  "refreshToken": "<new-refresh-token>"
}
```

#### Request email verification

```
POST /api/collections/:name/auth/request-verification
Authorization: Bearer <access-token>
```

Sends a verification email. Requires SMTP. Returns `400` if already verified.

#### Confirm email verification

```
POST /api/collections/:name/auth/confirm-verification
Content-Type: application/json

{"token":"<verification-token>"}
```

Also supports `GET ...?token=<token>` which returns an HTML page.

#### Request password reset

```
POST /api/collections/:name/auth/request-reset
Content-Type: application/json

{"email":"user@example.com"}
```

Always returns `{"message":"If an account exists, a reset email has been sent"}` (prevents enumeration).

#### Confirm password reset

```
POST /api/collections/:name/auth/confirm-reset
Content-Type: application/json

{"token":"<reset-token>","newPassword":"newSecure456"}
```

Revokes all existing refresh tokens (forces re-login on all devices). Also supports `GET ...?token=<token>` which returns an HTML form.

### Admin Management API

All `/_/api/` endpoints require admin authentication (admin JWT or API key).

#### Admin auth

| Method | Path | Body | Description |
|---|---|---|---|
| `POST` | `/_/api/auth/login` | `{email, password}` | Returns `{token, admin}` |
| `GET` | `/_/api/auth/me` | - | Returns current admin info |
| `POST` | `/_/api/auth/password` | `{newPassword}` | Change admin password |

#### Collection management

| Method | Path | Body | Description |
|---|---|---|---|
| `GET` | `/_/api/collections` | - | List all collections (with `fieldCount`, `recordCount`) |
| `POST` | `/_/api/collections` | `{name, type?, fields?, rules?}` | Create collection |
| `PATCH` | `/_/api/collections/:name` | `{newName}` | Rename collection |
| `DELETE` | `/_/api/collections/:name` | - | Delete collection and all records |

**Create collection body:**

```json
{
  "name": "posts",
  "type": "base",
  "fields": [
    {"name":"title","type":"text","required":true},
    {"name":"content","type":"text","required":false}
  ],
  "rules": {
    "listRule": "",
    "viewRule": "",
    "createRule": "@request.auth.id != \"\"",
    "updateRule": null,
    "deleteRule": null
  }
}
```

#### Field management

| Method | Path | Body | Description |
|---|---|---|---|
| `GET` | `/_/api/collections/:name/fields` | - | List all fields |
| `POST` | `/_/api/collections/:name/fields` | `{name, type, required?, options?}` | Add field |
| `PATCH` | `/_/api/collections/:name/fields/:fieldName` | `{name?, type?, required?, options?}` | Update field |
| `DELETE` | `/_/api/collections/:name/fields/:fieldName` | - | Remove field |

#### Rules management

| Method | Path | Body | Description |
|---|---|---|---|
| `GET` | `/_/api/collections/:name/rules` | - | Get current rules |
| `PATCH` | `/_/api/collections/:name/rules` | `{listRule, viewRule, ...}` | Update rules |

#### Auth user management

| Method | Path | Body | Description |
|---|---|---|---|
| `POST` | `/_/api/collections/:name/auth/send-verification` | `{userId}` | Send verification email to user (requires SMTP) |
| `POST` | `/_/api/collections/:name/auth/set-verified` | `{userId, verified}` | Directly set a user's verified status (no email required) |
| `PATCH` | `/_/api/collections/:name/auth/users/:id` | `{email?, ...customFields}` | Edit auth user's email and/or custom fields |

### Error Responses

All API errors return JSON with a consistent format:

```json
{"error":"<message>"}
```

HTTP status code mapping:

| Status | Condition |
|---|---|
| `400` | Validation failed, invalid filter/sort field, hook cancellation, general app error |
| `401` | Missing or invalid authentication |
| `403` | Email verification required |
| `404` | Record, collection, or file not found |
| `409` | Name conflict (collection/field already exists) |

---

## Collections

### Collection Types

| Type | Description |
|---|---|
| `base` | General purpose data collection |
| `auth` | User authentication collection. Automatically adds `email` (TEXT UNIQUE NOT NULL), `password_hash` (TEXT NOT NULL), `verified` (INTEGER DEFAULT 0) columns |

Collection names must match `^[a-zA-Z][a-zA-Z0-9_]*$` (start with letter, alphanumeric + underscore only).

### Field Types

| Type | SQLite Column | API Input/Output | Notes |
|---|---|---|---|
| `text` | `TEXT` | string | Optional `maxLength` |
| `number` | `REAL` | number | Optional `min`, `max` |
| `boolean` | `INTEGER` | true/false | Stored as `0`/`1`, returned as `true`/`false` |
| `datetime` | `TEXT` | string | ISO 8601 (with or without timezone offset) |
| `json` | `TEXT` | any JSON value | Stringified on write, parsed on read |
| `relation` | `TEXT` | string (record ID) | Requires `options.collection`. Validated: target collection and record must exist |
| `file` | `TEXT` | string or string[] | Filename(s). Served via `/api/files/...`. Options: `maxFiles`, `maxSize`, `allowedTypes` |

### Field Options

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

| Option | Applies to | Type | Default | Description |
|---|---|---|---|---|
| `collection` | relation | string | - | Target collection name (required) |
| `target` | relation | string | - | Alias for `collection` |
| `maxLength` | text | number | - | Maximum string length |
| `min` | number | number | - | Minimum numeric value |
| `max` | number | number | - | Maximum numeric value |
| `maxFiles` | file | number | `1` | Maximum files per field |
| `maxSize` | file | number | `10485760` (10 MB) | Maximum file size in bytes |
| `allowedTypes` | file | string[] | any | Allowed MIME types (supports wildcards: `image/*`) |

Field names must match `^[a-zA-Z][a-zA-Z0-9_]*$`.

### System Fields

Every record automatically has:

| Field | Type | Description |
|---|---|---|
| `id` | string | nanoid (21 characters), unique record identifier |
| `created_at` | string | ISO 8601 creation timestamp |
| `updated_at` | string | ISO 8601 last-update timestamp |

Auth collections additionally have:

| Field | Type | Description |
|---|---|---|
| `email` | string | User email (unique within collection) |
| `verified` | boolean | Email verification status |
| `password_hash` | string | Never returned in API responses |

### Auth Collection Options

Set via the collection's `options` JSON:

```json
{
  "minPasswordLength": 8,
  "requireEmailVerification": false
}
```

| Option | Type | Default | Description |
|---|---|---|---|
| `minPasswordLength` | number | `8` | Minimum password length for signup |
| `requireEmailVerification` | boolean | `false` | If `true`, unverified users cannot log in (403) |

Regardless of `minPasswordLength`, all passwords must contain at least one letter and one number.

---

## Access Rules

Every collection has five access rules. Rules are enforced at the HTTP API level. Admin tokens and API keys bypass all rules. CLI commands bypass all rules.

### Rule Values

| Value | Meaning |
|---|---|
| `null` | Locked: admin-only access |
| `""` (empty string) | Public: anyone can access |
| `"expression"` | Evaluated per-request against auth context and record |

When no rules are set on a collection (`rules` is `null`), all operations default to admin-only.

### Rule Expressions

Expressions support:
- Comparison operators: `=`, `!=`, `>`, `<`, `>=`, `<=`
- Logical operators: `&&` (AND), `||` (OR)
- String literals: single or double quotes (`'value'` or `"value"`)
- Number literals: `42`, `3.14`
- Boolean literals: `true`, `false`

Expressions that fail to parse are denied (fail closed).

### Available References

| Reference | Description | Available in |
|---|---|---|
| `@request.auth.id` | Authenticated user's record ID | all rules |
| `@request.auth.email` | Authenticated user's email | all rules |
| `@request.auth.verified` | Whether user's email is verified | all rules |
| `@request.auth.collectionId` | ID of user's auth collection | all rules |
| `@request.auth.collectionName` | Name of user's auth collection | all rules |
| `@request.body.<field>` | Value from request body | create, update rules |
| `id` | Record's ID field | view, update, delete rules |
| `<fieldName>` | Any record field value | view, update, delete rules |

When `@request.auth.*` is referenced but no user is authenticated, the value resolves to empty string `""`.

### Rule Examples

```json
{
  "listRule": "",
  "viewRule": "",
  "createRule": "@request.auth.id != ''",
  "updateRule": "id = @request.auth.id",
  "deleteRule": null
}
```

| Rule | Meaning |
|---|---|
| `""` | Public access |
| `null` | Admin only |
| `@request.auth.id != ''` | Any logged-in user |
| `@request.auth.id != ""` | Same (double quotes also work) |
| `id = @request.auth.id` | Owner only (record ID matches user ID) |
| `@request.auth.verified = true` | Verified users only |
| `@request.auth.collectionName = 'users'` | Only users from the "users" collection |
| `user_id = @request.auth.id` | Records where `user_id` field matches logged-in user |
| `status = 'published' \|\| @request.auth.id != ''` | Public if published, or any logged-in user |

For **list** operations, rule expressions are converted to SQL WHERE clauses for row-level filtering. For **view/update/delete**, rules are evaluated in-memory against the specific record.

---

## Query and Filtering

### URL Parameter Filters

Applied as query parameters on the list endpoint. Multiple filters are ANDed together.

| Syntax | Operator | SQL | Example |
|---|---|---|---|
| `field=value` | equals | `field = ?` | `?status=published` |
| `field!=value` | not equals | `field != ?` | `?status!=draft` |
| `field~=value` | contains (LIKE) | `field LIKE '%value%'` | `?title~=bun` |
| `field!~=value` | not contains | `field NOT LIKE '%value%'` | `?title!~=test` |
| `field>=value` | greater or equal | `field >= ?` | `?age>=18` |
| `field<=value` | less or equal | `field <= ?` | `?price<=100` |
| `field>value` | greater than | `field > ?` | `?score>50` |
| `field<value` | less than | `field < ?` | `?score<100` |

Field names are validated against the collection schema. Invalid fields return a `400` error.

Boolean fields accept `true`/`false`/`1`/`0` as string values and are automatically coerced.

LIKE values have `%`, `_`, and `\` characters escaped to prevent pattern injection.

### Filter Expressions

The `filter` query parameter supports complex expressions with AND, OR, grouping, and multiple value types.

```
GET /api/collections/posts/records?filter=status='active'||status='draft'
```

**Syntax:**

```
condition:  field operator value
and:        expr1 && expr2
or:         expr1 || expr2
grouping:   (expr1 || expr2) && expr3
```

**Operators:** `=`, `!=`, `>`, `<`, `>=`, `<=`, `~` (LIKE), `!~` (NOT LIKE)

**Value types:**
- Single-quoted strings: `'hello'`
- Double-quoted strings: `"hello"`
- Numbers: `42`, `3.14`, `-1`
- Booleans: `true`, `false`
- Null: `null`

**Escape sequences:** `\'` inside single-quoted strings, `\"` inside double-quoted strings.

**Examples:**

```
# OR: multiple status values
filter=status='active'||status='pending'

# AND: combined conditions
filter=status='active'&&priority>=3

# Grouped: complex logic
filter=(status='active'||status='pending')&&assigned_to='user1'

# LIKE search
filter=title~'hello'

# NOT LIKE
filter=title!~'draft'

# Numeric comparison
filter=price>=10&&price<=100

# Boolean field
filter=published=true

# Null comparison
filter=deleted_at=null
```

The `filter` parameter is ANDed with any URL parameter filters also present.

### Cross-Field Search

```
GET /api/collections/posts/records?search=hello
```

Searches across the `id` field and all `text` and `datetime` fields using `LIKE '%term%'` with OR logic. The search clause is ANDed with any other active filters.

Available via CLI: `bunbase records list posts --search hello`

### Sorting

```
GET /api/collections/posts/records?sort=-created_at,title
```

- Prefix `-` for descending
- Prefix `+` or no prefix for ascending
- Comma-separate multiple fields
- Field names are validated against schema

CLI: `bunbase records list posts --sort -created_at,title`

### Pagination

```
GET /api/collections/posts/records?page=2&perPage=20
```

- `page`: 1-based, defaults to 1, minimum 1
- `perPage`: defaults to 30, minimum 1, maximum 500
- Non-numeric values silently fall back to defaults
- Out-of-range values are clamped

CLI: `bunbase records list posts --page 2 --per-page 20`

### Relation Expansion

```
GET /api/collections/posts/records?expand=author,category
```

For each record, fetches the related record and adds it to an `expand` object:

```json
{
  "id": "abc123",
  "title": "Hello",
  "author": "user456",
  "expand": {
    "author": {
      "id": "user456",
      "email": "user@example.com",
      "verified": true
    }
  }
}
```

Expansion behavior:
- Only `relation` type fields can be expanded
- Null/undefined relation values are skipped
- Missing target collections or records are skipped gracefully (no error)
- Target collection `viewRule` is enforced: inaccessible related records are omitted
- JSON and boolean fields on expanded records are parsed correctly
- Nested expansion (chaining) is not supported

CLI: `bunbase records list posts --expand author`

---

## File Uploads

Use `multipart/form-data` for creating or updating records with file fields.

```sh
# Create with file
curl -X POST http://localhost:8090/api/collections/posts/records \
  -H "Authorization: Bearer <token>" \
  -F "title=My Post" \
  -F "cover=@/path/to/image.jpg"

# Update with new files (multi-file field)
curl -X PATCH http://localhost:8090/api/collections/posts/records/abc123 \
  -H "Authorization: Bearer <token>" \
  -F "gallery=@/path/to/photo1.jpg" \
  -F "gallery=@/path/to/photo2.jpg"
```

Storage path: `<BUNBASE_STORAGE_DIR>/<collection>/<recordId>/<filename>` (default: `./data/storage/...`)

File fields in API responses include full URLs:

```json
{
  "id": "abc123",
  "cover": "http://localhost:8090/api/files/posts/abc123/cover.jpg"
}
```

Multi-file fields (`maxFiles > 1`) return arrays of URLs.

When a record is deleted, all associated files are automatically cleaned up via a lifecycle hook.

File validation runs before record creation. Errors include field name, file name, and message.

### Filename Sanitization

Uploaded filenames are sanitized before storage:
- Path components stripped (prevents directory traversal)
- Dangerous characters replaced with `_` (only `a-zA-Z0-9_-` kept)
- Multiple underscores collapsed, leading/trailing underscores trimmed
- Base name truncated to 100 characters
- Extension lowercased
- 10-character random nanoid suffix appended: `originalname_aBcDeFgHiJ.jpg`

### Multi-File Field Updates

For multi-file fields (`maxFiles > 1`), when updating a record you can pass existing filenames to retain alongside new uploads using the `<fieldName>_existing` key:

```json
{
  "gallery_existing": ["photo1_abc123.jpg", "photo2_def456.jpg"]
}
```

Filenames not included in `_existing` are removed. New uploaded files are appended.

---

## Lifecycle Hooks

Hooks fire synchronously (awaited) around record mutations via the HTTP API.

### Hook Events

| Event | Fires | Can cancel? | Context properties |
|---|---|---|---|
| `beforeCreate` | Before INSERT | Yes (throw) | `collection`, `data` (mutable), `request` |
| `afterCreate` | After INSERT | No (errors logged) | `collection`, `record`, `request` |
| `beforeUpdate` | Before UPDATE | Yes (throw) | `collection`, `id`, `data` (mutable), `existing`, `request` |
| `afterUpdate` | After UPDATE | No (errors logged) | `collection`, `record`, `request` |
| `beforeDelete` | Before DELETE | Yes (throw) | `collection`, `id`, `existing`, `request` |
| `afterDelete` | After DELETE | No (errors logged) | `collection`, `id`, `request` |

The `request` property contains `{ method, path, headers }` when triggered via HTTP, or `undefined` for CLI/internal operations.

### Registering Hooks

In a custom route file:

```ts
import type { RouteContext } from '../src/api/context';

export const GET = async (req: Request, ctx: RouteContext): Promise<Response> => {
  // Collection-specific hook
  ctx.hooks.on('beforeCreate', 'posts', async (hookCtx, next) => {
    hookCtx.data.slug = hookCtx.data.title?.toString().toLowerCase().replace(/\s+/g, '-');
    await next();
  });

  // Global hook (all collections)
  ctx.hooks.on('afterCreate', async (hookCtx, next) => {
    console.log(`Created in ${hookCtx.collection}:`, hookCtx.record.id);
    await next();
  });

  return Response.json({ ok: true });
};
```

Handlers execute in registration order. If a handler does not call `next()`, the chain stops silently. If a `before*` handler throws, the operation is cancelled and the error returns as HTTP `400`.

---

## Realtime / SSE

Events are pushed after every create, update, or delete via the HTTP API. Built-in hooks automatically broadcast to matching subscribers.

### Client Example

```js
const eventSource = new EventSource('http://localhost:8090/api/realtime');
let clientId;

eventSource.addEventListener('PB_CONNECT', (e) => {
  clientId = JSON.parse(e.data).clientId;

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

eventSource.addEventListener('posts', (e) => {
  const { action, record } = JSON.parse(e.data);
  console.log(action, record);
});
```

### Connection Lifecycle

1. Client opens `GET /api/realtime` (SSE connection)
2. Server sends `PB_CONNECT` with `clientId`
3. Client sends `POST /api/realtime` with `clientId` and `subscriptions` array
4. Server sends events as data changes
5. Keep-alive pings every 30 seconds
6. Inactive connections cleaned up after 5 minutes

---

## Custom Routes

File-based routing in the `routes/` directory.

### File Naming

| File path | API route |
|---|---|
| `routes/health.ts` | `/api/health` |
| `routes/stats.ts` | `/api/stats` |
| `routes/users/index.ts` | `/api/users` |
| `routes/users/[id].ts` | `/api/users/:id` |
| `routes/users/[id]/posts.ts` | `/api/users/:id/posts` |

### Route File Format

Export named functions for each HTTP method:

```ts
import type { RouteContext } from '../src/api/context';

export const GET = async (req: Request, ctx: RouteContext): Promise<Response> => {
  return Response.json({ status: 'ok' });
};

export const POST = async (req: Request, ctx: RouteContext): Promise<Response> => {
  const body = await req.json();
  const record = await ctx.records.create('posts', body);
  return Response.json(record, { status: 201 });
};
```

Supported methods: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`.

### RouteContext API

| Property | Type | Description |
|---|---|---|
| `ctx.db` | `Database` | Direct SQLite access (`bun:sqlite`) |
| `ctx.records.get(col, id)` | sync | Fetch one record |
| `ctx.records.list(col, options?)` | sync | List records with filter/sort/page |
| `ctx.records.create(col, data)` | async | Create (fires hooks) |
| `ctx.records.update(col, id, data)` | async | Update (fires hooks) |
| `ctx.records.delete(col, id)` | async | Delete (fires hooks) |
| `ctx.auth.buildContext(req)` | async | Returns `{isAdmin, user}` |
| `ctx.auth.optionalUser(req)` | async | Returns user or `null` |
| `ctx.auth.requireAdmin(req)` | async | Throws if not admin |
| `ctx.realtime` | `RealtimeManager` | Send custom SSE events |
| `ctx.files.save(col, id, file)` | async | Save file, returns filename |
| `ctx.files.getPath(col, id, name)` | sync | Full filesystem path |
| `ctx.files.exists(col, id, name)` | async | Check existence |
| `ctx.files.delete(col, id, name)` | async | Delete a file |
| `ctx.hooks` | `HookManager` | Register lifecycle hooks |
| `ctx.params` | `Record<string,string>` | URL path parameters |

### Build Routes

```sh
bun run build:routes   # Scan routes/ and regenerate src/routes-generated.ts
bun run dev            # Rebuilds routes + admin, then starts with --watch
```

---

## Email / SMTP

Email is optional. Required for email verification and password reset flows.

### Configuration

Via CLI:

```sh
bunbase serve --smtp-host smtp.gmail.com --smtp-port 587 \
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

CLI flags take precedence. Required fields: `host`, `user`, `pass`. Port defaults to `587`. From defaults to `user`.

Port `465` enables implicit TLS; other ports use STARTTLS.

When SMTP is not configured, verification and reset endpoints return errors. All other auth flows work without email.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `JWT_SECRET` | **(required)** | Secret key for signing all JWT tokens (admin and user). Must be set before starting the server |
| `BUNBASE_DB` | `bunbase.db` | Database file path (CLI `--db` overrides) |
| `BUNBASE_ADMIN_PASSWORD` | (random, printed) | Initial admin password on first start |
| `BUNBASE_STORAGE_DIR` | `./data/storage` | File storage root directory |
| `BUNBASE_DEV` | `false` | Enable dev mode features |
| `NODE_ENV` | - | Set to `development` to enable dev mode |
| `SMTP_HOST` | - | SMTP server hostname |
| `SMTP_PORT` | `587` | SMTP server port |
| `SMTP_USER` | - | SMTP username |
| `SMTP_PASS` | - | SMTP password |
| `SMTP_FROM` | `SMTP_USER` | Default from address |

---

## Building from Source

```sh
bun run build:admin    # Build admin UI (React -> dist/admin/)
bun run build:routes   # Scan routes/ and generate src/routes-generated.ts
bun run build          # All of the above + compile to single binary
```

Output: `./bunbase` (self-contained, embeds admin UI + Bun runtime).

Other scripts:

| Script | Description |
|---|---|
| `bun run dev` | Build routes + admin, start with `--watch` |
| `bun run typecheck` | TypeScript type checking |
| `bun test` | Run all tests |
| `bun run test:routes` | Run route tests only |
| `bun run test:binary` | Run binary tests only |

---

## Database Internals

Single SQLite file. WAL mode. Pragmas applied at startup:

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA cache_size = -64000;   -- 64 MB
```

### System Tables

| Table | Purpose |
|---|---|
| `_collections` | Collection definitions (id, name, type, options, rules, timestamps) |
| `_fields` | Field definitions per collection (id, collection_id, name, type, required, options) |
| `_admins` | Admin accounts (email + argon2id hash) |
| `_refresh_tokens` | User refresh token store (user_id, collection_id, token_id, expires_at, revoked) |
| `_verification_tokens` | Email verification and password reset tokens (SHA-256 hashed, user_id, type, expires_at, used) |
| `_api_keys` | API keys (name, key_prefix for index lookup, key_hash argon2id, last_used_at) |

User data lives in tables named after collections (e.g., `posts`, `users`).

### Schema Migrations

Migrations run automatically on startup. They handle:
- Adding new system columns to `_collections`
- Creating `_api_keys` table for existing databases
- Updating `_fields` CHECK constraint to include `file` type

Field type or `required` changes use shadow-table migration (data is preserved). Column renames use `ALTER TABLE RENAME COLUMN`.

### Validation

Records are validated using Zod schemas dynamically built from field definitions. Validation errors are returned as comma-separated messages. Relation fields are validated to ensure the target collection and record exist.
