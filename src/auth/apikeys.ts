/**
 * API Key Authentication System
 *
 * Provides create, verify, list, and revoke operations for API keys.
 * Keys use the format `bb_<nanoid(32)>` and are stored as argon2id hashes.
 * API keys grant admin-level access for AI agent programmatic use.
 */

import { getDatabase } from "../core/database";
import { generateId } from "../utils/id";
import { nanoid } from "nanoid";

export interface ApiKeyInfo {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
}

export interface ApiKeyCreateResult extends ApiKeyInfo {
  key: string; // Only returned on creation
}

/**
 * Create a new API key.
 * The raw key is only returned once — it cannot be retrieved later.
 *
 * @param name - Human-readable label for the key
 * @returns The created key info including the raw key
 */
export async function createApiKey(name: string): Promise<ApiKeyCreateResult> {
  const db = getDatabase();

  const id = generateId();
  const rawKey = `bb_${nanoid(32)}`;
  const keyPrefix = rawKey.slice(3, 11); // 8 chars after "bb_"

  const keyHash = await Bun.password.hash(rawKey, {
    algorithm: "argon2id",
    memoryCost: 65536,
    timeCost: 2,
  });

  const now = new Date().toISOString().replace("T", " ").replace("Z", "");

  db.run(
    `INSERT INTO _api_keys (id, name, key_prefix, key_hash, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [id, name, keyPrefix, keyHash, now]
  );

  return {
    id,
    name,
    key: rawKey,
    key_prefix: keyPrefix,
    created_at: now,
    last_used_at: null,
  };
}

/**
 * Verify an API key and return its info if valid.
 *
 * Flow:
 * 1. Extract prefix from key (chars 3-11)
 * 2. Query candidates by prefix (index scan, typically 1 row)
 * 3. Verify full key against argon2id hash
 * 4. On match: async update last_used_at, return key info
 *
 * @param key - The raw API key to verify
 * @returns Key info if valid, null if invalid
 */
export async function verifyApiKey(key: string): Promise<{ id: string; name: string } | null> {
  if (!key.startsWith("bb_") || key.length < 11) {
    return null;
  }

  const db = getDatabase();
  const prefix = key.slice(3, 11);

  const candidates = db
    .query<{ id: string; name: string; key_hash: string }, [string]>(
      `SELECT id, name, key_hash FROM _api_keys WHERE key_prefix = ?`
    )
    .all(prefix);

  for (const candidate of candidates) {
    const isValid = await Bun.password.verify(key, candidate.key_hash);
    if (isValid) {
      // Async update last_used_at (non-blocking)
      updateLastUsed(candidate.id);
      return { id: candidate.id, name: candidate.name };
    }
  }

  return null;
}

/**
 * List all API keys (without hashes).
 *
 * @returns Array of API key info
 */
export function listApiKeys(): ApiKeyInfo[] {
  const db = getDatabase();
  return db
    .query<ApiKeyInfo, []>(
      `SELECT id, name, key_prefix, created_at, last_used_at
       FROM _api_keys ORDER BY created_at DESC`
    )
    .all();
}

/**
 * Revoke (delete) an API key by ID.
 *
 * @param id - The API key ID to revoke
 * @returns true if a key was deleted, false if not found
 */
export function revokeApiKey(id: string): boolean {
  const db = getDatabase();
  const result = db.run(`DELETE FROM _api_keys WHERE id = ?`, [id]);
  return result.changes > 0;
}

/**
 * Update the last_used_at timestamp for an API key.
 * Called asynchronously after successful verification.
 *
 * @param id - The API key ID
 */
export function updateLastUsed(id: string): void {
  try {
    const db = getDatabase();
    const now = new Date().toISOString().replace("T", " ").replace("Z", "");
    db.run(`UPDATE _api_keys SET last_used_at = ? WHERE id = ?`, [now, id]);
  } catch {
    // Non-critical — silently ignore failures
  }
}
