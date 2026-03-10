# Bunbase CLI & API Key System

## Context

Bunbase is a PocketBase alternative for Bun.js. The primary use case is as a backend for AI agents. Currently, the CLI only starts the HTTP server (`bunbase serve`). AI agents interact via the HTTP API, but there's no API key authentication — only JWT tokens from admin login.

**This plan adds:**
1. A full CLI for admin/setup tasks (direct database access, no HTTP needed)
2. An API key authentication system so AI agents can programmatically access the HTTP API with `X-API-Key` headers

**Architecture**: CLI = admin setup tool (direct DB). AI agents = HTTP API + API keys.

---

## File Structure

```
src/cli.ts                          # Refactored: subcommand dispatcher
src/cli/
  output.ts                         # JSON output formatting, error output to stderr
  db-init.ts                        # Shared database init for non-serve commands
  commands/
    serve.ts                        # Extracted from current cli.ts
    collections.ts                  # bunbase collections list|create|delete|fields|rules
    records.ts                      # bunbase records list|create|get|update|delete
    admin.ts                        # bunbase admin create|reset-password
    apikeys.ts                      # bunbase apikeys create|list|revoke
src/auth/
  apikeys.ts                        # NEW: API key core logic (create, verify, list, revoke)
  apikeys.test.ts                   # NEW: Tests
```

---

## Command Tree

### Global Flags (all non-serve commands)
- `--db <path>` — Database path (default: `BUNBASE_DB` env var → `bunbase.db`)
- `--format <json|table>` — Output format (default: `json`)
- `--quiet` — Suppress non-essential output
- `-h, --help` — Show help

### Exit Codes
- `0` = success, `1` = error, `2` = validation error

---

### `bunbase serve` (existing, extracted to `src/cli/commands/serve.ts`)
No changes to flags. Becomes a subcommand. `bunbase` with no subcommand still defaults to `serve` for backward compatibility.

### `bunbase collections`

| Command | Description |
|---|---|
| `collections list` | List all collections with field counts |
| `collections create --stdin` | Create collection from JSON stdin |
| `collections delete <name> [--confirm]` | Delete collection |
| `collections fields <name>` | List fields for a collection |
| `collections fields <name> --add --stdin` | Add field from JSON stdin |
| `collections fields <name> --update <fieldName> --stdin` | Update field from JSON stdin |
| `collections fields <name> --remove <fieldName>` | Remove field |
| `collections rules <name>` | Get current rules |
| `collections rules <name> --stdin` | Update rules from JSON stdin |

**Stdin JSON formats:**

```jsonc
// collections create --stdin
{"name": "posts", "type": "base", "fields": [
  {"name": "title", "type": "text", "required": true},
  {"name": "author", "type": "relation", "options": {"collection": "users"}}
], "rules": {"listRule": "", "viewRule": "", "createRule": null, "updateRule": null, "deleteRule": null}}

// collections fields <name> --add --stdin
{"name": "category", "type": "text", "required": false}

// collections fields <name> --update title --stdin
{"name": "heading", "type": "text", "required": true}

// collections rules <name> --stdin
{"listRule": "", "viewRule": "", "createRule": "@request.auth.id != ''", "updateRule": null, "deleteRule": null}
```

### `bunbase records`

| Command | Description |
|---|---|
| `records list <collection>` | List with optional `--filter`, `--sort`, `--page`, `--per-page`, `--expand`, `--search` |
| `records create <collection> --stdin` | Create record from JSON stdin |
| `records create <collection> --set key=value [--set ...]` | Create with inline key-value pairs |
| `records get <collection> <id> [--expand fields]` | Get single record |
| `records update <collection> <id> --stdin` | Partial update from JSON stdin |
| `records update <collection> <id> --set key=value` | Partial update with inline pairs |
| `records delete <collection> <id> [--confirm]` | Delete record |

**Batch support**: If stdin contains a JSON array, `records create` creates all records in a transaction and outputs an array of created records. If any fails, none are committed.

### `bunbase admin`

