import { getDatabase } from "../core/database";
import { getCollection, isAuthCollection } from "../core/schema";
import { generateId } from "../utils/id";
import { validatePassword } from "./validation";
import {
  createUserAccessToken,
  createUserRefreshToken,
  verifyUserToken,
  checkRefreshTokenValid,
  revokeRefreshToken,
  revokeAllUserRefreshTokens,
} from "./user-jwt";
import type { User, UserWithHash, AuthCollectionOptions } from "../types/auth";

// Pre-computed dummy hash for timing attack prevention
// This is a valid argon2id hash that will always fail verification
const DUMMY_HASH = "$argon2id$v=19$m=65536,t=2,p=1$abcdefghijklmnop$abcdefghijklmnopqrstuvwxyz123456";

export interface SignupResult {
  success: boolean;
  user?: User;
  error?: string;
}

export interface LoginResult {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  user?: User;
  error?: string;
}

export interface RefreshResult {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  error?: string;
}

/**
 * Get auth collection options (minPasswordLength, requireEmailVerification).
 */
function getAuthOptions(collectionName: string): AuthCollectionOptions {
  const collection = getCollection(collectionName);
  if (!collection || collection.type !== 'auth') {
    throw new Error(`"${collectionName}" is not an auth collection`);
  }
  return collection.options ? JSON.parse(collection.options) : {};
}

/**
 * Get user by ID from an auth collection.
 */
export function getUserById(collectionName: string, id: string): UserWithHash | null {
  if (!isAuthCollection(collectionName)) {
    throw new Error(`"${collectionName}" is not an auth collection`);
  }
  const db = getDatabase();
  const result = db.query<UserWithHash, [string]>(
    `SELECT id, email, password_hash, verified, created_at, updated_at
     FROM "${collectionName}" WHERE id = ?`
  ).get(id);
  return result ?? null;
}

/**
 * Get user by email from an auth collection.
 */
export function getUserByEmail(collectionName: string, email: string): UserWithHash | null {
  if (!isAuthCollection(collectionName)) {
    throw new Error(`"${collectionName}" is not an auth collection`);
  }
  const db = getDatabase();
  const result = db.query<UserWithHash, [string]>(
    `SELECT id, email, password_hash, verified, created_at, updated_at
     FROM "${collectionName}" WHERE email = ?`
  ).get(email);
  return result ?? null;
}

/**
 * Create a new user account.
 */
export async function createUser(
  collectionName: string,
  email: string,
  password: string
): Promise<SignupResult> {
  // Validate collection is auth type
  const collection = getCollection(collectionName);
  if (!collection || collection.type !== 'auth') {
    return { success: false, error: `"${collectionName}" is not an auth collection` };
  }

  // Validate email format
  if (!email || !email.includes('@')) {
    return { success: false, error: 'Invalid email address' };
  }

  // Check if email already exists
  const existing = getUserByEmail(collectionName, email);
  if (existing) {
    return { success: false, error: 'Email already registered' };
  }

  // Validate password
  const options = getAuthOptions(collectionName);
  try {
    validatePassword(password, options.minPasswordLength ?? 8);
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  // Hash password
  const password_hash = await Bun.password.hash(password, {
    algorithm: "argon2id",
    memoryCost: 65536,
    timeCost: 2,
  });

  const id = generateId();
  const now = new Date().toISOString();

  // Insert user
  const db = getDatabase();
  try {
    db.run(
      `INSERT INTO "${collectionName}" (id, email, password_hash, verified, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, ?)`,
      [id, email, password_hash, now, now]
    );
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint")) {
      return { success: false, error: 'Email already registered' };
    }
    throw error;
  }

  return {
    success: true,
    user: { id, email, verified: false, created_at: now, updated_at: now },
  };
}

/**
 * Authenticate user and return tokens.
 * Uses constant-time comparison to prevent timing attacks.
 */
export async function loginUser(
  collectionName: string,
  email: string,
  password: string
): Promise<LoginResult> {
  // Validate collection is auth type
  const collection = getCollection(collectionName);
  if (!collection || collection.type !== 'auth') {
    return { success: false, error: `"${collectionName}" is not an auth collection` };
  }

  // Get user (may be null)
  const user = getUserByEmail(collectionName, email);

  // TIMING ATTACK PREVENTION: Always verify against something
  // If user doesn't exist, verify against dummy hash (same time cost)
  const hashToVerify = user?.password_hash ?? DUMMY_HASH;
  const isValid = await Bun.password.verify(password, hashToVerify);

  // Generic error message (don't reveal if email exists)
  if (!user || !isValid) {
    return { success: false, error: 'Invalid credentials' };
  }

  // Check email verification requirement
  const options = getAuthOptions(collectionName);
  if (options.requireEmailVerification && !user.verified) {
    return { success: false, error: 'Email not verified' };
  }

  // Generate tokens
  const accessToken = await createUserAccessToken(user.id, collection.id, collectionName);
  const { token: refreshToken } = await createUserRefreshToken(user.id, collection.id, collectionName);

  // Return user without password_hash
  const { password_hash: _, ...safeUser } = user;

  return {
    success: true,
    accessToken,
    refreshToken,
    user: safeUser,
  };
}

/**
 * Refresh tokens using a valid refresh token.
 * Implements token rotation (old refresh token revoked, new one issued).
 */
export async function refreshTokens(refreshToken: string): Promise<RefreshResult> {
  // Verify the refresh token
  const payload = await verifyUserToken(refreshToken, 'refresh');
  if (!payload) {
    return { success: false, error: 'Invalid refresh token' };
  }

  // Check if token is revoked
  if (!checkRefreshTokenValid(payload.tokenId)) {
    return { success: false, error: 'Refresh token revoked' };
  }

  // Revoke old refresh token (rotation)
  revokeRefreshToken(payload.tokenId);

  // Issue new tokens
  const accessToken = await createUserAccessToken(
    payload.userId,
    payload.collectionId,
    payload.collectionName
  );
  const { token: newRefreshToken } = await createUserRefreshToken(
    payload.userId,
    payload.collectionId,
    payload.collectionName
  );

  return {
    success: true,
    accessToken,
    refreshToken: newRefreshToken,
  };
}

/**
 * Update user password and revoke all refresh tokens.
 */
export async function updateUserPassword(
  collectionName: string,
  userId: string,
  newPassword: string
): Promise<void> {
  if (!isAuthCollection(collectionName)) {
    throw new Error(`"${collectionName}" is not an auth collection`);
  }

  const user = getUserById(collectionName, userId);
  if (!user) {
    throw new Error('User not found');
  }

  const options = getAuthOptions(collectionName);
  validatePassword(newPassword, options.minPasswordLength ?? 8);

  const password_hash = await Bun.password.hash(newPassword, {
    algorithm: "argon2id",
    memoryCost: 65536,
    timeCost: 2,
  });

  const now = new Date().toISOString();
  const db = getDatabase();
  db.run(
    `UPDATE "${collectionName}" SET password_hash = ?, updated_at = ? WHERE id = ?`,
    [password_hash, now, userId]
  );

  // Revoke all refresh tokens (force re-login)
  revokeAllUserRefreshTokens(userId);
}
