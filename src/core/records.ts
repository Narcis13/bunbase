import { getDatabase } from "./database.ts";
import { generateId } from "../utils/id.ts";
import { createSystemFields } from "../types/record.ts";
import { getFields, getCollection } from "./schema.ts";
import { validateRecord, formatValidationErrors } from "./validation.ts";
import { buildListQuery } from "./query.ts";
import { expandRelations } from "./expand.ts";
import { HookManager } from "./hooks.ts";
import type { Field } from "../types/collection.ts";
import type { QueryOptions, PaginatedResponse } from "../types/query.ts";
import type {
  BeforeCreateContext,
  AfterCreateContext,
  BeforeUpdateContext,
  AfterUpdateContext,
  BeforeDeleteContext,
  AfterDeleteContext,
} from "../types/hooks.ts";

/**
 * Validate that relation fields reference existing records.
 *
 * @param fields - Array of field definitions
 * @param data - Record data to validate
 * @throws Error if any relation references a non-existent record
 */
function validateRelations(
  fields: Field[],
  data: Record<string, unknown>
): void {
  const db = getDatabase();

  for (const field of fields) {
    if (field.type !== "relation") continue;

    const value = data[field.name];
    if (value === null || value === undefined) continue;

    const targetCollection = (field.options?.collection ||
      field.options?.target) as string;
    if (!targetCollection) {
      throw new Error(
        `Relation field "${field.name}" missing target collection in options`
      );
    }

    // Check if target collection exists
    const collection = getCollection(targetCollection);
    if (!collection) {
      throw new Error(
        `Relation field "${field.name}" references non-existent collection "${targetCollection}"`
      );
    }

    // Check if referenced record exists
    const stmt = db.prepare(
      `SELECT id FROM "${targetCollection}" WHERE id = $id`
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exists = stmt.get({ id: value } as any);
    if (!exists) {
      throw new Error(
        `Related record "${value}" not found in collection "${targetCollection}"`
      );
    }
  }
}

/**
 * Parse JSON fields from stored string format to objects.
 *
 * @param fields - Array of field definitions
 * @param data - Raw record data from database
 * @returns Record with JSON fields parsed
 */
export function parseJsonFields(
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
 * Stringify JSON fields for storage.
 *
 * @param fields - Array of field definitions
 * @param data - Record data to prepare
 * @returns Record with JSON fields stringified
 */
function stringifyJsonFields(
  fields: Field[],
  data: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...data };

  for (const field of fields) {
    const value = result[field.name];
    if (field.type === "json" && value !== null && value !== undefined) {
      if (typeof value === "object") {
        result[field.name] = JSON.stringify(value);
      }
    }
    // Convert boolean to 0/1 for SQLite
    if (field.type === "boolean" && typeof value === "boolean") {
      result[field.name] = value ? 1 : 0;
    }
  }

  return result;
}

/**
 * Create a new record in a collection.
 *
 * @param collectionName - Name of the collection
 * @param data - Record data (without system fields)
 * @returns The created record with system fields
 * @throws Error if collection not found or validation fails
 */
export function createRecord(
  collectionName: string,
  data: Record<string, unknown>
): Record<string, unknown> {
  const db = getDatabase();

  // Get collection (throws if not found)
  const collection = getCollection(collectionName);
  if (!collection) {
    throw new Error(`Collection "${collectionName}" not found`);
  }

  // Get fields for collection
  const fields = getFields(collectionName);

  // Validate data against fields
  const validationResult = validateRecord(fields, data);
  if (!validationResult.success) {
    const errors = formatValidationErrors(validationResult.errors);
    throw new Error(`Validation failed: ${errors.join(", ")}`);
  }

  // Validate relation fields reference existing records
  validateRelations(fields, validationResult.data);

  // Generate system fields
  const systemFields = createSystemFields();

  // Prepare data for storage (stringify JSON, convert boolean)
  const preparedData = stringifyJsonFields(fields, validationResult.data);

  // Merge system fields with validated data
  const record = { ...systemFields, ...preparedData };

  // Build INSERT SQL dynamically
  const columns = ["id", "created_at", "updated_at", ...fields.map((f) => f.name)];
  const placeholders = columns.map((c) => `$${c}`).join(", ");
  const columnList = columns.map((c) => `"${c}"`).join(", ");

  const insertSQL = `INSERT INTO "${collectionName}" (${columnList}) VALUES (${placeholders})`;

  // Build params object
  const params: Record<string, unknown> = {
    id: record.id,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
  for (const field of fields) {
    params[field.name] = preparedData[field.name] ?? null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.prepare(insertSQL).run(params as any);

  // Return the complete record with system fields (and parse JSON/boolean back)
  return parseJsonFields(fields, record);
}

/**
 * Get a record by ID from a collection.
 *
 * @param collectionName - Name of the collection
 * @param id - Record ID
 * @returns The record or null if not found
 */
export function getRecord(
  collectionName: string,
  id: string
): Record<string, unknown> | null {
  const db = getDatabase();

  // Verify collection exists
  const collection = getCollection(collectionName);
  if (!collection) {
    throw new Error(`Collection "${collectionName}" not found`);
  }

  const fields = getFields(collectionName);

  const stmt = db.prepare(`SELECT * FROM "${collectionName}" WHERE id = $id`);
  const result = stmt.get({ id }) as Record<string, unknown> | null;

  if (!result) {
    return null;
  }

  // Parse JSON fields back to objects
  return parseJsonFields(fields, result);
}

/**
 * List all records in a collection.
 *
 * @param collectionName - Name of the collection
 * @returns Array of records
 */
export function listRecords(
  collectionName: string
): Record<string, unknown>[] {
  const db = getDatabase();

  // Verify collection exists
  const collection = getCollection(collectionName);
  if (!collection) {
    throw new Error(`Collection "${collectionName}" not found`);
  }

  const fields = getFields(collectionName);

  const stmt = db.prepare(`SELECT * FROM "${collectionName}"`);
  const results = stmt.all() as Record<string, unknown>[];

  // Parse JSON fields back to objects for each record
  return results.map((record) => parseJsonFields(fields, record));
}

/**
 * Update a record in a collection.
 *
 * @param collectionName - Name of the collection
 * @param id - Record ID
 * @param data - Partial record data to update
 * @returns The updated record
 * @throws Error if record not found or validation fails
 */
export function updateRecord(
  collectionName: string,
  id: string,
  data: Record<string, unknown>
): Record<string, unknown> {
  const db = getDatabase();

  // Get existing record (throws if collection not found)
  const existing = getRecord(collectionName, id);
  if (!existing) {
    throw new Error(`Record "${id}" not found in collection "${collectionName}"`);
  }

  // Get fields
  const fields = getFields(collectionName);

  // Filter to only validate fields that are being updated
  const updateFields = fields.filter((f) => f.name in data);

  // For validation, we need to make required fields optional for partial updates
  const partialFields = updateFields.map((f) => ({
    ...f,
    required: false, // Allow partial updates
  }));

  // Validate the update data
  const validationResult = validateRecord(partialFields, data);
  if (!validationResult.success) {
    const errors = formatValidationErrors(validationResult.errors);
    throw new Error(`Validation failed: ${errors.join(", ")}`);
  }

  // Validate relation fields in update data
  validateRelations(updateFields, validationResult.data);

  // Prepare data for storage
  const preparedData = stringifyJsonFields(updateFields, validationResult.data);

  // Set updated_at to current time
  const updatedAt = new Date().toISOString();

  // Build UPDATE SQL dynamically for provided fields + updated_at
  const setClauses = ["updated_at = $updated_at"];
  const params: Record<string, unknown> = {
    id,
    updated_at: updatedAt,
  };

  for (const [key, value] of Object.entries(preparedData)) {
    setClauses.push(`"${key}" = $${key}`);
    params[key] = value;
  }

  const updateSQL = `UPDATE "${collectionName}" SET ${setClauses.join(", ")} WHERE id = $id`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.prepare(updateSQL).run(params as any);

  // Return updated record (re-fetch to get latest state)
  return getRecord(collectionName, id)!;
}

/**
 * Delete a record from a collection.
 *
 * @param collectionName - Name of the collection
 * @param id - Record ID
 * @throws Error if record not found
 */
export function deleteRecord(collectionName: string, id: string): void {
  const db = getDatabase();

  // Verify collection exists
  const collection = getCollection(collectionName);
  if (!collection) {
    throw new Error(`Collection "${collectionName}" not found`);
  }

  // Verify record exists
  const stmt = db.prepare(`SELECT id FROM "${collectionName}" WHERE id = $id`);
  const existing = stmt.get({ id });
  if (!existing) {
    throw new Error(`Record "${id}" not found in collection "${collectionName}"`);
  }

  db.prepare(`DELETE FROM "${collectionName}" WHERE id = $id`).run({ id });
}

/**
 * List records with query options (filter, sort, pagination, expand).
 *
 * @param collectionName - Name of the collection
 * @param options - Query options for filtering, sorting, pagination, and expansion
 * @returns Paginated response with items and metadata
 * @throws Error if collection not found or invalid field names in query
 */
export function listRecordsWithQuery(
  collectionName: string,
  options: QueryOptions
): PaginatedResponse<Record<string, unknown>> {
  const db = getDatabase();

  // Verify collection exists
  const collection = getCollection(collectionName);
  if (!collection) {
    throw new Error(`Collection "${collectionName}" not found`);
  }

  const fields = getFields(collectionName);

  // Build parameterized query (validates field names, throws on invalid)
  const { sql, countSql, params } = buildListQuery(collectionName, options, fields);

  // Execute count query first for pagination metadata
  const countStmt = db.prepare(countSql);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const countResult = countStmt.get(params as any) as { count: number };
  const totalItems = countResult.count;

  // Execute data query
  const dataStmt = db.prepare(sql);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawResults = dataStmt.all(params as any) as Record<string, unknown>[];

  // Parse JSON/boolean fields
  let items = rawResults.map((record) => parseJsonFields(fields, record));

  // Expand relations if requested
  if (options.expand && options.expand.length > 0) {
    items = expandRelations(items, fields, options.expand);
  }

  // Calculate pagination metadata
  const page = options.page || 1;
  const perPage = options.perPage || 30;
  const totalPages = Math.ceil(totalItems / perPage);

  return {
    page,
    perPage,
    totalItems,
    totalPages,
    items,
  };
}

// ============================================================================
// Hook-aware record operations
// ============================================================================

/**
 * Build request context from a Request object for hooks.
 *
 * @param req - Optional HTTP Request object
 * @returns Request context with method, path, and headers, or undefined if no request
 */
function buildRequestContext(
  req?: Request
): { method: string; path: string; headers: Headers } | undefined {
  if (!req) return undefined;
  return {
    method: req.method,
    path: new URL(req.url).pathname,
    headers: req.headers,
  };
}

/**
 * Create a new record with lifecycle hook support.
 *
 * Executes beforeCreate hooks before insertion (can modify data or cancel).
 * Executes afterCreate hooks after insertion (errors are logged, not thrown).
 *
 * @param collectionName - Name of the collection
 * @param data - Record data (without system fields)
 * @param hooks - HookManager instance for triggering hooks
 * @param request - Optional HTTP request for context
 * @returns The created record with system fields
 * @throws Error if collection not found, validation fails, or beforeCreate hook throws
 */
export async function createRecordWithHooks(
  collectionName: string,
  data: Record<string, unknown>,
  hooks: HookManager,
  request?: Request
): Promise<Record<string, unknown>> {
  // Build beforeCreate context with copy of data to allow safe mutation
  const beforeContext: BeforeCreateContext = {
    collection: collectionName,
    data: { ...data },
    request: buildRequestContext(request),
  };

  // Execute beforeCreate hooks (may modify data or throw to cancel)
  await hooks.trigger("beforeCreate", beforeContext);

  // Create record using potentially modified data from hooks
  const record = createRecord(collectionName, beforeContext.data);

  // Build afterCreate context
  const afterContext: AfterCreateContext = {
    collection: collectionName,
    record,
    request: buildRequestContext(request),
  };

  // Execute afterCreate hooks (swallow errors, log only)
  try {
    await hooks.trigger("afterCreate", afterContext);
  } catch (error) {
    console.error("afterCreate hook error:", error);
  }

  return record;
}

/**
 * Update a record with lifecycle hook support.
 *
 * Executes beforeUpdate hooks before update (can modify data or cancel).
 * Executes afterUpdate hooks after update (errors are logged, not thrown).
 *
 * @param collectionName - Name of the collection
 * @param id - Record ID
 * @param data - Partial record data to update
 * @param hooks - HookManager instance for triggering hooks
 * @param request - Optional HTTP request for context
 * @returns The updated record
 * @throws Error if record not found, validation fails, or beforeUpdate hook throws
 */
export async function updateRecordWithHooks(
  collectionName: string,
  id: string,
  data: Record<string, unknown>,
  hooks: HookManager,
  request?: Request
): Promise<Record<string, unknown>> {
  // Fetch existing record first
  const existing = getRecord(collectionName, id);
  if (!existing) {
    throw new Error(`Record "${id}" not found in collection "${collectionName}"`);
  }

  // Build beforeUpdate context with copy of data to allow safe mutation
  const beforeContext: BeforeUpdateContext = {
    collection: collectionName,
    id,
    data: { ...data },
    existing,
    request: buildRequestContext(request),
  };

  // Execute beforeUpdate hooks (may modify data or throw to cancel)
  await hooks.trigger("beforeUpdate", beforeContext);

  // Update record using potentially modified data from hooks
  const record = updateRecord(collectionName, id, beforeContext.data);

  // Build afterUpdate context
  const afterContext: AfterUpdateContext = {
    collection: collectionName,
    record,
    request: buildRequestContext(request),
  };

  // Execute afterUpdate hooks (swallow errors, log only)
  try {
    await hooks.trigger("afterUpdate", afterContext);
  } catch (error) {
    console.error("afterUpdate hook error:", error);
  }

  return record;
}

/**
 * Delete a record with lifecycle hook support.
 *
 * Executes beforeDelete hooks before deletion (can throw to cancel).
 * Executes afterDelete hooks after deletion (errors are logged, not thrown).
 *
 * @param collectionName - Name of the collection
 * @param id - Record ID
 * @param hooks - HookManager instance for triggering hooks
 * @param request - Optional HTTP request for context
 * @throws Error if record not found or beforeDelete hook throws
 */
export async function deleteRecordWithHooks(
  collectionName: string,
  id: string,
  hooks: HookManager,
  request?: Request
): Promise<void> {
  // Fetch existing record first
  const existing = getRecord(collectionName, id);
  if (!existing) {
    throw new Error(`Record "${id}" not found in collection "${collectionName}"`);
  }

  // Build beforeDelete context
  const beforeContext: BeforeDeleteContext = {
    collection: collectionName,
    id,
    existing,
    request: buildRequestContext(request),
  };

  // Execute beforeDelete hooks (may throw to cancel)
  await hooks.trigger("beforeDelete", beforeContext);

  // Delete the record
  deleteRecord(collectionName, id);

  // Build afterDelete context
  const afterContext: AfterDeleteContext = {
    collection: collectionName,
    id,
    request: buildRequestContext(request),
  };

  // Execute afterDelete hooks (swallow errors, log only)
  try {
    await hooks.trigger("afterDelete", afterContext);
  } catch (error) {
    console.error("afterDelete hook error:", error);
  }
}
