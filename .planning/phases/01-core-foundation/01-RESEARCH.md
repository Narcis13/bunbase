# Phase 1: Core Foundation - Research

**Researched:** 2026-01-25
**Domain:** Database layer, schema management, field validation
**Confidence:** HIGH

## Summary

Phase 1 establishes the database layer and schema management system that all other phases depend on. The core technology stack is Bun's native SQLite driver (`bun:sqlite`) with Drizzle ORM for type-safe queries, and Zod for runtime validation of field values against schema definitions.

The key architectural decision is storing schema definitions in SQLite metadata tables (`_collections`, `_fields`) rather than in code files. This follows the PocketBase pattern and enables runtime schema changes through the admin UI in later phases. Field validation uses dynamically-built Zod schemas generated from the database-stored field definitions.

The main technical challenges are: (1) SQLite's limited ALTER TABLE support requiring a 12-step shadow table migration pattern for schema changes, and (2) building Zod validators dynamically at runtime from stored field metadata.

**Primary recommendation:** Use `bun:sqlite` directly with `strict: true`, store schema in `_collections`/`_fields` tables, generate Zod validators dynamically from field definitions at runtime.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| bun:sqlite | built-in (Bun 1.3.6+) | Database driver | Native, 3-6x faster than better-sqlite3, zero deps |
| drizzle-orm | ^0.45.1 | Type-safe queries | Lightweight (~7.4kb), native bun:sqlite support, SQL-first |
| drizzle-kit | ^0.30.0 | Migration tooling | Generates SQL migrations, schema diffing |
| zod | ^3.24.0 | Runtime validation | TypeScript-first, dynamic schema building |
| nanoid | ^5.0.9 | ID generation | 21 chars, URL-safe, same collision resistance as UUID |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @hono/zod-validator | ^0.7.6 | Request validation | When integrating with Hono routes (Phase 2) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| nanoid | cuid2 | CUID2 more secure (SHA3, extra entropy), but slower and overkill for record IDs |
| Zod | TypeBox | TypeBox is faster but less ergonomic for dynamic schema building |
| Drizzle | Raw SQL | Drizzle provides type-safety; raw SQL is fine for internal metadata tables |

**Installation:**
```bash
bun add drizzle-orm@^0.45.1 zod@^3.24.0 nanoid@^5.0.9
bun add -D drizzle-kit@^0.30.0 @types/bun
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── core/
│   ├── database.ts       # Database connection, initialization, PRAGMAs
│   ├── schema.ts         # SchemaManager: CRUD for collections/fields
│   ├── validation.ts     # Builds Zod schemas from field definitions
│   └── migrations.ts     # Shadow table migration logic
├── types/
│   ├── collection.ts     # Collection, Field type definitions
│   └── record.ts         # Record type with system fields
└── utils/
    └── id.ts             # nanoid wrapper for ID generation
```

