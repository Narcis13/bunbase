import { getDatabase } from "./database.ts";
import { generateId } from "../utils/id.ts";
import { createSystemFields } from "../types/record.ts";
import { getFields, getCollection } from "./schema.ts";
import { validateRecord, formatValidationErrors } from "./validation.ts";
import { saveFile } from "../storage/files.ts";
import {
  validateFieldFiles,
  formatFileErrors,
  type FileValidationError,
} from "../storage/validation.ts";
import { buildListQuery } from "./query.ts";
import { expandRelations } from "./expand.ts";
import { HookManager } from "./hooks.ts";
import { evaluateRule, getRuleForOperation, RuleContext } from "../auth/rules.ts";
import type { AuthenticatedUser } from "../auth/middleware.ts";
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
 * Auth context for record operations.
 * When undefined, operations allow access (for CLI/internal use).
 */
export interface RecordAuthContext {
  isAdmin: boolean;
  user: AuthenticatedUser | null;
}

/**
 * Check rule access for a record operation.
 * Throws "Access denied" if rule evaluation fails.
 *
 * @param collectionName - Name of the collection
 * @param operation - The operation being performed
 * @param authContext - Auth context (undefined = skip checks)
 * @param record - The record being accessed (for view/update/delete)
 * @param body - The request body (for create/update)
 */
function checkRuleAccess(
  collectionName: string,
  operation: 'list' | 'view' | 'create' | 'update' | 'delete',
  authContext?: RecordAuthContext,
  record?: Record<string, unknown>,
  body?: Record<string, unknown>
): void {
  // Skip checks if no auth context (backward compatible for CLI/internal use)
  if (!authContext) {
    return;
  }

  const collection = getCollection(collectionName);
  if (!collection) {
    throw new Error(`Collection "${collectionName}" not found`);
  }

  const rules = collection.rules;
  const rule = getRuleForOperation(rules, operation);

  const evalContext: RuleContext = {
    isAdmin: authContext.isAdmin,
    auth: authContext.user,
    record,
    body,
  };

  if (!evaluateRule(rule, evalContext)) {
    throw new Error('Access denied');
  }
}

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
 * @param authContext - Optional auth context for rule enforcement (undefined = skip checks)
 * @returns The record or null if not found
 * @throws Error if access denied
 */
