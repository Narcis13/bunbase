/**
 * Query builder module for constructing parameterized SQL queries.
 *
 * This module transforms structured query options (filter, sort, pagination)
 * into safe, parameterized SQL. Field names are validated against a whitelist
 * to prevent SQL injection.
 */

import type { Field } from "../types/collection.ts";
import type {
  QueryOptions,
  FilterCondition,
  SortOption,
  FilterOperator,
} from "../types/query.ts";

/** System fields that are always valid for filtering/sorting */
const SYSTEM_FIELDS = ["id", "created_at", "updated_at"];

/** Reserved query parameters that should not be treated as filters */
const RESERVED_PARAMS = ["page", "perPage", "sort", "expand"];

/**
 * Parse query options from a URL's search parameters.
 *
 * @param url - URL to parse query parameters from
 * @returns Parsed query options
 */
export function parseQueryOptions(url: URL): QueryOptions {
  const options: QueryOptions = {
    filter: [],
  };

  // Parse pagination
  const pageParam = url.searchParams.get("page");
  const perPageParam = url.searchParams.get("perPage");

  options.page = pageParam ? parseInt(pageParam, 10) : 1;
  options.perPage = perPageParam ? parseInt(perPageParam, 10) : 30;

  // Enforce bounds
  if (options.page < 1) options.page = 1;
  if (options.perPage < 1) options.perPage = 1;
  if (options.perPage > 500) options.perPage = 500;

  // Parse sort: "-created_at,title" => [{ field: "created_at", direction: "desc" }, { field: "title", direction: "asc" }]
  const sortParam = url.searchParams.get("sort");
  if (sortParam) {
    options.sort = sortParam.split(",").map((s) => {
      const trimmed = s.trim();
      if (trimmed.startsWith("-")) {
        return { field: trimmed.slice(1), direction: "desc" as const };
      } else if (trimmed.startsWith("+")) {
        return { field: trimmed.slice(1), direction: "asc" as const };
      }
      return { field: trimmed, direction: "asc" as const };
    });
  }

  // Parse expand: "author,category" => ["author", "category"]
  const expandParam = url.searchParams.get("expand");
  if (expandParam) {
    options.expand = expandParam.split(",").map((e) => e.trim());
  }

  // Parse filter conditions from remaining parameters
  for (const [key, value] of url.searchParams.entries()) {
    if (RESERVED_PARAMS.includes(key)) continue;

    // Parse operator from key
    // Supports: field=value, field>=value, field<=value, field>value, field<value
    // Supports: field!=value, field~=value (like), field!~=value (not like)
    let field: string;
    let operator: FilterOperator = "=";

    // Check for operator suffixes
    if (key.endsWith(">=")) {
      field = key.slice(0, -2);
      operator = ">=";
    } else if (key.endsWith("<=")) {
      field = key.slice(0, -2);
      operator = "<=";
    } else if (key.endsWith("!=")) {
      field = key.slice(0, -2);
      operator = "!=";
    } else if (key.endsWith("!~")) {
      field = key.slice(0, -2);
      operator = "!~";
    } else if (key.endsWith("~")) {
      field = key.slice(0, -1);
      operator = "~";
    } else if (key.endsWith(">")) {
      field = key.slice(0, -1);
      operator = ">";
    } else if (key.endsWith("<")) {
      field = key.slice(0, -1);
      operator = "<";
    } else if (key.endsWith("!")) {
      // Handle != operator (URL splits on =, so title!=value becomes key=title!, value=value)
      field = key.slice(0, -1);
      operator = "!=";
    } else {
      field = key;
      operator = "=";
    }

    // Validate field name format (basic alphanumeric with underscore)
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field)) {
      options.filter!.push({ field, operator, value });
    }
  }

  return options;
}

/**
 * Validate that a field name exists in the schema or is a system field.
 *
 * @param fieldName - Field name to validate
 * @param fields - Array of field definitions from schema
 * @returns True if field is valid, false otherwise
 */
export function validateFieldName(fieldName: string, fields: Field[]): boolean {
  // Check for empty string
  if (!fieldName) return false;

  // System fields are always valid
  if (SYSTEM_FIELDS.includes(fieldName)) return true;

  // Check against schema fields
  return fields.some((f) => f.name === fieldName);
}

/**
 * Escape special LIKE characters in a search value.
 *
 * @param value - Value to escape
 * @returns Escaped value safe for LIKE queries
 */
