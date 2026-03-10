/**
 * Relation expansion module for fetching related records inline.
 *
 * This module handles the "expand" query parameter functionality,
 * allowing clients to request related records in a single API call
 * rather than making multiple requests.
 */

import { getDatabase } from "./database.ts";
import { getCollection, getFields } from "./schema.ts";
import { evaluateRule, getRuleForOperation } from "../auth/rules.ts";
import type { Field } from "../types/collection.ts";
import type { AuthenticatedUser } from "../auth/middleware.ts";

interface ExpandAuthContext {
  isAdmin: boolean;
  user: AuthenticatedUser | null;
}

/**
 * Parse JSON fields from stored string format to objects.
 * Duplicated from records.ts to avoid circular dependency.
 *
 * @param fields - Array of field definitions
 * @param data - Raw record data from database
 * @returns Record with JSON fields parsed
 */
function parseJsonFields(
  fields: Field[],
  data: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...data };

  for (const field of fields) {
    if (field.type === "json" && typeof result[field.name] === "string") {
      try {
        result[field.name] = JSON.parse(result[field.name] as string);
      } catch {
        // If parsing fails, leave as-is
      }
    }
    // Also handle boolean fields (stored as 0/1 in SQLite)
    if (field.type === "boolean" && typeof result[field.name] === "number") {
      result[field.name] = result[field.name] === 1;
    }
  }

  return result;
}

/**
 * Expand relation fields on a set of records.
 *
 * For each requested relation field, fetches the related record and adds it
 * to an "expand" object on the record. Handles:
 * - Only relation fields that match the expand request
 * - Null/undefined relation values (skips gracefully)
 * - Missing target collection (skips gracefully, doesn't crash)
 * - Missing related record (skips gracefully, doesn't crash)
 * - Target collection access rules (skips gracefully if caller lacks view access)
 *
 * @param records - Array of records to expand
 * @param fields - Field definitions for the collection
 * @param expandFields - Array of field names to expand
 * @param authContext - Optional auth context used to enforce target collection view rules
 * @returns Records with expand object added where applicable
 */
export function expandRelations(
  records: Record<string, unknown>[],
  fields: Field[],
  expandFields: string[],
  authContext?: ExpandAuthContext
): Record<string, unknown>[] {
  if (!expandFields || expandFields.length === 0) {
    return records;
  }

  const db = getDatabase();

  // Filter to only relation fields that match expand request
  const relationFields = fields.filter(
    (f) => f.type === "relation" && expandFields.includes(f.name)
  );

  if (relationFields.length === 0) {
    return records;
  }

  // Process each record
  return records.map((record) => {
    const expand: Record<string, unknown> = {};
    let hasExpansions = false;

    for (const field of relationFields) {
      const relationId = record[field.name];

      // Skip null/undefined relation values
      if (relationId === null || relationId === undefined) {
        continue;
      }

      // Get target collection from field options
      const targetCollection = (field.options?.collection ||
        field.options?.target) as string | undefined;

      if (!targetCollection) {
        // Missing target collection configuration - skip gracefully
        continue;
      }

      // Check if target collection exists - skip gracefully if not
      const collection = getCollection(targetCollection);
      if (!collection) {
        continue;
      }

      // Enforce target collection view rule when authContext is provided.
      // Admins always pass; non-admins are denied if viewRule is null (locked).
      // Per-record rule expressions are evaluated after fetching below.
      if (authContext) {
        const viewRule = getRuleForOperation(collection.rules, 'view');
        // Quick pre-check: if rule is null and not admin → skip entirely
        if (viewRule === null && !authContext.isAdmin) {
          continue;
        }
      }

      // Fetch the related record
      try {
        const stmt = db.prepare(
          `SELECT * FROM "${targetCollection}" WHERE id = $id`
        );
        const relatedRecord = stmt.get({ id: relationId }) as Record<
          string,
          unknown
        > | null;

        if (relatedRecord) {
          // For expression-based view rules, evaluate with the related record as context.
          if (authContext) {
            const viewRule = getRuleForOperation(collection.rules, 'view');
            const allowed = evaluateRule(viewRule, {
              isAdmin: authContext.isAdmin,
              auth: authContext.user,
              record: relatedRecord,
            });
            if (!allowed) {
              // No access to this related record — skip gracefully
              continue;
            }
          }

          // Parse JSON/boolean fields on the related record
          const targetFields = getFields(targetCollection);
          expand[field.name] = parseJsonFields(targetFields, relatedRecord);
          hasExpansions = true;
        }
        // If related record not found, skip gracefully (don't add to expand)
      } catch {
        // Query failed - skip gracefully
        continue;
      }
    }

    // Only add expand object if there are expanded relations
    if (hasExpansions) {
      return { ...record, expand };
    }

    return record;
  });
}
