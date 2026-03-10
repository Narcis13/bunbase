import { describe, test, expect } from "bun:test";
import { parseFilterExpression } from "./filter-parser.ts";
import type { Field } from "../types/collection.ts";

const fields: Field[] = [
  { id: "f1", collection_id: "c1", name: "title",     type: "text",     required: true,  options: null, created_at: "2025-01-01T00:00:00Z" },
  { id: "f2", collection_id: "c1", name: "status",    type: "text",     required: false, options: null, created_at: "2025-01-01T00:00:00Z" },
  { id: "f3", collection_id: "c1", name: "views",     type: "number",   required: false, options: null, created_at: "2025-01-01T00:00:00Z" },
  { id: "f4", collection_id: "c1", name: "published", type: "boolean",  required: false, options: null, created_at: "2025-01-01T00:00:00Z" },
  { id: "f5", collection_id: "c1", name: "score",     type: "number",   required: false, options: null, created_at: "2025-01-01T00:00:00Z" },
];

// =============================================================================
// Simple conditions
// =============================================================================

describe("parseFilterExpression - simple conditions", () => {
  test("equality with single-quoted string", () => {
    const { sql, params } = parseFilterExpression("status='active'", fields);
    expect(sql).toBe('"status" = $fe_0');
    expect(params).toEqual({ fe_0: "active" });
  });

  test("equality with double-quoted string", () => {
    const { sql, params } = parseFilterExpression('status="active"', fields);
    expect(sql).toBe('"status" = $fe_0');
    expect(params).toEqual({ fe_0: "active" });
  });

  test("not-equal operator", () => {
    const { sql, params } = parseFilterExpression("status!='deleted'", fields);
    expect(sql).toBe('"status" != $fe_0');
    expect(params).toEqual({ fe_0: "deleted" });
  });

  test("greater-than with number", () => {
    const { sql, params } = parseFilterExpression("views>100", fields);
    expect(sql).toBe('"views" > $fe_0');
    expect(params).toEqual({ fe_0: 100 });
  });

  test("less-than with number", () => {
    const { sql, params } = parseFilterExpression("views<50", fields);
    expect(sql).toBe('"views" < $fe_0');
    expect(params).toEqual({ fe_0: 50 });
  });

  test("greater-than-or-equal", () => {
    const { sql, params } = parseFilterExpression("views>=100", fields);
    expect(sql).toBe('"views" >= $fe_0');
    expect(params).toEqual({ fe_0: 100 });
  });

  test("less-than-or-equal", () => {
    const { sql, params } = parseFilterExpression("views<=50", fields);
    expect(sql).toBe('"views" <= $fe_0');
    expect(params).toEqual({ fe_0: 50 });
  });

  test("LIKE operator", () => {
    const { sql, params } = parseFilterExpression("title~'hello'", fields);
    expect(sql).toBe(`"title" LIKE $fe_0 ESCAPE '\\'`);
    expect(params).toEqual({ fe_0: "%hello%" });
  });

  test("NOT LIKE operator", () => {
    const { sql, params } = parseFilterExpression("title!~'spam'", fields);
    expect(sql).toBe(`"title" NOT LIKE $fe_0 ESCAPE '\\'`);
    expect(params).toEqual({ fe_0: "%spam%" });
  });

  test("null value", () => {
    const { sql, params } = parseFilterExpression("status=null", fields);
    expect(sql).toBe('"status" = $fe_0');
    expect(params).toEqual({ fe_0: null });
  });

  test("boolean true value", () => {
    const { sql, params } = parseFilterExpression("published=true", fields);
    expect(sql).toBe('"published" = $fe_0');
    expect(params).toEqual({ fe_0: true });
  });

  test("boolean false value", () => {
    const { sql, params } = parseFilterExpression("published=false", fields);
    expect(sql).toBe('"published" = $fe_0');
    expect(params).toEqual({ fe_0: false });
  });

  test("negative number", () => {
    const { sql, params } = parseFilterExpression("score>=-10", fields);
    expect(sql).toBe('"score" >= $fe_0');
    expect(params).toEqual({ fe_0: -10 });
  });

  test("system field id", () => {
    const { sql, params } = parseFilterExpression("id='abc123'", fields);
    expect(sql).toBe('"id" = $fe_0');
    expect(params).toEqual({ fe_0: "abc123" });
  });

  test("system field created_at", () => {
    const { sql } = parseFilterExpression("created_at>='2025-01-01'", fields);
    expect(sql).toBe('"created_at" >= $fe_0');
  });

  test("spaces around operator are allowed", () => {
    const { sql, params } = parseFilterExpression("status = 'active'", fields);
    expect(sql).toBe('"status" = $fe_0');
    expect(params).toEqual({ fe_0: "active" });
  });

  test("escapes LIKE special characters", () => {
    const { params } = parseFilterExpression("title~'50%'", fields);
    expect(params.fe_0).toBe("%50\\%%");
  });
});

