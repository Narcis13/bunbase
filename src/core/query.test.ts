import { describe, test, expect } from "bun:test";
import {
  parseQueryOptions,
  validateFieldName,
  buildWhereClause,
  buildOrderByClause,
  buildPaginationClause,
  buildListQuery,
} from "./query.ts";
import type { Field } from "../types/collection.ts";
import type { FilterCondition, SortOption } from "../types/query.ts";

// Mock fields for testing
const mockFields: Field[] = [
  {
    id: "f1",
    collection_id: "c1",
    name: "title",
    type: "text",
    required: true,
    options: null,
    created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: "f2",
    collection_id: "c1",
    name: "status",
    type: "text",
    required: false,
    options: null,
    created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: "f3",
    collection_id: "c1",
    name: "views",
    type: "number",
    required: false,
    options: null,
    created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: "f4",
    collection_id: "c1",
    name: "published",
    type: "boolean",
    required: false,
    options: null,
    created_at: "2025-01-01T00:00:00Z",
  },
  {
    id: "f5",
    collection_id: "c1",
    name: "author",
    type: "relation",
    required: false,
    options: { collection: "users" },
    created_at: "2025-01-01T00:00:00Z",
  },
];

// =============================================================================
// parseQueryOptions Tests
// =============================================================================

describe("parseQueryOptions", () => {
  test("parses empty URL with defaults", () => {
    const url = new URL("http://localhost/api/records");
    const options = parseQueryOptions(url);

    expect(options.page).toBe(1);
    expect(options.perPage).toBe(30);
    expect(options.filter).toEqual([]);
    expect(options.sort).toBeUndefined();
    expect(options.expand).toBeUndefined();
  });

  test("parses page and perPage", () => {
    const url = new URL("http://localhost/api/records?page=3&perPage=50");
    const options = parseQueryOptions(url);

    expect(options.page).toBe(3);
    expect(options.perPage).toBe(50);
  });

  test("enforces perPage min of 1", () => {
    const url = new URL("http://localhost/api/records?perPage=0");
    const options = parseQueryOptions(url);

    expect(options.perPage).toBe(1);
  });

  test("enforces perPage max of 500", () => {
    const url = new URL("http://localhost/api/records?perPage=1000");
    const options = parseQueryOptions(url);

    expect(options.perPage).toBe(500);
  });

  test("enforces page min of 1", () => {
    const url = new URL("http://localhost/api/records?page=0");
    const options = parseQueryOptions(url);

    expect(options.page).toBe(1);
  });

  test("parses sort with descending prefix", () => {
    const url = new URL("http://localhost/api/records?sort=-created_at");
    const options = parseQueryOptions(url);

    expect(options.sort).toEqual([
      { field: "created_at", direction: "desc" },
    ]);
  });

  test("parses sort with ascending prefix", () => {
    const url = new URL("http://localhost/api/records?sort=+title");
    const options = parseQueryOptions(url);

    expect(options.sort).toEqual([{ field: "title", direction: "asc" }]);
  });

  test("parses sort without prefix as ascending", () => {
    const url = new URL("http://localhost/api/records?sort=title");
    const options = parseQueryOptions(url);

    expect(options.sort).toEqual([{ field: "title", direction: "asc" }]);
  });

  test("parses multiple sort fields", () => {
    const url = new URL("http://localhost/api/records?sort=-created_at,title");
    const options = parseQueryOptions(url);

    expect(options.sort).toEqual([
      { field: "created_at", direction: "desc" },
      { field: "title", direction: "asc" },
    ]);
  });

  test("parses expand parameter", () => {
    const url = new URL("http://localhost/api/records?expand=author,category");
    const options = parseQueryOptions(url);

    expect(options.expand).toEqual(["author", "category"]);
  });

  test("parses simple equality filter", () => {
    const url = new URL("http://localhost/api/records?status=active");
    const options = parseQueryOptions(url);

    expect(options.filter).toEqual([
      { field: "status", operator: "=", value: "active" },
    ]);
  });

  test("parses filter with greater-than operator suffix", () => {
    // URL parsing splits on =, so views>=100 becomes key="views>" value="100"
    const url = new URL("http://localhost/api/records?views>=100");
    const options = parseQueryOptions(url);

    expect(options.filter).toContainEqual({
      field: "views",
      operator: ">",
      value: "100",
    });
  });

  test("parses like filter operator", () => {
    // URL parsing splits on =, so title~=hello becomes key="title~" value="hello"
    const url = new URL("http://localhost/api/records?title~=hello");
    const options = parseQueryOptions(url);

    expect(options.filter).toContainEqual({
      field: "title",
      operator: "~",
      value: "hello",
    });
  });

  test("ignores reserved params in filter", () => {
    const url = new URL(
      "http://localhost/api/records?page=1&perPage=10&sort=title&expand=author&status=active"
    );
    const options = parseQueryOptions(url);

    // Should only have status in filter, not page/perPage/sort/expand
    expect(options.filter?.length).toBe(1);
    expect(options.filter?.[0].field).toBe("status");
  });
});

