import { getDatabase } from "./database.ts";
import { generateId } from "../utils/id.ts";
import { createTableSQL, addColumnSQL, dropTableSQL, migrateTable } from "./migrations.ts";
import type {
  Collection,
  Field,
  FieldType,
  FieldOptions,
  CollectionType,
  CollectionRules,
} from "../types/collection.ts";
import { AUTH_SYSTEM_FIELDS } from "../types/collection.ts";
import type { AuthCollectionOptions } from "../types/auth.ts";

/**
 * Input type for creating fields (without auto-generated values)
 */
export type FieldInput = Omit<Field, "id" | "collection_id" | "created_at">;

/**
 * Input for updating a field (partial updates allowed).
 */
export interface UpdateFieldInput {
  name?: string;
  type?: FieldType;
  required?: boolean;
  options?: FieldOptions | null;
}

/**
 * Options for creating a collection.
 */
export interface CreateCollectionOptions {
  /** Collection type: 'base' (default) or 'auth' */
  type?: CollectionType;
  /** Auth-specific options (only used when type is 'auth') */
  authOptions?: AuthCollectionOptions;
  /** Access control rules for collection operations */
  rules?: CollectionRules;
}

/**
 * Validate collection/field names: alphanumeric + underscore, not starting with underscore or number
 */
function validateName(name: string, type: "collection" | "field"): void {
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(
      `Invalid ${type} name "${name}": must start with letter and contain only alphanumeric characters and underscores`
    );
  }
}

// ============================================================================
// Collection CRUD
// ============================================================================

/**
 * Get a collection by name.
 *
 * @param name - Collection name
 * @returns The collection or null if not found
 */
