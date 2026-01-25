# Phase 3: Query Capabilities - Research

**Researched:** 2026-01-25
**Domain:** Dynamic SQL Query Building, URL Query Parsing, Relation Expansion
**Confidence:** HIGH

## Summary

Phase 3 extends the existing list endpoint (`GET /api/collections/:name/records`) with query capabilities: filtering, sorting, pagination, and relation expansion. The requirements follow PocketBase API conventions, making the research straightforward since PocketBase's documented API is the specification.

The implementation uses three core patterns: (1) **URL query parameter parsing** via Web Standard `URLSearchParams`, (2) **dynamic SQL query building** with whitelist-based column validation to prevent SQL injection, and (3) **post-query relation expansion** by fetching related records after the main query.

The project's prior decisions constrain the approach: use bun:sqlite directly (no ORM), store schema in database (for runtime field validation), and use Bun.serve() routes. This means query building is hand-rolled but must use parameterized values for all user-provided data, with column/field names validated against the schema whitelist.

**Primary recommendation:** Build a query builder module that accepts parsed filter/sort/pagination options, validates field names against schema, and generates parameterized SQL. Expand relations post-query by fetching related records based on field definitions.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| bun:sqlite | Built-in | SQL execution with parameterized queries | Project constraint, no external deps |
| URLSearchParams | Web API | Parse query string parameters | Built into Bun, standard API |
| URL | Web API | Extract search params from request | Built into Bun, standard API |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| getFields() | Existing | Validate field names against schema | Before building WHERE/ORDER BY clauses |
| getRecord() | Existing | Fetch related records for expansion | When expand parameter is present |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled query builder | Kysely | Kysely is type-safe and excellent, but adds dependency; project uses bun:sqlite directly per prior decisions |
| Simple filter parsing | Full expression parser | Full parser (like PocketBase's) supports `&&`, `||`, parentheses; simpler approach suffices for v1 |

**Installation:**
```bash
# No new dependencies needed - all built-in
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── api/
│   └── server.ts        # (existing) Add query param parsing to GET handler
├── core/
│   ├── query.ts         # NEW: Query builder with filter/sort/pagination
│   ├── records.ts       # EXTEND: Add listRecordsWithQuery(), expandRelations()
│   └── schema.ts        # (existing) Use getFields() for validation
└── types/
    └── query.ts         # NEW: QueryOptions, FilterCondition types
```

### Pattern 1: Query Options Type
**What:** Define a structured type for all query parameters
**When to use:** Pass parsed query parameters to records module
**Example:**
```typescript
// Source: PocketBase API documentation
interface FilterCondition {
  field: string;
  operator: "=" | "!=" | ">" | "<" | ">=" | "<=" | "~" | "!~";
  value: string | number | boolean | null;
}

interface QueryOptions {
  filter?: FilterCondition[];
  sort?: { field: string; direction: "asc" | "desc" }[];
  page?: number;
  perPage?: number;
  expand?: string[];
}
```

### Pattern 2: Whitelist-Based Field Validation
**What:** Validate field names against schema before building SQL
**When to use:** Any time user input determines column names in SQL
**Example:**
```typescript
// Source: OWASP SQL Injection Prevention Cheat Sheet
function validateFieldName(
  fieldName: string,
  fields: Field[]
): boolean {
  // System fields are always valid
  const systemFields = ["id", "created_at", "updated_at"];
  if (systemFields.includes(fieldName)) return true;

  // Check against schema
  return fields.some(f => f.name === fieldName);
}

// Usage before SQL construction
const fields = getFields(collectionName);
for (const condition of filter) {
  if (!validateFieldName(condition.field, fields)) {
    throw new Error(`Invalid field: ${condition.field}`);
  }
}
```

### Pattern 3: Parameterized SQL with Dynamic Columns
**What:** Build SQL with validated column names and parameterized values
**When to use:** All dynamic query construction
**Example:**
```typescript
// Source: SQLite parameterized query best practices
function buildWhereClause(
  conditions: FilterCondition[],
  fields: Field[]
): { sql: string; params: Record<string, unknown> } {
  if (conditions.length === 0) {
    return { sql: "", params: {} };
  }

  const clauses: string[] = [];
  const params: Record<string, unknown> = {};

  for (let i = 0; i < conditions.length; i++) {
    const { field, operator, value } = conditions[i];
    const paramName = `filter_${i}`;

    // Field name already validated - safe to interpolate
    switch (operator) {
      case "=":
        clauses.push(`"${field}" = $${paramName}`);
        params[paramName] = value;
        break;
      case "!=":
        clauses.push(`"${field}" != $${paramName}`);
        params[paramName] = value;
        break;
      case ">":
        clauses.push(`"${field}" > $${paramName}`);
        params[paramName] = value;
        break;
      case "<":
        clauses.push(`"${field}" < $${paramName}`);
        params[paramName] = value;
        break;
      case "~": // LIKE with wildcards
        clauses.push(`"${field}" LIKE $${paramName}`);
        params[paramName] = `%${value}%`;
        break;
      case "!~": // NOT LIKE
        clauses.push(`"${field}" NOT LIKE $${paramName}`);
        params[paramName] = `%${value}%`;
        break;
    }
  }

  return {
    sql: `WHERE ${clauses.join(" AND ")}`,
    params,
  };
}
```

### Pattern 4: Pagination with COUNT and LIMIT/OFFSET
**What:** Execute COUNT query for totalItems, then paginated SELECT
**When to use:** List endpoint with pagination
**Example:**
```typescript
// Source: PocketBase list response format
interface PaginatedResponse<T> {
  page: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
  items: T[];
}

function buildPaginationClause(
  page: number,
  perPage: number
): { sql: string; offset: number } {
  const offset = (page - 1) * perPage;
  return {
    sql: `LIMIT ${perPage} OFFSET ${offset}`,
    offset,
  };
}

// Usage: two queries
// 1. COUNT(*) with same WHERE clause for totalItems
// 2. SELECT * with LIMIT/OFFSET for items
```

### Pattern 5: Post-Query Relation Expansion
**What:** Fetch related records after main query, attach to response
**When to use:** When expand parameter specifies relation fields
**Example:**
```typescript
// Source: PocketBase expand parameter behavior
function expandRelations(
  records: Record<string, unknown>[],
  expandFields: string[],
  fields: Field[]
): Record<string, unknown>[] {
  // Find relation fields that match expand request
  const relationFields = fields.filter(
    f => f.type === "relation" && expandFields.includes(f.name)
  );

  if (relationFields.length === 0) return records;

  return records.map(record => {
    const expanded: Record<string, unknown> = { ...record };
    const expand: Record<string, unknown> = {};

    for (const field of relationFields) {
      const relatedId = record[field.name] as string | null;
      if (!relatedId) continue;

      const targetCollection = field.options?.collection || field.options?.target;
      if (!targetCollection) continue;

      const relatedRecord = getRecord(targetCollection, relatedId);
      if (relatedRecord) {
        expand[field.name] = relatedRecord;
      }
    }

    if (Object.keys(expand).length > 0) {
      expanded.expand = expand;
    }

    return expanded;
  });
}
```

### Anti-Patterns to Avoid
- **String concatenation for values:** Never `WHERE field = '${value}'`. Always use parameterized queries.
- **Trusting field names from URL:** Always validate against schema whitelist before SQL construction.
- **N+1 queries for expansion:** Collect all related IDs, then batch fetch (though for v1, individual fetches acceptable).
- **Ignoring totalItems in pagination:** Always return accurate count for proper pagination UI.
- **Modifying filter syntax arbitrarily:** Follow PocketBase conventions for API compatibility.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| URL query parsing | Manual string splitting | `new URL(req.url).searchParams` | Handles encoding, multiple values correctly |
| SQL value parameterization | String interpolation | `$paramName` syntax in bun:sqlite | Prevents SQL injection |
| Field type for comparisons | Guess from value | Check field.type from schema | Ensures correct comparison semantics |
| Relation target lookup | Parse from URL | `field.options.collection` or `field.options.target` | Schema is source of truth |

**Key insight:** The schema (stored in `_collections`/`_fields` tables) is the authoritative source for field validation. Use `getFields()` extensively to validate any user-provided field names before SQL construction.

## Common Pitfalls

### Pitfall 1: SQL Injection via Column Names
**What goes wrong:** User provides `id; DROP TABLE users` as field name in filter
**Why it happens:** Column names cannot be parameterized in SQL
**How to avoid:** Validate all field names against schema whitelist before SQL construction. Only allow names that exist in `getFields()` output plus system fields.
**Warning signs:** Dynamic SQL that interpolates user input into column positions

### Pitfall 2: Type Mismatch in Comparisons
**What goes wrong:** Comparing string field with numeric operator, or vice versa
**Why it happens:** URL params are always strings; need type coercion
**How to avoid:** Look up field type from schema, coerce value appropriately. Numbers should use `parseFloat()`, booleans should parse "true"/"false".
**Warning signs:** SQLite implicit type coercion giving unexpected results

### Pitfall 3: Empty Filter Edge Cases
**What goes wrong:** Empty filter array generates invalid SQL like `WHERE`
**Why it happens:** Not handling the zero-conditions case
**How to avoid:** Return empty string for WHERE clause when no conditions
**Warning signs:** SQL syntax errors on unfiltered requests

### Pitfall 4: LIKE Operator Special Characters
**What goes wrong:** User searches for `%` or `_` and gets unexpected matches
**Why it happens:** `%` and `_` are wildcards in LIKE; need escaping
**How to avoid:** Escape `%` as `\%` and `_` as `\_` in user input for LIKE, add `ESCAPE '\'`
**Warning signs:** Search for literal `%` returns all records

### Pitfall 5: Pagination Off-by-One
**What goes wrong:** Page 1 skips first record, or last page is empty
**Why it happens:** Confusion between 0-indexed and 1-indexed pagination
**How to avoid:** Use `offset = (page - 1) * perPage` for 1-indexed pages
**Warning signs:** First record missing, or duplicates across pages

### Pitfall 6: Expand Non-Relation Fields
**What goes wrong:** Error or silent failure when expanding a text field
**Why it happens:** Not validating that expanded field is type "relation"
**How to avoid:** Filter expand list to only include fields where `field.type === "relation"`
**Warning signs:** Expand silently does nothing for valid field names

### Pitfall 7: Missing Related Records
**What goes wrong:** Expand returns null or crashes for deleted related records
**Why it happens:** Relation IDs may reference records that no longer exist
**How to avoid:** Handle null return from `getRecord()` gracefully, either omit or include as null
**Warning signs:** 500 errors when expanding records with stale relations

## Code Examples

Verified patterns from official sources:

### Parse Query Parameters from Request
```typescript
// Source: Bun documentation, Web Standards
function parseQueryOptions(req: Request): QueryOptions {
  const url = new URL(req.url);
  const options: QueryOptions = {};

  // Pagination
  const page = url.searchParams.get("page");
  const perPage = url.searchParams.get("perPage");
  options.page = page ? parseInt(page, 10) : 1;
  options.perPage = perPage ? parseInt(perPage, 10) : 30;

  // Validate pagination bounds
  if (options.page < 1) options.page = 1;
  if (options.perPage < 1) options.perPage = 1;
  if (options.perPage > 500) options.perPage = 500; // Reasonable max

  // Sort: "-created,title" => [{ field: "created", direction: "desc" }, { field: "title", direction: "asc" }]
  const sort = url.searchParams.get("sort");
  if (sort) {
    options.sort = sort.split(",").map(s => {
      const trimmed = s.trim();
      if (trimmed.startsWith("-")) {
        return { field: trimmed.slice(1), direction: "desc" as const };
      } else if (trimmed.startsWith("+")) {
        return { field: trimmed.slice(1), direction: "asc" as const };
      }
      return { field: trimmed, direction: "asc" as const };
    });
  }

  // Expand: "author,category" => ["author", "category"]
  const expand = url.searchParams.get("expand");
  if (expand) {
    options.expand = expand.split(",").map(e => e.trim());
  }

  // Filter: Parse simple key-value pairs with operator suffix
  // e.g., "status=active", "views>100", "title~hello"
  // For v1, support simple single-field filters from individual params
  options.filter = [];
  for (const [key, value] of url.searchParams.entries()) {
    if (["page", "perPage", "sort", "expand"].includes(key)) continue;

    // Parse operator from key suffix or between key and value
    const match = key.match(/^([a-zA-Z_][a-zA-Z0-9_]*)(=|!=|>=|<=|>|<|~|!~)?$/);
    if (match) {
      const field = match[1];
      const operator = (match[2] || "=") as FilterCondition["operator"];
      options.filter.push({ field, operator, value });
    }
  }

  return options;
}
```

### Build Complete SELECT Query
```typescript
// Source: SQLite documentation, OWASP guidance
function buildListQuery(
  collectionName: string,
  options: QueryOptions,
  fields: Field[]
): { sql: string; countSql: string; params: Record<string, unknown> } {
  // Validate field names in filter and sort
  const allFieldNames = [
    "id", "created_at", "updated_at",
    ...fields.map(f => f.name)
  ];

  for (const condition of options.filter || []) {
    if (!allFieldNames.includes(condition.field)) {
      throw new Error(`Invalid filter field: ${condition.field}`);
    }
  }

  for (const s of options.sort || []) {
    if (!allFieldNames.includes(s.field)) {
      throw new Error(`Invalid sort field: ${s.field}`);
    }
  }

  // Build WHERE clause
  const whereResult = buildWhereClause(options.filter || [], fields);
  const params = { ...whereResult.params };

  // Build ORDER BY clause
  let orderBy = "";
  if (options.sort && options.sort.length > 0) {
    const orderParts = options.sort.map(s =>
      `"${s.field}" ${s.direction.toUpperCase()}`
    );
    orderBy = `ORDER BY ${orderParts.join(", ")}`;
  }

  // Build LIMIT/OFFSET
  const page = options.page || 1;
  const perPage = options.perPage || 30;
  const offset = (page - 1) * perPage;
  const limitOffset = `LIMIT ${perPage} OFFSET ${offset}`;

  // Assemble queries
  const baseFrom = `FROM "${collectionName}"`;
  const countSql = `SELECT COUNT(*) as count ${baseFrom} ${whereResult.sql}`;
  const sql = `SELECT * ${baseFrom} ${whereResult.sql} ${orderBy} ${limitOffset}`;

  return { sql, countSql, params };
}
```

### Complete List with Query Handler
```typescript
// Source: Combined from research
async function listRecordsWithQuery(
  collectionName: string,
  options: QueryOptions
): Promise<PaginatedResponse<Record<string, unknown>>> {
  const db = getDatabase();
  const collection = getCollection(collectionName);
  if (!collection) {
    throw new Error(`Collection "${collectionName}" not found`);
  }

  const fields = getFields(collectionName);
  const { sql, countSql, params } = buildListQuery(collectionName, options, fields);

  // Get total count
  const countResult = db.prepare(countSql).get(params) as { count: number };
  const totalItems = countResult.count;

  // Get paginated items
  let items = db.prepare(sql).all(params) as Record<string, unknown>[];

  // Parse JSON fields
  items = items.map(record => parseJsonFields(fields, record));

  // Expand relations if requested
  if (options.expand && options.expand.length > 0) {
    items = expandRelations(items, options.expand, fields);
  }

  const page = options.page || 1;
  const perPage = options.perPage || 30;

  return {
    page,
    perPage,
    totalItems,
    totalPages: Math.ceil(totalItems / perPage),
    items,
  };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| String concatenation SQL | Parameterized queries | Always best practice | Prevents SQL injection |
| ORM for dynamic queries | Direct SQL with validation | Project decision | Fewer dependencies, more control |
| N+1 relation queries | Batch fetch (future) | Common optimization | Better performance at scale |

**Deprecated/outdated:**
- **Full expression parser for v1:** Complex `&&`, `||`, parentheses parsing is overkill. Simple field-based filters suffice. Can add later.
- **Nested relation expansion:** PocketBase supports `expand=author.profile`. For v1, single-level expansion is sufficient.

## Open Questions

Things that couldn't be fully resolved:

1. **Filter Expression Complexity**
   - What we know: PocketBase supports `&&`, `||`, parentheses in filter expressions
   - What's unclear: Whether v1 needs this or simple per-field filters suffice
   - Recommendation: Start with simple `field=value` filters using query params. Add expression parser in future phase if needed.

2. **Maximum Expand Depth**
   - What we know: PocketBase supports up to 6 levels of nested expansion
   - What's unclear: Whether BunBase needs nested expansion for v1
   - Recommendation: Implement single-level expansion only. Add nested expansion later.

3. **LIKE Operator Case Sensitivity**
   - What we know: SQLite LIKE is case-insensitive for ASCII but case-sensitive for Unicode
   - What's unclear: Whether to normalize behavior
   - Recommendation: Use SQLite default behavior for v1. Document limitation.

4. **Filter Operator in Query Param Syntax**
   - What we know: Need to differentiate `field=value` from `field>value` in URL
   - What's unclear: Best URL syntax for operators
   - Recommendation: Use `field=value` for equality, `field[gt]=value`, `field[lt]=value`, `field[like]=value` for other operators. Alternative: `filter=field>value` as single param.

## Sources

### Primary (HIGH confidence)
- [PocketBase API Records Documentation](https://pocketbase.io/docs/api-records/) - Filter, sort, pagination, expand syntax
- [PocketBase API Rules and Filters](https://pocketbase.io/docs/api-rules-and-filters/) - Complete operator list
- [OWASP SQL Injection Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html) - Parameterized queries, whitelist validation
- [Bun URL searchParams reference](https://bun.com/reference/node/url/URL/searchParams) - URLSearchParams API
- Existing codebase: `src/core/records.ts`, `src/core/schema.ts`, `src/api/server.ts`

### Secondary (MEDIUM confidence)
- [SQLite Query Optimizer Overview](https://sqlite.org/optoverview.html) - Indexing and ORDER BY optimization
- [Kysely TypeScript Query Builder](https://github.com/kysely-org/kysely) - Patterns for type-safe dynamic SQL (not used, but informed design)

### Tertiary (LOW confidence)
- WebSearch results on TypeScript query builders - General ecosystem awareness

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Using built-in Bun/Web APIs per project constraints
- Architecture: HIGH - Patterns are straightforward, match existing codebase style
- Pitfalls: HIGH - SQL injection prevention is well-documented, pagination patterns are standard
- Filter syntax: MEDIUM - Simple approach works, complex expressions may need revision

**Research date:** 2026-01-25
**Valid until:** 60 days (stable patterns, no fast-moving dependencies)