// =============================================================================
// validateFieldName Tests
// =============================================================================

describe("validateFieldName", () => {
  test("returns true for system field: id", () => {
    expect(validateFieldName("id", mockFields)).toBe(true);
  });

  test("returns true for system field: created_at", () => {
    expect(validateFieldName("created_at", mockFields)).toBe(true);
  });

  test("returns true for system field: updated_at", () => {
    expect(validateFieldName("updated_at", mockFields)).toBe(true);
  });

  test("returns true for schema field", () => {
    expect(validateFieldName("title", mockFields)).toBe(true);
    expect(validateFieldName("status", mockFields)).toBe(true);
    expect(validateFieldName("views", mockFields)).toBe(true);
  });

  test("returns false for non-existent field", () => {
    expect(validateFieldName("nonexistent", mockFields)).toBe(false);
  });

  test("returns false for empty string", () => {
    expect(validateFieldName("", mockFields)).toBe(false);
  });

  test("returns false for SQL injection attempt", () => {
    expect(validateFieldName("id; DROP TABLE", mockFields)).toBe(false);
    expect(validateFieldName("1=1--", mockFields)).toBe(false);
  });
});

// =============================================================================
// buildWhereClause Tests
// =============================================================================

describe("buildWhereClause", () => {
  test("returns empty for no conditions", () => {
    const result = buildWhereClause([], mockFields);

    expect(result.sql).toBe("");
    expect(result.params).toEqual({});
  });

  test("builds single equality condition", () => {
    const conditions: FilterCondition[] = [
      { field: "status", operator: "=", value: "active" },
    ];
    const result = buildWhereClause(conditions, mockFields);

    expect(result.sql).toBe('WHERE "status" = $filter_0');
    expect(result.params).toEqual({ filter_0: "active" });
  });

  test("builds not-equal condition", () => {
    const conditions: FilterCondition[] = [
      { field: "status", operator: "!=", value: "deleted" },
    ];
    const result = buildWhereClause(conditions, mockFields);

    expect(result.sql).toBe('WHERE "status" != $filter_0');
    expect(result.params).toEqual({ filter_0: "deleted" });
  });

  test("builds greater-than condition", () => {
    const conditions: FilterCondition[] = [
      { field: "views", operator: ">", value: 100 },
    ];
    const result = buildWhereClause(conditions, mockFields);

    expect(result.sql).toBe('WHERE "views" > $filter_0');
    expect(result.params).toEqual({ filter_0: 100 });
  });

  test("builds less-than condition", () => {
    const conditions: FilterCondition[] = [
      { field: "views", operator: "<", value: 50 },
    ];
    const result = buildWhereClause(conditions, mockFields);

    expect(result.sql).toBe('WHERE "views" < $filter_0');
    expect(result.params).toEqual({ filter_0: 50 });
  });

  test("builds greater-than-or-equal condition", () => {
    const conditions: FilterCondition[] = [
      { field: "views", operator: ">=", value: 100 },
    ];
    const result = buildWhereClause(conditions, mockFields);

    expect(result.sql).toBe('WHERE "views" >= $filter_0');
    expect(result.params).toEqual({ filter_0: 100 });
  });

  test("builds less-than-or-equal condition", () => {
    const conditions: FilterCondition[] = [
      { field: "views", operator: "<=", value: 50 },
    ];
    const result = buildWhereClause(conditions, mockFields);

    expect(result.sql).toBe('WHERE "views" <= $filter_0');
    expect(result.params).toEqual({ filter_0: 50 });
  });

  test("builds LIKE condition with wildcards", () => {
    const conditions: FilterCondition[] = [
      { field: "title", operator: "~", value: "hello" },
    ];
    const result = buildWhereClause(conditions, mockFields);

    expect(result.sql).toBe('WHERE "title" LIKE $filter_0 ESCAPE \'\\\'');
    expect(result.params).toEqual({ filter_0: "%hello%" });
  });

  test("builds NOT LIKE condition", () => {
    const conditions: FilterCondition[] = [
      { field: "title", operator: "!~", value: "test" },
    ];
    const result = buildWhereClause(conditions, mockFields);

    expect(result.sql).toBe('WHERE "title" NOT LIKE $filter_0 ESCAPE \'\\\'');
    expect(result.params).toEqual({ filter_0: "%test%" });
  });

  test("escapes special characters in LIKE value", () => {
    const conditions: FilterCondition[] = [
      { field: "title", operator: "~", value: "100%" },
    ];
    const result = buildWhereClause(conditions, mockFields);

    // % should be escaped as \%
    expect(result.params.filter_0).toBe("%100\\%%");
  });

  test("escapes underscore in LIKE value", () => {
    const conditions: FilterCondition[] = [
      { field: "title", operator: "~", value: "user_name" },
    ];
    const result = buildWhereClause(conditions, mockFields);

    // _ should be escaped as \_
    expect(result.params.filter_0).toBe("%user\\_name%");
  });

  test("builds multiple conditions with AND", () => {
    const conditions: FilterCondition[] = [
      { field: "status", operator: "=", value: "active" },
      { field: "views", operator: ">", value: 10 },
    ];
    const result = buildWhereClause(conditions, mockFields);

    expect(result.sql).toBe(
      'WHERE "status" = $filter_0 AND "views" > $filter_1'
    );
    expect(result.params).toEqual({ filter_0: "active", filter_1: 10 });
  });

  test("works with system field: id", () => {
    const conditions: FilterCondition[] = [
      { field: "id", operator: "=", value: "abc123" },
    ];
    const result = buildWhereClause(conditions, mockFields);

    expect(result.sql).toBe('WHERE "id" = $filter_0');
    expect(result.params).toEqual({ filter_0: "abc123" });
  });

  test("works with system field: created_at", () => {
    const conditions: FilterCondition[] = [
      { field: "created_at", operator: ">", value: "2025-01-01T00:00:00Z" },
    ];
    const result = buildWhereClause(conditions, mockFields);

    expect(result.sql).toBe('WHERE "created_at" > $filter_0');
    expect(result.params).toEqual({ filter_0: "2025-01-01T00:00:00Z" });
  });

  test("throws for invalid field name", () => {
    const conditions: FilterCondition[] = [
      { field: "nonexistent", operator: "=", value: "test" },
    ];

    expect(() => buildWhereClause(conditions, mockFields)).toThrow(
      'Invalid filter field: "nonexistent"'
    );
  });

  test("throws for SQL injection in field name", () => {
    const conditions: FilterCondition[] = [
      { field: "id; DROP TABLE users", operator: "=", value: "test" },
    ];

    expect(() => buildWhereClause(conditions, mockFields)).toThrow(
      "Invalid filter field"
    );
  });

  test("handles null value", () => {
    const conditions: FilterCondition[] = [
      { field: "status", operator: "=", value: null },
    ];
    const result = buildWhereClause(conditions, mockFields);

    expect(result.sql).toBe('WHERE "status" = $filter_0');
    expect(result.params).toEqual({ filter_0: null });
  });

  test("handles boolean value", () => {
    const conditions: FilterCondition[] = [
      { field: "published", operator: "=", value: true },
    ];
    const result = buildWhereClause(conditions, mockFields);

    expect(result.sql).toBe('WHERE "published" = $filter_0');
    expect(result.params).toEqual({ filter_0: true });
  });
});

