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
import type { SqlFilter } from "../auth/rules.ts";
import { parseFilterExpression } from "./filter-parser.ts";

/** System fields that are always valid for filtering/sorting */
const SYSTEM_FIELDS = ["id", "created_at", "updated_at"];

/** Reserved query parameters that should not be treated as filters */
const RESERVED_PARAMS = ["page", "perPage", "sort", "expand", "search", "filter"];

/** Field types whose values are stored as text and are meaningful to search */
const SEARCHABLE_FIELD_TYPES = new Set(["text", "datetime"]);

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

  const parsedPage = pageParam ? parseInt(pageParam, 10) : 1;
  const parsedPerPage = perPageParam ? parseInt(perPageParam, 10) : 30;

  // Fall back to defaults for non-numeric inputs (parseInt returns NaN for "abc")
  options.page = Number.isFinite(parsedPage) ? parsedPage : 1;
  options.perPage = Number.isFinite(parsedPerPage) ? parsedPerPage : 30;

  // Clamp to bounds (silently, consistent with PocketBase behavior)
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

  // Parse cross-field search term
  const searchParam = url.searchParams.get("search");
  if (searchParam) {
    options.search = searchParam;
  }

  // Parse filter expression (supports && and || operators)
  const filterParam = url.searchParams.get("filter");
  if (filterParam) {
    options.filterExpr = filterParam;
  }

  // Parse filter conditions from remaining parameters
  for (const [key, value] of url.searchParams.entries()) {
    if (RESERVED_PARAMS.includes(key)) continue;

    // Parse operator from key
    // Supports: field=value, field>=value, field<=value, field>value, field<value
    // Supports: field!=value, field~=value (like), field!~=value (not like)
    //
    // URL encoding variants for != :
    //   field!=value  → URL splits on =, key="field!", value="value"
    //   field%21=value → %21 decodes to !, key="field!", value="value"  (same)
    //   field%21%3Dvalue → both encoded, key="field!=value", value="" (handled below)
    let field: string;
    let operator: FilterOperator = "=";
    let filterValue: string = value;

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
    } else if (key.includes("!=")) {
      // Handle fully percent-encoded != (field%21%3Dvalue → key="field!=value", value="")
      // The value is embedded in the key after !=
      const idx = key.indexOf("!=");
      field = key.slice(0, idx);
      operator = "!=";
      filterValue = key.slice(idx + 2);
    } else {
      field = key;
      operator = "=";
    }

    // Validate field name format (basic alphanumeric with underscore)
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field)) {
      options.filter!.push({ field, operator, value: filterValue });
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
 * Build a cross-field search clause that OR-matches a term across all
 * text/datetime fields and the system `id` field.
 *
 * @param searchTerm - The term to search for
 * @param fields - Field definitions for the collection
 * @returns Object with SQL fragment (no WHERE keyword) and params, or null if not applicable
 */
export function buildSearchClause(
  searchTerm: string,
  fields: Field[]
): { sql: string; params: Record<string, unknown> } | null {
  if (!searchTerm) return null;

  const searchableFieldNames = [
    "id",
    ...fields.filter((f) => SEARCHABLE_FIELD_TYPES.has(f.type)).map((f) => f.name),
  ];

  const clauses = searchableFieldNames.map((name) => `"${name}" LIKE $search`);
  const escapedTerm = `%${escapeLikeValue(searchTerm)}%`;

  return {
    sql: `(${clauses.join(" OR ")})`,
    params: { search: escapedTerm },
  };
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

    // Coerce value for boolean fields: "true"/"false" → 1/0 (SQLite stores booleans as integers)
    const fieldDef = fields.find((f) => f.name === field);
    const coercedValue =
      fieldDef?.type === "boolean" && typeof value === "string"
        ? value === "true" || value === "1"
          ? 1
          : value === "false" || value === "0"
          ? 0
          : value
        : value;

    const paramName = `filter_${i}`;

    switch (operator) {
      case "=":
        clauses.push(`"${field}" = $${paramName}`);
        params[paramName] = coercedValue;
        break;
      case "!=":
        clauses.push(`"${field}" != $${paramName}`);
        params[paramName] = coercedValue;
        break;
      case ">":
        clauses.push(`"${field}" > $${paramName}`);
        params[paramName] = coercedValue;
        break;
      case "<":
        clauses.push(`"${field}" < $${paramName}`);
        params[paramName] = coercedValue;
        break;
      case ">=":
        clauses.push(`"${field}" >= $${paramName}`);
        params[paramName] = coercedValue;
        break;
      case "<=":
        clauses.push(`"${field}" <= $${paramName}`);
        params[paramName] = coercedValue;
        break;
      case "~":
        // LIKE with wildcards, escape special characters
        clauses.push(`"${field}" LIKE $${paramName} ESCAPE '\\'`);
        params[paramName] = `%${escapeLikeValue(String(coercedValue))}%`;
        break;
      case "!~":
        // NOT LIKE with wildcards
        clauses.push(`"${field}" NOT LIKE $${paramName} ESCAPE '\\'`);
        params[paramName] = `%${escapeLikeValue(String(coercedValue))}%`;
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
  fields: Field[],
  ruleFilter?: SqlFilter
): { sql: string; countSql: string; params: Record<string, unknown> } {
  // Build WHERE clause from user-provided filters
  const whereResult = buildWhereClause(options.filter || [], fields);

  // Build cross-field search clause if search term provided
  const searchResult = options.search
    ? buildSearchClause(options.search, fields)
    : null;

  // Parse filter expression (supports && and || operators)
  const filterExprResult = options.filterExpr
    ? parseFilterExpression(options.filterExpr, fields)
    : null;

  // Merge all conditions: field filters, filter expression, search, and rule filter
  const mergedParams = {
    ...whereResult.params,
    ...(filterExprResult?.params ?? {}),
    ...(searchResult?.params ?? {}),
    ...(ruleFilter?.params ?? {}),
  };
  let mergedWhere = '';
  const userConds = whereResult.sql ? whereResult.sql.slice(6) : ''; // strip leading "WHERE "
  const filterExprConds = filterExprResult?.sql ?? '';
  const searchConds = searchResult?.sql ?? '';
  const ruleConds = ruleFilter?.sql ?? '';

  const allConds = [userConds, filterExprConds, searchConds, ruleConds].filter(Boolean);
  if (allConds.length === 1) {
    mergedWhere = `WHERE ${allConds[0]}`;
  } else if (allConds.length > 1) {
    mergedWhere = `WHERE ${allConds.map((c) => `(${c})`).join(" AND ")}`;
  }

  // Validate and build ORDER BY clause
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
  const countSql = `SELECT COUNT(*) as count ${baseFrom}${mergedWhere ? " " + mergedWhere : ""}`;

  // Data query includes all clauses
  const sqlParts = [`SELECT * ${baseFrom}`];
  if (mergedWhere) sqlParts.push(mergedWhere);
  if (orderBy) sqlParts.push(orderBy);
  sqlParts.push(pagination.sql);

  return {
    sql: sqlParts.join(" "),
    countSql,
    params: mergedParams,
  };
}