| Command | Description |
|---|---|
| `admin create --email <email> --password <pass>` | Create admin account |
| `admin reset-password --email <email> --password <pass>` | Reset admin password |

### `bunbase apikeys`

| Command | Description |
|---|---|
| `apikeys create --name <label>` | Create API key, prints the raw key (only time it's shown) |
| `apikeys list` | List keys (id, name, prefix, created_at, last_used_at) |
| `apikeys revoke <id> [--confirm]` | Delete an API key |

---

## API Key System

### Table Schema (add to `INIT_METADATA_SQL` in `src/core/database.ts`)

```sql
CREATE TABLE IF NOT EXISTS _api_keys (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  last_used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON _api_keys(key_prefix);
```

Also add to `runMigrations()` for existing databases.

### Key Format
`bb_<nanoid(32)>` — e.g., `bb_V1StGXR8Z5jdHi6BmyTabc123xyz90`

- `bb_` prefix for easy identification in secret scanners
- `key_prefix` stores first 8 chars after `bb_` for lookup optimization
- `key_hash` stores argon2id hash of full key

### Core Module: `src/auth/apikeys.ts`

```typescript
createApiKey(name: string): Promise<{ id, name, key, key_prefix, created_at }>
verifyApiKey(key: string): Promise<{ id, name } | null>
listApiKeys(): ApiKeyInfo[]
revokeApiKey(id: string): void
updateLastUsed(id: string): void  // async, non-blocking
```

**Verification flow:**
1. Extract prefix from key (`key.slice(3, 11)`)
2. Query `_api_keys WHERE key_prefix = ?` (index scan, typically 1 row)
3. `Bun.password.verify(key, candidate.key_hash)`
4. On match: async update `last_used_at`, return key info

### HTTP Integration (modify `src/api/server.ts`)

Modify `buildAuthContext()` (line ~129) and `buildFileAuthContext()` (line ~154):

```typescript
async function buildAuthContext(req: Request) {
  // NEW: Check X-API-Key header first
  const apiKey = req.headers.get('X-API-Key');
  if (apiKey) {
    const keyInfo = await verifyApiKey(apiKey);
    if (keyInfo) return { isAdmin: true, user: null };
  }

  // Existing Bearer token logic (unchanged)
  const token = extractBearerToken(req);
  if (!token) return { isAdmin: false, user: null };
  // ...
}
```

API keys grant `isAdmin: true` — full admin-level access, bypassing all collection rules. This is what AI agents need.

---

## Output Formatting (`src/cli/output.ts`)

**Stdout** — raw data as JSON (or table):
```typescript
function output(data: unknown, format: 'json' | 'table'): void
function outputTable(headers: string[], rows: string[][]): void
```

**Stderr** — errors as JSON:
```typescript
function outputError(code: string, message: string, details?: unknown): void
// Writes to stderr: {"error": "NOT_FOUND", "message": "Collection 'foo' not found"}
```

All data to stdout, all errors to stderr. Pipe-friendly.

---

## Dispatcher Design (`src/cli.ts` refactor)

```typescript
const [command, ...rest] = Bun.argv.slice(2);

switch (command) {
  case 'serve': case undefined:  // default = serve
    import('./cli/commands/serve').then(m => m.execute(rest));
    break;
  case 'collections':
    initDb(dbPath);
    import('./cli/commands/collections').then(m => m.execute(rest));
    break;
  case 'records':
    initDb(dbPath);
    import('./cli/commands/records').then(m => m.execute(rest));
    break;
  case 'admin':
    initDb(dbPath);
    import('./cli/commands/admin').then(m => m.execute(rest));
    break;
  case 'apikeys':
    initDb(dbPath);
    import('./cli/commands/apikeys').then(m => m.execute(rest));
    break;
  default:
    outputError('UNKNOWN_COMMAND', `Unknown command: ${command}`);
    process.exit(1);
}
```

Uses `util.parseArgs` (already in use, no new dependency). `strict: false` at top level to pass through subcommand-specific flags.

---

## Key Integration Points

| CLI Command | Calls | Module |
|---|---|---|
| `collections list` | `getAllCollections()` | `src/core/schema.ts` |
| `collections create` | `createCollection(name, fields, opts)` | `src/core/schema.ts` |
| `collections delete` | `deleteCollection(name)` | `src/core/schema.ts` |
| `collections fields` | `getFields()`, `addField()`, `updateField()`, `removeField()` | `src/core/schema.ts` |
| `collections rules` | `updateCollectionRules()` | `src/core/schema.ts` |
| `records list` | `listRecordsWithQuery(name, opts)` — no authContext = no rule checks | `src/core/records.ts` |
| `records create` | `createRecord(name, data)` — non-hook variant (sync, admin) | `src/core/records.ts` |
| `records get` | `getRecord(name, id)` | `src/core/records.ts` |
| `records update` | `updateRecord(name, id, data)` | `src/core/records.ts` |
| `records delete` | `deleteRecord(name, id)` | `src/core/records.ts` |
| `admin create` | `createAdmin(email, password)` | `src/auth/admin.ts` |
| `admin reset-password` | `getAdminByEmail()` + `updateAdminPassword()` | `src/auth/admin.ts` |
| `apikeys *` | `createApiKey()`, `listApiKeys()`, `revokeApiKey()` | `src/auth/apikeys.ts` (new) |

CLI uses non-hook record operations (synchronous, no HookManager needed). Direct DB = implicit admin access.

---

## Why NOT Dynamic Commands

The user asked about dynamically generating per-collection CLI commands (e.g., `bunbase posts list` instead of `bunbase records list posts`). Decision: **No**.

- **Name collisions**: Collections named `serve`, `admin`, `collections`, or `apikeys` would conflict
- **Parse ambiguity**: Can't distinguish typos from collection names without DB access at parse time
- **AI agent predictability**: Explicit `records` prefix is unambiguous and self-documenting
- **Binary compilation**: Dynamic commands require DB access during arg parsing, before `--db` is resolved

---

## Implementation Order

### Phase 1: Foundation
1. Create `src/cli/output.ts` — JSON/table formatters, error output
2. Create `src/cli/db-init.ts` — shared `initForCli(dbPath)` helper
3. Extract serve logic to `src/cli/commands/serve.ts`
4. Refactor `src/cli.ts` into subcommand dispatcher

### Phase 2: Collection Commands
5. Create `src/cli/commands/collections.ts` — all collection subcommands

### Phase 3: Record Commands
6. Create `src/cli/commands/records.ts` — CRUD + batch stdin + query flags

### Phase 4: Admin Commands
7. Create `src/cli/commands/admin.ts` — create + reset-password

### Phase 5: API Key System
8. Add `_api_keys` table to `src/core/database.ts` (INIT_METADATA_SQL + migration)
9. Create `src/auth/apikeys.ts` — core API key logic
10. Create `src/auth/apikeys.test.ts` — tests
11. Create `src/cli/commands/apikeys.ts` — CLI commands
12. Modify `buildAuthContext()` and `buildFileAuthContext()` in `src/api/server.ts`

### Phase 6: Polish
13. Add `--help` text for all commands
14. Verify `bun build --compile` works
15. End-to-end test: CLI setup → API key → HTTP access

---

## Verification

1. **Unit tests**: `bun test src/auth/apikeys.test.ts`
2. **CLI smoke test**:
   ```bash
   bunbase collections list --db test.db
   echo '{"name":"test","fields":[{"name":"title","type":"text","required":true}]}' | bunbase collections create --stdin --db test.db
   echo '{"title":"hello"}' | bunbase records create test --stdin --db test.db
   bunbase records list test --db test.db
   bunbase apikeys create --name "my-agent" --db test.db  # prints bb_xxxxx
   ```
3. **HTTP API key test**:
   ```bash
   bunbase serve --db test.db &
   curl -H "X-API-Key: bb_xxxxx" http://localhost:8090/api/collections/test/records
   ```
4. **Compile test**: `bun build --compile --minify src/cli.ts --outfile bunbase`
