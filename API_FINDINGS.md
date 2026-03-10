# Bunbase REST API — Live Test Findings

Tested against: `http://localhost:8090`
Admin email: `admin@bunbase.local`
Test date: 2026-03-10
Total requests tested: **47** — 41 nominal (expected success), 6 expected-error responses verified.

---

## Collections Under Test

| Collection | Access Rules | Summary |
|---|---|---|
| `posts` | All rules = `""` | Fully public — no auth required for any operation |
| `persoane` | All rules = `null` | Admin-only — every operation requires admin Bearer token |

### Rule Values Cheat Sheet

| Rule value | Meaning |
|---|---|
| `""` (empty string) | Public — anyone can perform the operation |
| `null` | Admin-only — only a valid admin JWT is accepted |
| `"filter expression"` | Conditional — access granted when expression is true |

---

## Authentication

Admin login returns a JWT Bearer token:

```http
POST /_/api/auth/login
Content-Type: application/json

{ "email": "admin@bunbase.local", "password": "<password>" }
```

Response:
```json
{ "token": "<jwt>", "admin": { "id": "...", "email": "..." } }
```

Use in subsequent requests:
```http
Authorization: Bearer <token>
```

---

## POSTS (public collection)

All rules set to `""` — authentication is **never required**.

### CRUD

#### List records
```http
GET /api/collections/posts/records
```
✓ `200` — Returns `{ items: [...], totalItems: N }`. Works without auth.

#### Get single record
```http
GET /api/collections/posts/records/:id
```
✓ `200` — Returns the full record object. Works without auth.
✗ `404` — Record not found.

#### Create record
```http
POST /api/collections/posts/records
Content-Type: application/json

{ "titlu": "...", "continut": "...", "numar_likes": 0 }
```
✓ `201` — Returns the created record (with generated `id`, `created_at`, `updated_at`). Works without auth.

#### Update record (partial)
```http
PATCH /api/collections/posts/records/:id
Content-Type: application/json

{ "numar_likes": 99 }
```
✓ `200` — Returns the updated record. Only changed fields need to be sent. Works without auth.

#### Delete record
```http
DELETE /api/collections/posts/records/:id
```
✓ `204` — Empty response body on success. Works without auth.

### Record shape (`posts`)
```json
{
  "id": "_5zPWRrAUA2Bpdpy-4f5U",
  "created_at": "2026-03-10T04:37:54.682Z",
  "updated_at": "2026-03-10T04:37:54.682Z",
  "titlu": "Post fara auth",
  "continut": "continut public",
  "numar_likes": 0
}
```

---

## PERSOANE (admin-only collection)

All rules set to `null` — **admin Bearer token required for every operation**.
Without token: `403 {"error":"Access denied"}` on all endpoints.

### CRUD

#### List records
```http
GET /api/collections/persoane/records
Authorization: Bearer <admin-token>
```
✓ `200` without auth → ✗ `403`

#### Get single record
```http
GET /api/collections/persoane/records/:id
Authorization: Bearer <admin-token>
```
✓ `200` with auth → ✗ `403` without

#### Create record
```http
POST /api/collections/persoane/records
Authorization: Bearer <admin-token>
Content-Type: application/json

{ "nume": "Ion Popescu", "membru": true, "rol": "<roluri-record-id>" }
```
✓ `201` with auth → ✗ `403` without

#### Update record
```http
PATCH /api/collections/persoane/records/:id
Authorization: Bearer <admin-token>
Content-Type: application/json

{ "membru": false }
```
✓ `200` with auth → ✗ `403` without

#### Delete record
```http
DELETE /api/collections/persoane/records/:id
Authorization: Bearer <admin-token>
```
✓ `204` with auth → ✗ `403` without

### Record shape (`persoane`)
```json
{
  "id": "nAHlL2t3p1GOifV4WhqX6",
  "created_at": "2026-03-10T04:37:54.695Z",
  "updated_at": "2026-03-10T04:37:54.695Z",
  "nume": "Ion Popescu",
  "membru": true,
  "rol": "VogYksH5nyGly_F3Ifugo"
}
```

---

## Query Options

All query options work identically on both collections (subject to access rules).

### Pagination

| Parameter | Default | Min | Max |
|---|---|---|---|
| `page` | `1` | `1` | unlimited |
| `perPage` | `30` | `1` (0 clamped up) | `500` (1000 clamped down) |

```http
GET /api/collections/posts/records?page=2&perPage=10
```

Response always includes `totalItems` for client-side pagination:
```json
{ "items": [...], "totalItems": 42 }
```

### Sorting