export function getCollection(name: string): Collection | null {
  const db = getDatabase();
  const stmt = db.prepare(
    "SELECT id, name, type, options, rules, created_at, updated_at FROM _collections WHERE name = $name"
  );
  const row = stmt.get({ name }) as {
    id: string;
    name: string;
    type: CollectionType;
    options: string | null;
    rules: string | null;
    created_at: string;
    updated_at: string;
  } | null;

  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    type: row.type,
    options: row.options,
    rules: row.rules ? JSON.parse(row.rules) : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Get all collections.
 *
 * @returns Array of all collections
 */
export function getAllCollections(): Collection[] {
  const db = getDatabase();
  const stmt = db.prepare(
    "SELECT id, name, type, options, rules, created_at, updated_at FROM _collections ORDER BY name"
  );
  const rows = stmt.all() as Array<{
    id: string;
    name: string;
    type: CollectionType;
    options: string | null;
    rules: string | null;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    options: row.options,
    rules: row.rules ? JSON.parse(row.rules) : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

/**
 * Create a new collection with fields.
 * This creates both the metadata entries and the actual SQLite table.
 *
 * For auth collections (type: 'auth'), system fields (email, password_hash, verified)
 * are automatically added to the table - do not include them in the fields array.
 *
 * @param name - Collection name
 * @param fields - Array of field definitions
 * @param options - Optional collection options (type, authOptions, rules)
 * @returns The created collection
 */
export function createCollection(
  name: string,
  fields: FieldInput[],
  options?: CreateCollectionOptions
): Collection {
  const db = getDatabase();

  const collectionType = options?.type ?? "base";

  // Validate name
  validateName(name, "collection");

  // Check for existing collection
  const existing = getCollection(name);
  if (existing) {
    throw new Error(`Collection "${name}" already exists`);
  }

  // Validate field names and check for conflicts with auth system fields
  for (const field of fields) {
    validateName(field.name, "field");

    // For auth collections, ensure user-defined fields don't conflict with system fields
    if (collectionType === "auth") {
      if (AUTH_SYSTEM_FIELDS.includes(field.name as (typeof AUTH_SYSTEM_FIELDS)[number])) {
        throw new Error(
          `Field "${field.name}" conflicts with auth system field. ` +
            `Auth collections automatically have: ${AUTH_SYSTEM_FIELDS.join(", ")}`
        );
      }
    }
  }

  const collectionId = generateId();
  const now = new Date().toISOString();

  // Serialize options based on collection type
  const serializedOptions =
    collectionType === "auth" && options?.authOptions
      ? JSON.stringify(options.authOptions)
      : null;

  const serializedRules = options?.rules ? JSON.stringify(options.rules) : null;

  // Build field records for createTableSQL
  const fieldRecords: Field[] = fields.map((f) => ({
    id: generateId(),
    collection_id: collectionId,
    name: f.name,
    type: f.type,
    required: f.required,
    options: f.options,
    created_at: now,
  }));

  // Use transaction for atomicity
  const createCollectionTx = db.transaction(() => {
    // Insert collection with type, options, and rules
    db.prepare(
      `INSERT INTO _collections (id, name, type, options, rules, created_at, updated_at)
       VALUES ($id, $name, $type, $options, $rules, $created_at, $updated_at)`
    ).run({
      id: collectionId,
      name,
      type: collectionType,
      options: serializedOptions,
      rules: serializedRules,
      created_at: now,
      updated_at: now,
    });

    // Insert fields (user-defined only, not system fields)
    const insertField = db.prepare(`
      INSERT INTO _fields (id, collection_id, name, type, required, options, created_at)
      VALUES ($id, $collection_id, $name, $type, $required, $options, $created_at)
    `);
    for (const field of fieldRecords) {
      insertField.run({
        id: field.id,
        collection_id: field.collection_id,
        name: field.name,
        type: field.type,
        required: field.required ? 1 : 0,
        options: field.options ? JSON.stringify(field.options) : null,
        created_at: field.created_at,
      });
    }

    // Create the SQLite table using migrations module (with collection type)
    const sql = createTableSQL(name, fieldRecords, collectionType);
    db.run(sql);
  });

  createCollectionTx();

  return {
    id: collectionId,
    name,
    type: collectionType,
    options: serializedOptions,
    rules: options?.rules ?? null,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Update a collection's name.
 *
 * @param name - Current collection name
 * @param newName - New collection name
 * @returns The updated collection
 * @throws Error if collection not found or new name conflicts
 */
export function updateCollection(name: string, newName: string): Collection {
  validateName(newName, "collection");

  const db = getDatabase();

  // Get existing collection
  const existing = getCollection(name);
  if (!existing) {
    throw new Error(`Collection "${name}" not found`);
  }

  // Check if new name conflicts
  if (name !== newName) {
    const conflict = getCollection(newName);
    if (conflict) {
      throw new Error(`Collection "${newName}" already exists`);
    }
  }

  const now = new Date().toISOString();

  // Execute in transaction
  const transaction = db.transaction(() => {
    // Update metadata
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db.run("UPDATE _collections SET name = $newName, updated_at = $updated_at WHERE id = $id", {
      newName,
      updated_at: now,
      id: existing.id,
    } as any);

    // Rename SQLite table
    if (name !== newName) {
      db.run(`ALTER TABLE ${name} RENAME TO ${newName}`);
    }
  });

  transaction();

  return {
    id: existing.id,
    name: newName,
    type: existing.type,
    options: existing.options,
    rules: existing.rules,
    created_at: existing.created_at,
    updated_at: now,
  };
}

/**
 * Delete a collection and its data.
 * The CASCADE constraint on _fields will automatically delete field records.
 *
 * @param name - Collection name
 */
export function deleteCollection(name: string): void {
  const db = getDatabase();

  const collection = getCollection(name);
  if (!collection) {
    throw new Error(`Collection "${name}" not found`);
  }

  // Use transaction for atomicity
  const deleteCollectionTx = db.transaction(() => {
    // Delete from _collections (CASCADE will delete _fields)
    db.prepare("DELETE FROM _collections WHERE name = $name").run({ name });

    // Drop the table
    db.run(dropTableSQL(name));
  });

  deleteCollectionTx();
}

// ============================================================================
// Field CRUD
// ============================================================================

/**
 * Get all fields for a collection.
 *
 * @param collectionName - Name of the collection
 * @returns Array of fields
 */
export function getFields(collectionName: string): Field[] {
  const db = getDatabase();

  // Get collection first to validate it exists
  const collection = getCollection(collectionName);
  if (!collection) {
    throw new Error(`Collection "${collectionName}" not found`);
  }

  const stmt = db.prepare(`
    SELECT f.id, f.collection_id, f.name, f.type, f.required, f.options, f.created_at
    FROM _fields f
    WHERE f.collection_id = $collection_id
    ORDER BY f.created_at
  `);
  const results = stmt.all({ collection_id: collection.id }) as Array<{
    id: string;
    collection_id: string;
    name: string;
    type: string;
    required: number;
    options: string | null;
    created_at: string;
  }>;

  return results.map((row) => ({
    id: row.id,
    collection_id: row.collection_id,
    name: row.name,
    type: row.type as FieldType,
    required: row.required === 1,
    options: row.options ? JSON.parse(row.options) : null,
    created_at: row.created_at,
  }));
}

/**
 * Get a single field by name from a collection.
 *
 * @param collectionName - Collection name
 * @param fieldName - Field name
 * @returns The field or null if not found
 */
export function getField(collectionName: string, fieldName: string): Field | null {
  const fields = getFields(collectionName);
  return fields.find((f) => f.name === fieldName) ?? null;
}

/**
 * Add a field to an existing collection.
 *
 * @param collectionName - Collection name
 * @param field - Field definition
 * @returns The created field
 */
export function addField(collectionName: string, field: FieldInput): Field {
  const db = getDatabase();

  const collection = getCollection(collectionName);
  if (!collection) {
    throw new Error(`Collection "${collectionName}" not found`);
  }

  validateName(field.name, "field");

  // Check for existing field with same name
  const existingFields = getFields(collectionName);
  if (existingFields.some((f) => f.name === field.name)) {
    throw new Error(
      `Field "${field.name}" already exists in collection "${collectionName}"`
    );
  }

  const fieldId = generateId();
  const now = new Date().toISOString();

  const fieldRecord: Field = {
    id: fieldId,
    collection_id: collection.id,
    name: field.name,
    type: field.type,
    required: field.required,
    options: field.options,
    created_at: now,
  };

  const addFieldTx = db.transaction(() => {
    // Insert into _fields
    db.prepare(`
      INSERT INTO _fields (id, collection_id, name, type, required, options, created_at)
      VALUES ($id, $collection_id, $name, $type, $required, $options, $created_at)
    `).run({
      id: fieldId,
      collection_id: collection.id,
      name: field.name,
      type: field.type,
      required: field.required ? 1 : 0,
      options: field.options ? JSON.stringify(field.options) : null,
      created_at: now,
    });

    // ALTER TABLE to add column using migrations module
    const sql = addColumnSQL(collectionName, fieldRecord);
    db.run(sql);

    // Update collection updated_at
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db.run("UPDATE _collections SET updated_at = $now WHERE id = $id", {
      now,
      id: collection.id,
    } as any);
  });

  addFieldTx();

  return fieldRecord;
}

/**
 * Update a field in a collection.
 * For name changes, uses ALTER TABLE RENAME COLUMN.
 * For type or required changes, uses shadow table migration.
 *
 * @param collectionName - Collection name
 * @param fieldName - Current field name
 * @param updates - Fields to update
 * @returns The updated field
 * @throws Error if collection or field not found
 */
export function updateField(
  collectionName: string,
  fieldName: string,
  updates: UpdateFieldInput
): Field {
  const db = getDatabase();

  // Get collection
  const collection = getCollection(collectionName);
  if (!collection) {
    throw new Error(`Collection "${collectionName}" not found`);
  }

  // Get existing field
  const existingField = getField(collectionName, fieldName);
  if (!existingField) {
    throw new Error(`Field "${fieldName}" not found in collection "${collectionName}"`);
  }

  // Validate new name if provided
  if (updates.name !== undefined) {
    validateName(updates.name, "field");
    if (updates.name !== fieldName) {
      const conflict = getField(collectionName, updates.name);
      if (conflict) {
        throw new Error(`Field "${updates.name}" already exists in collection "${collectionName}"`);
      }
    }
  }

  const now = new Date().toISOString();

  // Determine what changed
  const nameChanged = updates.name !== undefined && updates.name !== existingField.name;
  const typeChanged = updates.type !== undefined && updates.type !== existingField.type;
  const requiredChanged =
    updates.required !== undefined && updates.required !== existingField.required;

  // Build updated field
  const updatedField: Field = {
    ...existingField,
    name: updates.name ?? existingField.name,
    type: updates.type ?? existingField.type,
    required: updates.required ?? existingField.required,
    options: updates.options !== undefined ? updates.options : existingField.options,
  };

  // Execute in transaction
  const transaction = db.transaction(() => {
    // Update metadata
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db.run(
      "UPDATE _fields SET name = $name, type = $type, required = $required, options = $options WHERE id = $id",
      {
        name: updatedField.name,
        type: updatedField.type,
        required: updatedField.required ? 1 : 0,
        options: updatedField.options ? JSON.stringify(updatedField.options) : null,
        id: existingField.id,
      } as any
    );

    // Handle table changes
    if (typeChanged || requiredChanged) {
      // Need shadow table migration for type or required changes
      const allFields = getFields(collectionName);
      const updatedFields = allFields.map((f) =>
        f.id === existingField.id ? updatedField : f
      );
      migrateTable(db, collectionName, updatedFields, allFields, collection.type);
    } else if (nameChanged) {
      // Just rename column (SQLite 3.25+)
      db.run(`ALTER TABLE ${collectionName} RENAME COLUMN ${fieldName} TO ${updates.name}`);
    }

    // Update collection updated_at
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db.run("UPDATE _collections SET updated_at = $now WHERE id = $id", {
      now,
      id: collection.id,
    } as any);
  });

  transaction();

  return updatedField;
}

/**
 * Remove a field from a collection.
 * Uses shadow table migration to recreate table without the column.
 *
 * @param collectionName - Collection name
 * @param fieldName - Field name to remove
 * @throws Error if collection or field not found
 */
export function removeField(collectionName: string, fieldName: string): void {
  const db = getDatabase();

  // Get collection
  const collection = getCollection(collectionName);
  if (!collection) {
    throw new Error(`Collection "${collectionName}" not found`);
  }

  // Get existing field
  const existingField = getField(collectionName, fieldName);
  if (!existingField) {
    throw new Error(`Field "${fieldName}" not found in collection "${collectionName}"`);
  }

  const now = new Date().toISOString();

  // Execute in transaction
  const transaction = db.transaction(() => {
    // Get all fields
    const allFields = getFields(collectionName);

    // Remove the target field
    const remainingFields = allFields.filter((f) => f.id !== existingField.id);

    // Migrate table to remove column
    migrateTable(db, collectionName, remainingFields, allFields, collection.type);

    // Delete field metadata
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db.run("DELETE FROM _fields WHERE id = $id", { id: existingField.id } as any);

    // Update collection updated_at
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db.run("UPDATE _collections SET updated_at = $now WHERE id = $id", {
      now,
      id: collection.id,
    } as any);
  });

  transaction();
}

/**
 * Check if a collection is an auth collection.
 *
 * @param name - Collection name
 * @returns true if the collection is an auth collection, false otherwise
 */
export function isAuthCollection(name: string): boolean {
  const collection = getCollection(name);
  return collection?.type === "auth";
}