export function getRecord(
  collectionName: string,
  id: string,
  authContext?: RecordAuthContext
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
  const record = parseJsonFields(fields, result);

  // Check view rule access (after fetching record so we can use record fields in rule)
  checkRuleAccess(collectionName, 'view', authContext, record);

  return record;
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
 * @param authContext - Optional auth context for rule enforcement (undefined = skip checks)
 * @returns Paginated response with items and metadata
 * @throws Error if collection not found, invalid field names, or access denied
 */
export function listRecordsWithQuery(
  collectionName: string,
  options: QueryOptions,
  authContext?: RecordAuthContext
): PaginatedResponse<Record<string, unknown>> {
  // Check list rule access
  checkRuleAccess(collectionName, 'list', authContext);

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
 * @param authContext - Optional auth context for rule enforcement (undefined = skip checks)
 * @returns The created record with system fields
 * @throws Error if collection not found, validation fails, access denied, or beforeCreate hook throws
 */
export async function createRecordWithHooks(
  collectionName: string,
  data: Record<string, unknown>,
  hooks: HookManager,
  request?: Request,
  authContext?: RecordAuthContext
): Promise<Record<string, unknown>> {
  // Check create rule access
  checkRuleAccess(collectionName, 'create', authContext, undefined, data);

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
 * @param authContext - Optional auth context for rule enforcement (undefined = skip checks)
 * @returns The updated record
 * @throws Error if record not found, validation fails, access denied, or beforeUpdate hook throws
 */
export async function updateRecordWithHooks(
  collectionName: string,
  id: string,
  data: Record<string, unknown>,
  hooks: HookManager,
  request?: Request,
  authContext?: RecordAuthContext
): Promise<Record<string, unknown>> {
  // Fetch existing record first (without auth check to get record for rule evaluation)
  const existing = getRecord(collectionName, id);
  if (!existing) {
    throw new Error(`Record "${id}" not found in collection "${collectionName}"`);
  }

  // Check update rule access with existing record
  checkRuleAccess(collectionName, 'update', authContext, existing, data);

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
 * @param authContext - Optional auth context for rule enforcement (undefined = skip checks)
 * @throws Error if record not found, access denied, or beforeDelete hook throws
 */
export async function deleteRecordWithHooks(
  collectionName: string,
  id: string,
  hooks: HookManager,
  request?: Request,
  authContext?: RecordAuthContext
): Promise<void> {
  // Fetch existing record first (without auth check to get record for rule evaluation)
  const existing = getRecord(collectionName, id);
  if (!existing) {
    throw new Error(`Record "${id}" not found in collection "${collectionName}"`);
  }

  // Check delete rule access with existing record
  checkRuleAccess(collectionName, 'delete', authContext, existing);

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

// ============================================================================
// File-aware record operations
// ============================================================================

/**
 * Get file field definitions for a collection.
 */
function getFileFields(collectionName: string): Field[] {
  const fields = getFields(collectionName);
  return fields.filter((f) => f.type === "file");
}

/**
 * Validate uploaded files against field options.
 *
 * @param collectionName - Name of the collection
 * @param files - Map of field names to File arrays
 * @returns Array of validation errors (empty if all valid)
 */
function validateUploadedFiles(
  collectionName: string,
  files: Map<string, File[]>
): FileValidationError[] {
  const fileFields = getFileFields(collectionName);
  const errors: FileValidationError[] = [];

  for (const field of fileFields) {
    const fieldFiles = files.get(field.name) ?? [];
    if (fieldFiles.length === 0) continue;

    const fieldErrors = validateFieldFiles(
      field.name,
      fieldFiles,
      field.options ?? {}
    );
    errors.push(...fieldErrors);
  }

  // Check for files uploaded to non-file fields
  for (const [fieldName, fieldFiles] of files) {
    const field = fileFields.find((f) => f.name === fieldName);
    if (!field && fieldFiles.length > 0) {
      errors.push({
        field: fieldName,
        file: "",
        message: `Field "${fieldName}" is not a file field`,
      });
    }
  }

  return errors;
}

/**
 * Save files for a record and return the update data.
 *
 * @param collectionName - Name of the collection
 * @param recordId - ID of the record
 * @param files - Map of field names to File arrays
 * @returns Data object with file field values (filenames or arrays)
 */
async function saveRecordFiles(
  collectionName: string,
  recordId: string,
  files: Map<string, File[]>
): Promise<Record<string, string | string[]>> {
  const fileFields = getFileFields(collectionName);
  const fileData: Record<string, string | string[]> = {};

  for (const field of fileFields) {
    const fieldFiles = files.get(field.name) ?? [];
    if (fieldFiles.length === 0) continue;

    const savedFilenames: string[] = [];
    for (const file of fieldFiles) {
      const filename = await saveFile(collectionName, recordId, file);
      savedFilenames.push(filename);
    }

    // Store as array if maxFiles > 1, else single string
    const maxFiles = field.options?.maxFiles ?? 1;
    fileData[field.name] = maxFiles > 1 ? savedFilenames : savedFilenames[0]!;
  }

  return fileData;
}

/**
 * Create a new record with file upload support.
 *
 * @param collectionName - Name of the collection
 * @param data - Record data (without files)
 * @param files - Map of field names to uploaded files
 * @param hooks - HookManager instance
 * @param request - Optional HTTP request for context
 * @param authContext - Optional auth context for rule enforcement
 * @returns The created record with file field values
 */
export async function createRecordWithFiles(
  collectionName: string,
  data: Record<string, unknown>,
  files: Map<string, File[]>,
  hooks: HookManager,
  request?: Request,
  authContext?: RecordAuthContext
): Promise<Record<string, unknown>> {
  // Validate files first
  const validationErrors = validateUploadedFiles(collectionName, files);
  if (validationErrors.length > 0) {
    throw new Error(`File validation failed: ${formatFileErrors(validationErrors)}`);
  }

  // Create the record first (to get ID)
  const record = await createRecordWithHooks(
    collectionName,
    data,
    hooks,
    request,
    authContext
  );

  // Save files if any
  if (files.size > 0) {
    const fileData = await saveRecordFiles(
      collectionName,
      record.id as string,
      files
    );

    // Update record with file references if we saved any files
    if (Object.keys(fileData).length > 0) {
      return updateRecord(collectionName, record.id as string, fileData);
    }
  }

  return record;
}

/**
 * Update a record with file upload support.
 *
 * @param collectionName - Name of the collection
 * @param id - Record ID
 * @param data - Record data to update (without files)
 * @param files - Map of field names to uploaded files
 * @param hooks - HookManager instance
 * @param request - Optional HTTP request for context
 * @param authContext - Optional auth context for rule enforcement
 * @returns The updated record with file field values
 */
export async function updateRecordWithFiles(
  collectionName: string,
  id: string,
  data: Record<string, unknown>,
  files: Map<string, File[]>,
  hooks: HookManager,
  request?: Request,
  authContext?: RecordAuthContext
): Promise<Record<string, unknown>> {
  // Validate files first
  const validationErrors = validateUploadedFiles(collectionName, files);
  if (validationErrors.length > 0) {
    throw new Error(`File validation failed: ${formatFileErrors(validationErrors)}`);
  }

  // Update the record data (without files)
  let record = await updateRecordWithHooks(
    collectionName,
    id,
    data,
    hooks,
    request,
    authContext
  );

  // Save new files if any
  if (files.size > 0) {
    const fileData = await saveRecordFiles(collectionName, id, files);

    // Merge new filenames with existing filenames for multi-file fields
    if (Object.keys(fileData).length > 0) {
      const fileFields = getFileFields(collectionName);
      for (const field of fileFields) {
        const maxFiles = field.options?.maxFiles ?? 1;
        const savedValue = fileData[field.name];
        if (maxFiles > 1 && savedValue) {
          // Get existing filenames passed in data (from the admin form)
          const existingFromData = data[`${field.name}_existing`];
          const existingFilenames: string[] = [];
          if (Array.isArray(existingFromData)) {
            existingFilenames.push(...existingFromData.map(String));
          } else if (typeof existingFromData === "string" && existingFromData) {
            existingFilenames.push(existingFromData);
          }
          // Also check the data field itself for existing filenames
          const dataFieldValue = data[field.name];
          if (Array.isArray(dataFieldValue)) {
            for (const v of dataFieldValue) {
              if (typeof v === "string" && !existingFilenames.includes(v)) {
                existingFilenames.push(v);
              }
            }
          }
          // Merge existing + new
          const newFilenames = Array.isArray(savedValue)
            ? savedValue
            : [savedValue];
          fileData[field.name] = [...existingFilenames, ...newFilenames];
        }
      }
      record = updateRecord(collectionName, id, fileData);
    }
  }

  return record;
}
