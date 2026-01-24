import { Database } from "bun:sqlite";
import { FIELD_TYPE_MAP, type Field, type FieldOptions } from "../types/collection.ts";

/**
 * Validate that a name contains only safe characters (alphanumeric + underscore).
 * Prevents SQL injection since table/column names can't be parameterized.
 *
 * @param name - The name to validate
 * @throws Error if name contains unsafe characters
 */
function validateIdentifier(name: string): void {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(
      `Invalid identifier "${name}": must start with letter or underscore, contain only alphanumeric and underscore`
    );
  }
}

/**
 * Generate CREATE TABLE SQL for a collection with system fields and user-defined fields.
 *
 * System fields (auto-added):
 * - id: TEXT PRIMARY KEY
 * - created_at: TEXT DEFAULT (datetime('now'))
 * - updated_at: TEXT DEFAULT (datetime('now'))
 *
 * @param tableName - Name of the table to create
 * @param fields - Array of user-defined field definitions
 * @returns CREATE TABLE SQL statement
 */
export function createTableSQL(tableName: string, fields: Field[]): string {
  validateIdentifier(tableName);

  const columns: string[] = [
    // System fields
    "id TEXT PRIMARY KEY",
    "created_at TEXT DEFAULT (datetime('now'))",
    "updated_at TEXT DEFAULT (datetime('now'))",
  ];

  for (const field of fields) {
    validateIdentifier(field.name);
    const sqlType = FIELD_TYPE_MAP[field.type];
    let columnDef = `${field.name} ${sqlType}`;

    // Add NOT NULL constraint if required
    if (field.required) {
      columnDef += " NOT NULL";
    }

    // Add REFERENCES for relation fields
    if (field.type === "relation" && field.options?.target) {
      validateIdentifier(field.options.target);
      columnDef += ` REFERENCES ${field.options.target}(id)`;
    }

    columns.push(columnDef);
  }

  return `CREATE TABLE ${tableName} (\n  ${columns.join(",\n  ")}\n)`;
}

/**
 * Generate default value for a field type (used in ALTER TABLE ADD COLUMN).
 *
 * @param field - The field to get default for
 * @returns SQL DEFAULT clause or empty string
 */
function getDefaultForType(field: Field): string {
  if (field.required) {
    // Required fields can't have NULL, provide type-appropriate default
    switch (field.type) {
      case "text":
      case "datetime":
      case "json":
      case "relation":
        return " DEFAULT ''";
      case "number":
        return " DEFAULT 0";
      case "boolean":
        return " DEFAULT 0";
    }
  }
  // Optional fields default to NULL (implicit)
  return "";
}

/**
 * Generate ALTER TABLE ADD COLUMN SQL for adding a field to an existing table.
 *
 * @param tableName - Name of the table to modify
 * @param field - Field definition to add
 * @returns ALTER TABLE ADD COLUMN SQL statement
 */
export function addColumnSQL(tableName: string, field: Field): string {
  validateIdentifier(tableName);
  validateIdentifier(field.name);

  const sqlType = FIELD_TYPE_MAP[field.type];
  let columnDef = `${field.name} ${sqlType}`;

  // Note: SQLite ALTER TABLE ADD COLUMN doesn't support NOT NULL without DEFAULT
  // for existing rows. We handle this by always providing a default for required fields.
  if (field.required) {
    columnDef += " NOT NULL";
    columnDef += getDefaultForType(field);
  }

  // Add REFERENCES for relation fields
  if (field.type === "relation" && field.options?.target) {
    validateIdentifier(field.options.target);
    columnDef += ` REFERENCES ${field.options.target}(id)`;
  }

  return `ALTER TABLE ${tableName} ADD COLUMN ${columnDef}`;
}

/**
 * Generate DROP TABLE SQL.
 *
 * @param tableName - Name of the table to drop
 * @returns DROP TABLE IF EXISTS SQL statement
 */