// =============================================================================
// buildOrderByClause Tests
// =============================================================================

describe("buildOrderByClause", () => {
  test("returns empty string for no sort options", () => {
    const result = buildOrderByClause([], mockFields);
    expect(result).toBe("");
  });

  test("builds single ascending sort", () => {
    const sort: SortOption[] = [{ field: "title", direction: "asc" }];
    const result = buildOrderByClause(sort, mockFields);

    expect(result).toBe('ORDER BY "title" ASC');
  });

  test("builds single descending sort", () => {
    const sort: SortOption[] = [{ field: "created_at", direction: "desc" }];
    const result = buildOrderByClause(sort, mockFields);

    expect(result).toBe('ORDER BY "created_at" DESC');
  });

  test("builds multiple sort fields", () => {
    const sort: SortOption[] = [
      { field: "created_at", direction: "desc" },
      { field: "title", direction: "asc" },
    ];
    const result = buildOrderByClause(sort, mockFields);

    expect(result).toBe('ORDER BY "created_at" DESC, "title" ASC');
  });

  test("works with system field: id", () => {
    const sort: SortOption[] = [{ field: "id", direction: "asc" }];
    const result = buildOrderByClause(sort, mockFields);

    expect(result).toBe('ORDER BY "id" ASC');
  });

  test("works with system field: updated_at", () => {
    const sort: SortOption[] = [{ field: "updated_at", direction: "desc" }];
    const result = buildOrderByClause(sort, mockFields);

    expect(result).toBe('ORDER BY "updated_at" DESC');
  });

  test("throws for invalid field name", () => {
    const sort: SortOption[] = [{ field: "nonexistent", direction: "asc" }];

    expect(() => buildOrderByClause(sort, mockFields)).toThrow(
      'Invalid sort field: "nonexistent"'
    );
  });

  test("throws for SQL injection in field name", () => {
    const sort: SortOption[] = [
      { field: "id; DROP TABLE users", direction: "asc" },
    ];

    expect(() => buildOrderByClause(sort, mockFields)).toThrow(
      "Invalid sort field"
    );
  });
});