### Pattern 1: Schema-in-Database
**What:** Store collection and field definitions in SQLite metadata tables, not code files.
**When to use:** Always - this enables runtime schema changes via admin UI.
**Example:**
```typescript
// Source: PocketBase pattern, bun:sqlite docs
import { Database } from "bun:sqlite";

// Internal metadata tables
const INIT_SQL = `
  CREATE TABLE IF NOT EXISTS _collections (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS _fields (
    id TEXT PRIMARY KEY,
    collection_id TEXT NOT NULL REFERENCES _collections(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    required INTEGER DEFAULT 0,
    options TEXT,  -- JSON for type-specific options
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(collection_id, name)
  );
`;
```

### Pattern 2: Dynamic Zod Schema Generation
**What:** Build Zod validators at runtime from stored field definitions.
**When to use:** When validating record data against collection schema.
**Example:**
```typescript
// Source: Zod docs, verified pattern
import { z } from "zod";

type FieldDef = {
  name: string;
  type: "text" | "number" | "boolean" | "datetime" | "json" | "relation";
  required: boolean;
  options?: Record<string, unknown>;
};

function buildValidator(fields: FieldDef[]): z.ZodObject<any> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const field of fields) {
    let schema: z.ZodTypeAny;

    switch (field.type) {
      case "text":
        schema = z.string();
        break;
      case "number":
        schema = z.number();
        break;
      case "boolean":
        schema = z.boolean();
        break;
      case "datetime":
        schema = z.string().datetime();  // ISO 8601 string
        break;
      case "json":
        schema = z.unknown();  // Any valid JSON
        break;
      case "relation":
        schema = z.string();  // ID of related record
        break;
    }

    if (!field.required) {
      schema = schema.optional();
    }

    shape[field.name] = schema;
  }

  return z.object(shape);
}
```

### Pattern 3: System Fields Auto-Injection
**What:** Every record automatically receives `id`, `created_at`, `updated_at` fields.
**When to use:** All collection tables - these fields are not user-defined.
**Example:**
```typescript
// Source: PocketBase pattern
import { nanoid } from "nanoid";

interface SystemFields {
  id: string;
  created_at: string;
  updated_at: string;
}

function createRecord(collectionName: string, data: unknown): SystemFields & Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    id: nanoid(),
    created_at: now,
    updated_at: now,
    ...(data as Record<string, unknown>),
  };
}
```

### Anti-Patterns to Avoid
- **Code-generated schema files:** Don't generate TypeScript files from schema - this creates drift and deployment complexity.
- **Using ORM for metadata tables:** Drizzle is great for user collections, but use raw SQL for `_collections`/`_fields` to avoid circular dependencies.
- **Storing dates as Unix timestamps:** Use ISO 8601 strings (`datetime('now')`) for SQLite compatibility and human readability.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ID generation | Custom random strings | nanoid | Collision math is subtle; nanoid is proven |
| Runtime validation | Manual type checks | Zod | Edge cases (null vs undefined, coercion) handled |
| SQL injection prevention | String interpolation | Prepared statements with `$` params | bun:sqlite prepared statements are safe |
| Date/time handling | Custom parsing | ISO 8601 strings + Date | SQLite datetime functions work with ISO strings |
| Schema diffing | Manual comparison | drizzle-kit generate | Handles renames, detects changes correctly |

**Key insight:** The complexity in schema management is not in the happy path - it's in migration edge cases, validation error messages, and type coercion. Libraries handle these.

## Common Pitfalls

### Pitfall 1: SQLite ALTER TABLE Limitations
**What goes wrong:** Trying to modify column types, drop columns (pre-3.35), or change constraints fails silently or errors.
**Why it happens:** SQLite only supports limited ALTER TABLE operations: RENAME TABLE, RENAME COLUMN, ADD COLUMN, DROP COLUMN (3.35+).
**How to avoid:** Implement the 12-step shadow table migration pattern for any non-trivial schema changes.
**Warning signs:** `SQLITE_ERROR` during migrations, unexpected table structure after migrations.

### Pitfall 2: Missing `strict: true` on Database
**What goes wrong:** Parameter binding silently ignores missing parameters, queries return unexpected results.
**Why it happens:** By default, bun:sqlite doesn't require `$`/`:`/`@` prefix and doesn't error on missing params.
**How to avoid:** Always create database with `new Database(path, { strict: true })`.
**Warning signs:** Queries returning NULL when values expected, no errors but wrong data.

### Pitfall 3: Foreign Keys Not Enforced by Default
**What goes wrong:** Inserting records with invalid relation IDs succeeds, data integrity violated.
**Why it happens:** SQLite has foreign keys disabled by default for backward compatibility.
**How to avoid:** Run `PRAGMA foreign_keys = ON` immediately after opening database.
**Warning signs:** Orphaned records, relations pointing to non-existent IDs.

### Pitfall 4: WAL Mode Not Enabled
**What goes wrong:** Poor concurrent read performance, potential blocking under load.
**Why it happens:** Default journal mode is DELETE, not WAL.
**How to avoid:** Run `PRAGMA journal_mode = WAL` at startup.
**Warning signs:** Slow reads when writes are happening, timeout errors.

### Pitfall 5: Dynamic Zod Schema Losing Type Inference
**What goes wrong:** TypeScript can't infer types from dynamically-built Zod schemas.
**Why it happens:** Schemas built at runtime can't be statically analyzed.
**How to avoid:** Accept this limitation - use `.parse()` return type as `unknown` and validate, or use branded types for known system fields.
**Warning signs:** Lots of `any` types, no autocomplete on validated data.

### Pitfall 6: Forgetting to Update `updated_at` on Updates
**What goes wrong:** `updated_at` field stays at creation time, audit trail broken.
**Why it happens:** No automatic trigger in application code.
**How to avoid:** Always set `updated_at = datetime('now')` in UPDATE statements, or use SQLite trigger.
**Warning signs:** `created_at` equals `updated_at` on records that were definitely modified.

## Code Examples

Verified patterns from official sources:

### Database Initialization
```typescript
// Source: bun.sh/docs/api/sqlite
import { Database } from "bun:sqlite";

export function initDatabase(path: string): Database {
  const db = new Database(path, {
    strict: true,  // Error on missing params
    create: true,  // Create if not exists
  });

  // Essential PRAGMAs
  db.run("PRAGMA journal_mode = WAL");       // Better concurrent reads
  db.run("PRAGMA synchronous = NORMAL");     // Balanced durability/speed
  db.run("PRAGMA foreign_keys = ON");        // Enforce FK constraints
  db.run("PRAGMA cache_size = -64000");      // 64MB cache

  return db;
}
```

### Prepared Statement with Strict Mode
```typescript
// Source: bun.sh/docs/api/sqlite
const db = new Database("data.db", { strict: true });

// Named parameters without prefix (strict mode)
const insert = db.prepare(
  "INSERT INTO users (id, name, email) VALUES ($id, $name, $email)"
);
insert.run({ id: nanoid(), name: "Alice", email: "alice@example.com" });

// Get single result
const user = db.query("SELECT * FROM users WHERE id = $id").get({ id: userId });

// Get all results
const users = db.query("SELECT * FROM users WHERE active = $active").all({ active: 1 });
```

### Transaction with Rollback on Error
```typescript
// Source: bun.sh/docs/api/sqlite
const insertMany = db.transaction((records: Array<{ name: string }>) => {
  const stmt = db.prepare("INSERT INTO items (id, name) VALUES ($id, $name)");
  for (const record of records) {
    stmt.run({ id: nanoid(), name: record.name });
  }
  return records.length;
});

// Transaction auto-commits on success, rolls back on throw
try {
  const count = insertMany([{ name: "a" }, { name: "b" }]);
  console.log(`Inserted ${count} records`);
} catch (e) {
  console.error("Transaction rolled back:", e);
}
```

### 12-Step Shadow Table Migration
```typescript
// Source: sqlite.org/lang_altertable.html
function migrateTable(
  db: Database,
  tableName: string,
  newSchema: string,  // CREATE TABLE SQL for new schema
  dataTransform: string  // SELECT statement to transform data
): void {
  db.transaction(() => {
    // 1. Disable foreign keys
    db.run("PRAGMA foreign_keys = OFF");

    // 2-3. Save existing indexes/triggers (query sqlite_schema)
    const indexes = db.query(
      "SELECT sql FROM sqlite_schema WHERE type='index' AND tbl_name = $table AND sql IS NOT NULL"
    ).all({ table: tableName }) as Array<{ sql: string }>;

    const triggers = db.query(
      "SELECT sql FROM sqlite_schema WHERE type='trigger' AND tbl_name = $table"
    ).all({ table: tableName }) as Array<{ sql: string }>;

    // 4. Create new table with temp name
    const tempName = `_new_${tableName}`;
    db.run(newSchema.replace(tableName, tempName));

    // 5. Copy data with transformation
    db.run(`INSERT INTO ${tempName} ${dataTransform}`);

    // 6. Drop old table
    db.run(`DROP TABLE ${tableName}`);

    // 7. Rename new table
    db.run(`ALTER TABLE ${tempName} RENAME TO ${tableName}`);

    // 8. Recreate indexes
    for (const idx of indexes) {
      db.run(idx.sql);
    }

    // Recreate triggers
    for (const trg of triggers) {
      db.run(trg.sql);
    }

    // 10. Verify foreign key integrity
    const fkErrors = db.query("PRAGMA foreign_key_check").all();
    if (fkErrors.length > 0) {
      throw new Error(`Foreign key violations: ${JSON.stringify(fkErrors)}`);
    }

    // 11. Re-enable foreign keys
    db.run("PRAGMA foreign_keys = ON");
  })();  // Execute transaction immediately
}
```

### Drizzle Schema for User Collections
```typescript
// Source: orm.drizzle.team/docs/column-types/sqlite
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// Example user collection table (generated dynamically)
export const posts = sqliteTable("posts", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body"),
  author_id: text("author_id").references(() => users.id),
  views: integer("views").default(0),
  published: integer("published", { mode: "boolean" }).default(false),
  metadata: text("metadata", { mode: "json" }).$type<{ tags: string[] }>(),
  created_at: text("created_at").default(sql`(datetime('now'))`),
  updated_at: text("updated_at").default(sql`(datetime('now'))`),
});
```

### Field Type to SQLite Column Mapping
```typescript
// Field types and their SQLite representations
const FIELD_TYPE_MAP = {
  text: "TEXT",
  number: "REAL",       // Use REAL for decimals, INTEGER for whole numbers
  boolean: "INTEGER",   // 0/1 in SQLite
  datetime: "TEXT",     // ISO 8601 string
  json: "TEXT",         // JSON as string
  relation: "TEXT",     // Foreign key (ID of related record)
} as const;

type FieldType = keyof typeof FIELD_TYPE_MAP;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| better-sqlite3 | bun:sqlite | Bun 1.0 (2023) | 3-6x faster, zero native deps |
| TypeORM/Prisma | Drizzle ORM | 2024 | Lightweight, SQL-first, better bun:sqlite support |
| UUID | nanoid | Stable | 40% shorter IDs, URL-safe |
| Manual validation | Zod | Stable | Type inference, composable schemas |

**Deprecated/outdated:**
- **better-sqlite3**: Requires native compilation, slower, use bun:sqlite instead
- **Prisma for SQLite**: Heavy, downloads binaries, doesn't support bun:sqlite natively
- **jsonwebtoken**: Use hono/jwt or jose instead (for auth phase)

## Open Questions

Things that couldn't be fully resolved:

1. **Drizzle migration handling for SQLite limitations**
   - What we know: drizzle-kit generates migrations, but SQLite ALTER TABLE is limited
   - What's unclear: Does drizzle-kit automatically use shadow table pattern for column changes?
   - Recommendation: Test with a column type change migration; may need custom migration logic for complex changes

2. **Concurrent schema modifications**
   - What we know: Schema stored in SQLite, single-writer model
   - What's unclear: How to handle race conditions if two admin UI requests modify schema simultaneously
   - Recommendation: Use SQLite's transaction isolation; implement optimistic locking on `_collections.updated_at`

3. **JSON field query syntax**
   - What we know: SQLite has JSON functions (json_extract, etc.)
   - What's unclear: Whether to support querying inside JSON fields in API filters
   - Recommendation: Defer JSON field querying to v0.2; store/retrieve as blob for v0.1

## Sources

### Primary (HIGH confidence)
- [Bun SQLite Documentation](https://bun.sh/docs/api/sqlite) - API reference, strict mode, transactions
- [SQLite ALTER TABLE](https://www.sqlite.org/lang_altertable.html) - 12-step migration procedure
- [Drizzle ORM SQLite Column Types](https://orm.drizzle.team/docs/column-types/sqlite) - Schema definition
- [Zod Documentation](https://zod.dev/api) - Runtime validation API

### Secondary (MEDIUM confidence)
- [Drizzle ORM bun:sqlite Setup](https://orm.drizzle.team/docs/get-started/bun-sqlite-new) - Integration guide
- [Drizzle Migrations](https://orm.drizzle.team/docs/migrations) - Migration workflow
- [nanoid GitHub](https://github.com/ai/nanoid) - ID generation

### Tertiary (LOW confidence)
- [Dynamic Zod Schema Discussions](https://github.com/colinhacks/zod/discussions/3111) - Runtime schema building patterns
- [SQLite Migration Best Practices](https://synkee.com.sg/blog/safely-modify-sqlite-table-columns-with-production-data/) - Community patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Official docs verified, widely adopted
- Architecture: HIGH - PocketBase pattern proven, SQLite docs authoritative
- Pitfalls: HIGH - SQLite limitations well-documented, verified with official sources

**Research date:** 2026-01-25
**Valid until:** 2026-02-25 (30 days - stable domain)