// =============================================================================
// AND logic
// =============================================================================

describe("parseFilterExpression - AND logic", () => {
  test("two conditions joined by &&", () => {
    const { sql, params } = parseFilterExpression(
      "status='active'&&views>100",
      fields
    );
    expect(sql).toBe('"status" = $fe_0 AND "views" > $fe_1');
    expect(params).toEqual({ fe_0: "active", fe_1: 100 });
  });

  test("three conditions joined by &&", () => {
    const { sql } = parseFilterExpression(
      "status='active'&&views>10&&published=true",
      fields
    );
    expect(sql).toBe('"status" = $fe_0 AND "views" > $fe_1 AND "published" = $fe_2');
  });
});

// =============================================================================
// OR logic
// =============================================================================

describe("parseFilterExpression - OR logic", () => {
  test("two conditions joined by ||", () => {
    const { sql, params } = parseFilterExpression(
      "status='active'||status='draft'",
      fields
    );
    expect(sql).toBe('"status" = $fe_0 OR "status" = $fe_1');
    expect(params).toEqual({ fe_0: "active", fe_1: "draft" });
  });

  test("three conditions joined by ||", () => {
    const { sql } = parseFilterExpression(
      "status='a'||status='b'||status='c'",
      fields
    );
    expect(sql).toBe('"status" = $fe_0 OR "status" = $fe_1 OR "status" = $fe_2');
  });
});

// =============================================================================
// Mixed AND/OR with grouping
// =============================================================================

describe("parseFilterExpression - mixed AND/OR", () => {
  test("OR inside AND (with parens)", () => {
    const { sql } = parseFilterExpression(
      "(status='active'||status='draft')&&views>100",
      fields
    );
    // The OR group gets wrapped in parens when inside AND
    expect(sql).toBe('("status" = $fe_0 OR "status" = $fe_1) AND "views" > $fe_2');
  });

  test("AND takes precedence over OR without parens", () => {
    // a || b && c → a || (b AND c) due to precedence
    const { sql } = parseFilterExpression(
      "status='a'||status='b'&&views>0",
      fields
    );
    expect(sql).toBe('"status" = $fe_0 OR "status" = $fe_1 AND "views" > $fe_2');
  });

  test("nested groups", () => {
    const { sql } = parseFilterExpression(
      "(status='active'||status='draft')&&(views>10||score>=5)",
      fields
    );
    expect(sql).toContain("OR");
    expect(sql).toContain("AND");
    expect(sql).toContain("(");
  });
});

// =============================================================================
// Error cases
// =============================================================================

describe("parseFilterExpression - errors", () => {
  test("throws for unknown field", () => {
    expect(() => parseFilterExpression("nonexistent='x'", fields)).toThrow(
      'Invalid filter field: "nonexistent"'
    );
  });

  test("throws for empty expression", () => {
    expect(() => parseFilterExpression("", fields)).toThrow(
      "Empty filter expression"
    );
  });

  test("throws for unclosed parenthesis", () => {
    expect(() =>
      parseFilterExpression("(status='active'", fields)
    ).toThrow();
  });

  test("throws for missing value", () => {
    expect(() => parseFilterExpression("status=", fields)).toThrow();
  });

  test("throws for unknown character", () => {
    expect(() => parseFilterExpression("status@='x'", fields)).toThrow();
  });
});
