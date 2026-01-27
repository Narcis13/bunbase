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
    type TEXT NOT NULL DEFAULT 'base' CHECK(type IN ('base', 'auth')),
    options TEXT,
    rules TEXT,
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

  CREATE TABLE IF NOT EXISTS _admins (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS _refresh_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    collection_id TEXT NOT NULL,
    token_id TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    revoked INTEGER DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON _refresh_tokens(user_id);
  CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_id ON _refresh_tokens(token_id);

  CREATE TABLE IF NOT EXISTS _verification_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    collection_name TEXT NOT NULL,
    token_hash TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_verification_tokens_user_id ON _verification_tokens(user_id);
  CREATE INDEX IF NOT EXISTS idx_verification_tokens_hash ON _verification_tokens(token_hash);
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
