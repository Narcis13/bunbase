/**
 * Supported field types in BunBase collections.
 */
export type FieldType =
  | "text"
  | "number"
  | "boolean"
  | "datetime"
  | "json"
  | "relation";

/**
 * Type-specific options for fields.
 * Currently used for relation fields to specify the target collection.
 */
export interface FieldOptions {
  /** For relation fields: the target collection name (alias: target) */
  collection?: string;
  /** For relation fields: the target collection ID or name (alias: collection) */
  target?: string;
  /** For text fields: maximum length */
  maxLength?: number;
  /** For number fields: minimum value */
  min?: number;
  /** For number fields: maximum value */
  max?: number;
}

/**
 * A field definition within a collection.
 */
export interface Field {
  /** Unique identifier for this field */
  id: string;
  /** ID of the collection this field belongs to */
  collection_id: string;
  /** Field name (unique within collection) */
  name: string;
  /** Field type */
  type: FieldType;
  /** Whether this field is required */
  required: boolean;
  /** Type-specific options */
  options: FieldOptions | null;
  /** When this field was created (ISO 8601) */
  created_at: string;
}

/**
 * Collection type: 'base' for regular collections, 'auth' for user auth collections.
 */
export type CollectionType = "base" | "auth";

/**
 * Access control rules for collection operations.
 * null = locked (admin only), '' = public, string = filter expression
 */
export interface CollectionRules {
  listRule: string | null;
  viewRule: string | null;
  createRule: string | null;
  updateRule: string | null;
  deleteRule: string | null;
}

/**
 * A collection definition.
 */
export interface Collection {
  /** Unique identifier for this collection */
  id: string;
  /** Collection name (unique across all collections) */
  name: string;
  /** Collection type: 'base' or 'auth' */
  type: CollectionType;
  /** JSON-encoded options (e.g., AuthCollectionOptions for auth collections) */
  options: string | null;
  /** Access control rules for collection operations */
  rules: CollectionRules | null;
  /** When this collection was created (ISO 8601) */
  created_at: string;
  /** When this collection was last updated (ISO 8601) */
  updated_at: string;
}

/**
 * Mapping from FieldType to SQLite column types.
 * Used when generating CREATE TABLE statements.
 */
export const FIELD_TYPE_MAP: Record<FieldType, string> = {
  text: "TEXT",
  number: "REAL",
  boolean: "INTEGER", // 0/1 in SQLite
  datetime: "TEXT", // ISO 8601 string
  json: "TEXT", // JSON stringified
  relation: "TEXT", // Foreign ID
} as const;

/**
 * System fields automatically added to auth collections.
 * These are added to the SQL table and should not be defined by users.
 */
export const AUTH_SYSTEM_FIELDS = [
  "email",
  "password_hash",
  "verified",
] as const;
