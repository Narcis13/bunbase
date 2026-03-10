/**
 * Shared database initialization for non-serve CLI commands.
 *
 * Resolves the database path from --db flag or BUNBASE_DB env var,
 * then initializes the database for direct access.
 */

import { initDatabase } from "../core/database";

/**
 * Initialize the database for CLI commands.
 * Priority: explicit dbPath arg > BUNBASE_DB env var > "bunbase.db"
 */
export function initForCli(dbPath?: string): void {
  const resolved = dbPath ?? Bun.env.BUNBASE_DB ?? "bunbase.db";
  initDatabase(resolved);
}
