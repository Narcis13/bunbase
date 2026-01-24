import { Database } from "bun:sqlite";

/** Module-level database instance */
let db: Database | null = null;

/**
 * SQL to initialize BunBase metadata tables.
 * _collections: stores collection definitions
 * _fields: stores field definitions for each collection
 */
const INIT_METADATA_SQL = `
  CREATE TABLE IF NOT EXISTS _collections (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS _fields (
    id TEXT PRIMARY KEY,
    collection_id TEXT NOT NULL REFERENCES _collections(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('text', 'number', 'boolean', 'datetime', 'json', 'relation')),
    required INTEGER DEFAULT 0,
    options TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(collection_id, name)
  );
`;

/**
 * Initialize the database with the given path.
 * Creates the database file if it doesn't exist.
 * Sets up WAL mode, foreign keys, and creates metadata tables.
 *
 * @param path - Path to the SQLite database file
 * @returns The initialized Database instance
 */
export function initDatabase(path: string): Database {
  db = new Database(path, {
    strict: true, // Error on missing parameters
    create: true, // Create file if not exists
  });

  // Essential PRAGMAs for performance and correctness
  db.run("PRAGMA journal_mode = WAL"); // Better concurrent reads
  db.run("PRAGMA synchronous = NORMAL"); // Balanced durability/speed
  db.run("PRAGMA foreign_keys = ON"); // Enforce FK constraints
  db.run("PRAGMA cache_size = -64000"); // 64MB cache

  // Create metadata tables
  db.exec(INIT_METADATA_SQL);

  return db;
}

/**
 * Get the current database instance.
 * Throws if initDatabase hasn't been called.
 *
 * @returns The Database instance
 * @throws Error if database not initialized
 */
export function getDatabase(): Database {
  if (!db) {
    throw new Error("Database not initialized. Call initDatabase first.");
  }
  return db;
}

/**
 * Close the database connection.
 * Safe to call multiple times.
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