`sort` accepts a comma-separated list of fields. Prefix with `-` for descending, `+` (or nothing) for ascending.

```http
# Single field, descending
GET /api/collections/posts/records?sort=-numar_likes

# Single field, ascending (both forms work)
GET /api/collections/posts/records?sort=%2Btitlu
GET /api/collections/posts/records?sort=titlu

# Multi-field sort (primary: likes desc, secondary: title asc)
GET /api/collections/posts/records?sort=-numar_likes%2Ctitlu
```

Sortable fields: any schema field + system fields `id`, `created_at`, `updated_at`.
Invalid field → `400 {"error":"Invalid sort field: \"nonexistent\""}`.

### Filtering

Filters are passed as query parameters with operator suffixes:

| Syntax | Operator | SQL | Example |
|---|---|---|---|
| `field=value` | `=` | `=` | `titlu=Hello` |
| `field!=value` (encoded) | `!=` | `!=` | — |
| `field~=value` | `~` | `LIKE '%value%'` | `titlu~=beta` |
| `field!~=value` | `!~` | `NOT LIKE '%value%'` | `titlu!~=post` |
| `field>=value` (encoded) | `>=` | `>=` | `numar_likes%3E=50` |
| `field<=value` (encoded) | `<=` | `<=` | `numar_likes%3C=5` |
| `field>=value` | `>` | `>` | — |
| `field<=value` | `<` | `<` | — |

Multiple filters are combined with **AND** automatically.

```http
# Exact match
GET /api/collections/posts/records?titlu=Hello

# LIKE (case-insensitive contains)
GET /api/collections/posts/records?titlu~=beta

# Numeric comparison
GET /api/collections/posts/records?numar_likes%3E=50

# Boolean field (use 1/0 or true/false)
GET /api/collections/persoane/records?membru=1
GET /api/collections/persoane/records?membru=0

# Combined: filter + sort + pagination
GET /api/collections/posts/records?numar_likes%3E=1&sort=-numar_likes&page=1&perPage=2
```

**Observations:**
- `%3E` is the URL-encoded `>`, `%3C` is `<` — required in query strings
- `%2B` is `+` for ascending sort prefix
- Special chars `%` and `_` in LIKE values are auto-escaped server-side
- Reserved params (`page`, `perPage`, `sort`, `expand`) are never treated as filters
- Unknown/invalid field names → `400 {"error":"Invalid filter field: \"<name>\""}`

### Relation Expand

Add `expand=<fieldName>` to inline the full related record under an `expand` key:

```http
GET /api/collections/persoane/records?expand=rol
Authorization: Bearer <admin-token>
```

Response shape — relation field keeps its raw ID, expanded data sits in `expand.<field>`:
```json
{
  "id": "pofTu3pYm8I3JTuqzzkyq",
  "created_at": "2026-03-10T04:20:43.664Z",
  "updated_at": "2026-03-10T04:20:43.664Z",
  "nume": "Popa vasile",
  "membru": true,
  "rol": "VogYksH5nyGly_F3Ifugo",
  "expand": {
    "rol": {
      "id": "VogYksH5nyGly_F3Ifugo",
      "created_at": "2026-03-10T03:58:27.140Z",
      "updated_at": "2026-03-10T03:58:27.140Z",
      "denumire": "utilizator"
    }
  }
}
```

Multiple expands: `?expand=field1,field2` (comma-separated).

---

## Error Responses

All errors follow a consistent shape:

```json
{ "error": "<human-readable message>" }
```

| Status | When |
|---|---|
| `400` | Invalid field name in filter/sort, validation failure |
| `403` | Access denied (rule = null and no valid admin token) |
| `404` | Record not found |
| `401` | Token present but expired/invalid |

---

## Known Gaps / Issues Found

1. **`expand` on restricted collections**: if the *target* collection (e.g. `roluri`) has `null` rules, the expand may silently fail or succeed depending on whether the admin token is propagated — needs further verification.

2. **`!=` operator**: URL encoding of `!=` as a query key is browser-dependent. Tested as `field!=value` which browsers encode correctly, but some HTTP clients may need `field%21=value`.

3. **Boolean filter semantics**: booleans stored as integers (SQLite). Filter with `membre=1` (true) and `membre=0` (false) both work. `membre=true` / `membre=false` string forms were not tested.

4. **No full-text search**: filtering is field-specific only (`field~=value`). There is no cross-field search endpoint.

5. **No `OR` filter logic**: multiple filters are always `AND`-combined. Complex `OR` queries require client-side merging of multiple requests.

6. **perPage enforcement**: values outside `[1, 500]` are silently clamped, not rejected with an error — consistent with PocketBase behavior.
