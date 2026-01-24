import { generateId } from "../utils/id.ts";

/**
 * System fields automatically added to every record.
 * These are not user-defined and are managed by BunBase.
 */
export interface SystemFields {
  /** Unique identifier for this record */
  id: string;
  /** When this record was created (ISO 8601) */
  created_at: string;
  /** When this record was last updated (ISO 8601) */
  updated_at: string;
}

/**
 * A record in a collection, combining system fields with user-defined fields.
 * @template T - The type of user-defined fields
 */
export type Record<T extends object = object> = SystemFields & T;

/**
 * Create system fields for a new record.
 * Generates a new ID and sets created_at/updated_at to current time.
 */
export function createSystemFields(): SystemFields {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    created_at: now,
    updated_at: now,
  };
}