// =============================================================================
// buildPaginationClause Tests
// =============================================================================

describe("buildPaginationClause", () => {
  test("calculates page 1 offset as 0", () => {
    const result = buildPaginationClause(1, 30);

    expect(result.sql).toBe("LIMIT 30 OFFSET 0");
    expect(result.offset).toBe(0);
  });

  test("calculates page 2 offset correctly", () => {
    const result = buildPaginationClause(2, 30);

    expect(result.sql).toBe("LIMIT 30 OFFSET 30");
    expect(result.offset).toBe(30);
  });

  test("calculates page 3 with perPage 10", () => {
    const result = buildPaginationClause(3, 10);

    expect(result.sql).toBe("LIMIT 10 OFFSET 20");
    expect(result.offset).toBe(20);
  });

  test("handles page 1 with small perPage", () => {
    const result = buildPaginationClause(1, 5);

    expect(result.sql).toBe("LIMIT 5 OFFSET 0");
    expect(result.offset).toBe(0);
  });

  test("handles large page numbers", () => {
    const result = buildPaginationClause(100, 50);

    expect(result.sql).toBe("LIMIT 50 OFFSET 4950");
    expect(result.offset).toBe(4950);
  });
});

// =============================================================================
// buildListQuery Tests
// =============================================================================

describe("buildListQuery", () => {
  test("builds basic query without options", () => {
    const options = {};
    const result = buildListQuery("posts", options, mockFields);

    expect(result.sql).toContain('FROM "posts"');
    expect(result.sql).toContain("LIMIT");
    expect(result.countSql).toContain('SELECT COUNT(*) as count FROM "posts"');
    expect(result.params).toEqual({});
  });

  test("includes WHERE clause from filter", () => {
    const options = {
      filter: [{ field: "status", operator: "=" as const, value: "active" }],
    };
    const result = buildListQuery("posts", options, mockFields);

    expect(result.sql).toContain('WHERE "status" = $filter_0');
    expect(result.countSql).toContain('WHERE "status" = $filter_0');
    expect(result.params).toEqual({ filter_0: "active" });
  });

  test("includes ORDER BY clause from sort", () => {
    const options = {
      sort: [{ field: "created_at", direction: "desc" as const }],
    };
    const result = buildListQuery("posts", options, mockFields);

    expect(result.sql).toContain('ORDER BY "created_at" DESC');
    // COUNT query should NOT have ORDER BY (unnecessary)
    expect(result.countSql).not.toContain("ORDER BY");
  });

  test("includes LIMIT/OFFSET from pagination", () => {
    const options = {
      page: 2,
      perPage: 10,
    };
    const result = buildListQuery("posts", options, mockFields);

    expect(result.sql).toContain("LIMIT 10 OFFSET 10");
    // COUNT query should NOT have LIMIT/OFFSET
    expect(result.countSql).not.toContain("LIMIT");
  });

  test("combines filter, sort, and pagination", () => {
    const options = {
      filter: [{ field: "status", operator: "=" as const, value: "active" }],
      sort: [{ field: "created_at", direction: "desc" as const }],
      page: 2,
      perPage: 20,
    };
    const result = buildListQuery("posts", options, mockFields);

    expect(result.sql).toContain('WHERE "status" = $filter_0');
    expect(result.sql).toContain('ORDER BY "created_at" DESC');
    expect(result.sql).toContain("LIMIT 20 OFFSET 20");

    expect(result.countSql).toContain('WHERE "status" = $filter_0');
    expect(result.countSql).not.toContain("ORDER BY");
    expect(result.countSql).not.toContain("LIMIT");
  });

  test("uses default pagination when not specified", () => {
    const result = buildListQuery("posts", {}, mockFields);

    expect(result.sql).toContain("LIMIT 30 OFFSET 0");
  });

  test("validates filter field names", () => {
    const options = {
      filter: [{ field: "invalid", operator: "=" as const, value: "test" }],
    };

    expect(() => buildListQuery("posts", options, mockFields)).toThrow(
      'Invalid filter field: "invalid"'
    );
  });

  test("validates sort field names", () => {
    const options = {
      sort: [{ field: "invalid", direction: "asc" as const }],
    };

    expect(() => buildListQuery("posts", options, mockFields)).toThrow(
      'Invalid sort field: "invalid"'
    );
  });

  test("returns SELECT * for data query", () => {
    const result = buildListQuery("posts", {}, mockFields);

    expect(result.sql).toMatch(/^SELECT \* FROM/);
  });

  test("handles empty fields array with only system fields", () => {
    const options = {
      filter: [{ field: "id", operator: "=" as const, value: "abc" }],
      sort: [{ field: "created_at", direction: "desc" as const }],
    };
    const result = buildListQuery("posts", options, []);

    // Should work with system fields even when no schema fields
    expect(result.sql).toContain('WHERE "id" = $filter_0');
    expect(result.sql).toContain('ORDER BY "created_at" DESC');
  });
});