function escapeLikeValue(value: string): string {
  // Escape backslash first (since we use it as escape char)
  // Then escape % and _
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * Build a WHERE clause from filter conditions.
 *
 * @param conditions - Array of filter conditions
 * @param fields - Array of field definitions for validation
 * @returns Object with SQL string and params object
 * @throws Error if any field name is invalid
 */
export function buildWhereClause(
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

    // Validate field name
    if (!validateFieldName(field, fields)) {
      throw new Error(`Invalid filter field: "${field}"`);
    }

    const paramName = `filter_${i}`;

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
      case ">=":
        clauses.push(`"${field}" >= $${paramName}`);
        params[paramName] = value;
        break;
      case "<=":
        clauses.push(`"${field}" <= $${paramName}`);
        params[paramName] = value;
        break;
      case "~":
        // LIKE with wildcards, escape special characters
        clauses.push(`"${field}" LIKE $${paramName} ESCAPE '\\'`);
        params[paramName] = `%${escapeLikeValue(String(value))}%`;
        break;
      case "!~":
        // NOT LIKE with wildcards
        clauses.push(`"${field}" NOT LIKE $${paramName} ESCAPE '\\'`);
        params[paramName] = `%${escapeLikeValue(String(value))}%`;
        break;
    }
  }

  return {
    sql: `WHERE ${clauses.join(" AND ")}`,
    params,
  };
}

/**
 * Build an ORDER BY clause from sort options.
 *
 * @param sort - Array of sort options
 * @param fields - Array of field definitions for validation
 * @returns ORDER BY SQL string or empty string if no sort options
 * @throws Error if any field name is invalid
 */
export function buildOrderByClause(sort: SortOption[], fields: Field[]): string {
  if (sort.length === 0) {
    return "";
  }

  // Validate all field names first
  for (const s of sort) {
    if (!validateFieldName(s.field, fields)) {
      throw new Error(`Invalid sort field: "${s.field}"`);
    }
  }

  const orderParts = sort.map(
    (s) => `"${s.field}" ${s.direction.toUpperCase()}`
  );

  return `ORDER BY ${orderParts.join(", ")}`;
}

/**
 * Build a LIMIT/OFFSET clause for pagination.
 *
 * @param page - Page number (1-indexed)
 * @param perPage - Items per page
 * @returns Object with SQL string and calculated offset
 */
export function buildPaginationClause(
  page: number,
  perPage: number
): { sql: string; offset: number } {
  const offset = (page - 1) * perPage;

  return {
    sql: `LIMIT ${perPage} OFFSET ${offset}`,
    offset,
  };
}

/**
 * Build complete SELECT and COUNT queries for listing records.
 *
 * @param collectionName - Name of the collection to query
 * @param options - Query options (filter, sort, pagination)
 * @param fields - Array of field definitions for validation
 * @returns Object with data SQL, count SQL, and params
 * @throws Error if any field name is invalid
 */
export function buildListQuery(
  collectionName: string,
  options: QueryOptions,
  fields: Field[]
): { sql: string; countSql: string; params: Record<string, unknown> } {
  // Build WHERE clause
  const whereResult = buildWhereClause(options.filter || [], fields);

  // Validate and build ORDER BY clause
  // Note: validation happens inside buildOrderByClause but we need to do it
  // before calling to get better error messages
  if (options.sort) {
    for (const s of options.sort) {
      if (!validateFieldName(s.field, fields)) {
        throw new Error(`Invalid sort field: "${s.field}"`);
      }
    }
  }
  const orderBy = buildOrderByClause(options.sort || [], fields);

  // Build pagination
  const page = options.page || 1;
  const perPage = options.perPage || 30;
  const pagination = buildPaginationClause(page, perPage);

  // Assemble queries
  const baseFrom = `FROM "${collectionName}"`;

  // Count query doesn't need ORDER BY or LIMIT
  const countSql = `SELECT COUNT(*) as count ${baseFrom}${whereResult.sql ? " " + whereResult.sql : ""}`;

  // Data query includes all clauses
  const sqlParts = [`SELECT * ${baseFrom}`];
  if (whereResult.sql) sqlParts.push(whereResult.sql);
  if (orderBy) sqlParts.push(orderBy);
  sqlParts.push(pagination.sql);

  return {
    sql: sqlParts.join(" "),
    countSql,
    params: whereResult.params,
  };
}
