import { getDatabase } from "../core/database";
import { generateId } from "../utils/id";

/**
 * Admin account without password hash (safe to return to clients)
 */
export interface Admin {
  id: string;
  email: string;
  created_at: string;
  updated_at: string;
}

/**
 * Admin account with password hash (for internal use only)
 */
export interface AdminWithHash extends Admin {
  password_hash: string;
}

/**
 * Create a new admin account with hashed password.
 * Uses Bun.password.hash with argon2id algorithm.
 *
 * @param email - Admin email address
 * @param password - Plain text password to hash
 * @returns The created admin (without password_hash)
 * @throws Error if email already exists
 */
export async function createAdmin(
  email: string,
  password: string
): Promise<Admin> {
  const db = getDatabase();

  // Hash password using argon2id (Bun's default and most secure)
  const password_hash = await Bun.password.hash(password, {
    algorithm: "argon2id",
    memoryCost: 65536, // 64MB memory
    timeCost: 2, // 2 iterations
  });

  const id = generateId();
  const now = new Date().toISOString().replace("T", " ").replace("Z", "");

  try {
    db.run(
      `INSERT INTO _admins (id, email, password_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [id, email, password_hash, now, now]
    );
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      error.message.includes("UNIQUE constraint failed")
    ) {
      throw new Error(`Admin with email "${email}" already exists`);
    }
    throw error;
  }

  return {
    id,
    email,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Get an admin by email address.
 * Returns admin with password_hash for internal verification.
 *
 * @param email - Admin email address
 * @returns Admin with password hash or null if not found
 */
export function getAdminByEmail(email: string): AdminWithHash | null {
  const db = getDatabase();
  const result = db
    .query<AdminWithHash, [string]>(
      `SELECT id, email, password_hash, created_at, updated_at
       FROM _admins WHERE email = ?`
    )
    .get(email);

  return result ?? null;
}

/**
 * Get an admin by ID.
 * Returns admin with password_hash for internal verification.
 *
 * @param id - Admin ID
 * @returns Admin with password hash or null if not found
 */
export function getAdminById(id: string): AdminWithHash | null {
  const db = getDatabase();
  const result = db
    .query<AdminWithHash, [string]>(
      `SELECT id, email, password_hash, created_at, updated_at
       FROM _admins WHERE id = ?`
    )
    .get(id);

  return result ?? null;
}

/**
 * Verify an admin's password.
 * Returns the admin (without password_hash) if password is correct.
 *
 * @param email - Admin email address
 * @param password - Plain text password to verify
 * @returns Admin without password hash or null if credentials invalid
 */
export async function verifyAdminPassword(
  email: string,
  password: string
): Promise<Admin | null> {
  const admin = getAdminByEmail(email);
  if (!admin) {
    return null;
  }

  const isValid = await Bun.password.verify(password, admin.password_hash);
  if (!isValid) {
    return null;
  }

  // Return admin without password_hash
  const { password_hash: _, ...safeAdmin } = admin;
  return safeAdmin;
}

/**
 * Update an admin's password.
 * Hashes the new password and updates the database.
 *
 * @param id - Admin ID
 * @param newPassword - New plain text password to hash
 * @throws Error if admin not found
 */
export async function updateAdminPassword(
  id: string,
  newPassword: string
): Promise<void> {
  const db = getDatabase();

  // Verify admin exists
  const admin = getAdminById(id);
  if (!admin) {
    throw new Error(`Admin with id "${id}" not found`);
  }

  // Hash new password
  const password_hash = await Bun.password.hash(newPassword, {
    algorithm: "argon2id",
    memoryCost: 65536,
    timeCost: 2,
  });

  const now = new Date().toISOString().replace("T", " ").replace("Z", "");

  db.run(`UPDATE _admins SET password_hash = ?, updated_at = ? WHERE id = ?`, [
    password_hash,
    now,
    id,
  ]);
}
