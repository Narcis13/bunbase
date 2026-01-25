/**
 * Filter operator types for query conditions.
 * - = : equals
 * - != : not equals
 * - > : greater than
 * - < : less than
 * - >= : greater than or equals
 * - <= : less than or equals
 * - ~ : contains (LIKE)
 * - !~ : not contains (NOT LIKE)
 */
export type FilterOperator = "=" | "!=" | ">" | "<" | ">=" | "<=" | "~" | "!~";

/**
 * A single filter condition for a query.
 */
export interface FilterCondition {
  /** Field name to filter on */
  field: string;
  /** Comparison operator */
  operator: FilterOperator;
  /** Value to compare against */
  value: string | number | boolean | null;
}

/**
 * Sort direction for ordering results.
 */
export type SortDirection = "asc" | "desc";

/**
 * A single sort option for ordering query results.
 */
export interface SortOption {
  /** Field name to sort by */
  field: string;
  /** Sort direction */
  direction: SortDirection;
}

/**
 * Query options for listing records with filtering, sorting, and pagination.
 */
export interface QueryOptions {
  /** Filter conditions (AND logic) */
  filter?: FilterCondition[];
  /** Sort options (applied in order) */
  sort?: SortOption[];
  /** Page number (1-indexed) */
  page?: number;
  /** Number of items per page (default 30, max 500, min 1) */
  perPage?: number;
  /** Relation fields to expand */
  expand?: string[];
}

/**
 * Paginated response wrapper for list queries.
 */
export interface PaginatedResponse<T> {
  /** Current page number (1-indexed) */
  page: number;
  /** Items per page */
  perPage: number;
  /** Total number of items matching the query */
  totalItems: number;
  /** Total number of pages */
  totalPages: number;
  /** Items on the current page */
  items: T[];
}