export function dropTableSQL(tableName: string): string {
  validateIdentifier(tableName);
  return `DROP TABLE IF EXISTS ${tableName}`;
}

/**
 * Migrate a table using the 12-step shadow table pattern.
 * Used when columns need to be removed or column types need to change.
 *
 * This pattern:
 * 1. Disables foreign keys
 * 2. Gets existing indexes/triggers
 * 3. Creates new table with temp name
 * 4. Copies data (only columns that exist in both)
 * 5. Drops old table
 * 6. Renames new table
 * 7. Recreates indexes
 * 8. Recreates triggers
 * 9. Verifies FK integrity
 * 10. Re-enables foreign keys
 *
 * @param db - Database instance
 * @param tableName - Name of the table to migrate
 * @param newFields - New field definitions
 * @param oldFields - Current field definitions
 */
export function migrateTable(
  db: Database,
  tableName: string,
  newFields: Field[],
  oldFields: Field[]
): void {
  validateIdentifier(tableName);

  const tempName = `_new_${tableName}`;

  // Build list of columns to copy (exist in both old and new, plus system fields)
  const oldFieldNames = new Set(oldFields.map((f) => f.name));
  const newFieldNames = new Set(newFields.map((f) => f.name));
  const systemFields = ["id", "created_at", "updated_at"];

  // Columns to copy: system fields + fields that exist in both old and new
  const columnsToCopy = [
    ...systemFields,
    ...newFields.filter((f) => oldFieldNames.has(f.name)).map((f) => f.name),
  ];

  const transaction = db.transaction(() => {
    // 1. Disable foreign keys
    db.run("PRAGMA foreign_keys = OFF");

    try {
      // 2-3. Get existing indexes (exclude auto-generated ones)
      const indexes = db
        .query<{ sql: string | null }, { table: string }>(
          "SELECT sql FROM sqlite_schema WHERE type='index' AND tbl_name = $table AND sql IS NOT NULL"
        )
        .all({ table: tableName });

      // Get existing triggers
      const triggers = db
        .query<{ sql: string | null }, { table: string }>(
          "SELECT sql FROM sqlite_schema WHERE type='trigger' AND tbl_name = $table AND sql IS NOT NULL"
        )
        .all({ table: tableName });

      // 4. Create new table with temp name
      const createSQL = createTableSQL(tempName, newFields);
      db.run(createSQL);

      // 5. Copy data (only columns that exist in both)
      const columnsSQL = columnsToCopy.join(", ");
      db.run(`INSERT INTO ${tempName} (${columnsSQL}) SELECT ${columnsSQL} FROM ${tableName}`);

      // 6. Drop old table
      db.run(`DROP TABLE ${tableName}`);

      // 7. Rename new table
      db.run(`ALTER TABLE ${tempName} RENAME TO ${tableName}`);

      // 8. Recreate indexes (fix table name in SQL)
      for (const idx of indexes) {
        if (idx.sql) {
          // Replace temp name references if any
          const fixedSQL = idx.sql.replace(new RegExp(`\\b${tempName}\\b`, "g"), tableName);
          try {
            db.run(fixedSQL);
          } catch {
            // Index may reference dropped column, skip silently
          }
        }
      }

      // 9. Recreate triggers
      for (const trg of triggers) {
        if (trg.sql) {
          const fixedSQL = trg.sql.replace(new RegExp(`\\b${tempName}\\b`, "g"), tableName);
          try {
            db.run(fixedSQL);
          } catch {
            // Trigger may reference dropped column, skip silently
          }
        }
      }

      // 10. Verify FK integrity
      const fkErrors = db.query("PRAGMA foreign_key_check").all();
      if (fkErrors.length > 0) {
        throw new Error(`Foreign key violations after migration: ${JSON.stringify(fkErrors)}`);
      }
    } finally {
      // 11. Re-enable foreign keys
      db.run("PRAGMA foreign_keys = ON");
    }
  });

  // Execute transaction
  transaction();
}
