/**
 * Verification Token Management
 *
 * Provides secure token generation, storage, and verification for email
 * verification and password reset flows. Tokens are hashed before storage
 * (security best practice - never store plain tokens).
 */

import { nanoid } from "nanoid";
import { getDatabase } from "../core/database";
import { sendEmail } from "../email/send";
import { getCollection, isAuthCollection } from "../core/schema";
import type { UserWithHash } from "../types/auth";

export type TokenType = "email_verification" | "password_reset";

/**
 * Hash a token using SHA-256 (tokens are never stored in plain text).
 */
async function hashToken(token: string): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(token);
  return hasher.digest("hex");
}

/**
 * Generate a secure random token (64 characters).
 */
function generateSecureToken(): string {
  return nanoid(64);
}

/**
 * Get user by ID from an auth collection.
 * Note: This function will be consolidated into src/auth/user.ts in 10-03.
 */
function getUserById(collectionName: string, id: string): UserWithHash | null {
  if (!isAuthCollection(collectionName)) {
    throw new Error(`"${collectionName}" is not an auth collection`);
  }
  const db = getDatabase();
  const result = db
    .query<UserWithHash, [string]>(
      `SELECT id, email, password_hash, verified, created_at, updated_at
     FROM "${collectionName}" WHERE id = ?`
    )
    .get(id);
  return result ?? null;
}

/**
 * Create a verification token and store its hash in the database.
 * Returns the plain token (to send to user) and the record ID.
 */
export async function createVerificationToken(
  userId: string,
  collectionName: string,
  type: TokenType
): Promise<{ token: string; id: string }> {
  const token = generateSecureToken();
  const tokenHash = await hashToken(token);
  const id = nanoid();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour

  const db = getDatabase();

  // Invalidate any existing unused tokens of this type for this user
  db.run(
    `UPDATE _verification_tokens SET used = 1
     WHERE user_id = ? AND collection_name = ? AND type = ? AND used = 0`,
    [userId, collectionName, type]
  );

  // Create new token
  db.run(
    `INSERT INTO _verification_tokens
     (id, user_id, collection_name, token_hash, type, expires_at, used, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
    [
      id,
      userId,
      collectionName,
      tokenHash,
      type,
      expiresAt.toISOString(),
      now.toISOString(),
    ]
  );

  return { token, id };
}

/**
 * Verify a token and return the associated user info if valid.
 * Returns null if token is invalid, expired, or already used.
 */
export async function verifyToken(
  token: string,
  expectedType: TokenType
): Promise<{ userId: string; collectionName: string } | null> {
  const tokenHash = await hashToken(token);
  const db = getDatabase();

  const record = db
    .query<
      {
        id: string;
        user_id: string;
        collection_name: string;
        type: string;
        expires_at: string;
        used: number;
      },
      [string]
    >(
      `SELECT id, user_id, collection_name, type, expires_at, used
     FROM _verification_tokens WHERE token_hash = ?`
    )
    .get(tokenHash);

  if (!record) return null;
  if (record.used === 1) return null;
  if (record.type !== expectedType) return null;
  if (new Date(record.expires_at) < new Date()) return null;

  return {
    userId: record.user_id,
    collectionName: record.collection_name,
  };
}

/**
 * Mark a token as used (single-use enforcement).
 */
export async function markTokenUsed(token: string): Promise<void> {
  const tokenHash = await hashToken(token);
  const db = getDatabase();
  db.run(`UPDATE _verification_tokens SET used = 1 WHERE token_hash = ?`, [
    tokenHash,
  ]);
}

/**
 * Request email verification for a user.
 * Sends verification email with token link.
 */
export async function requestEmailVerification(
  collectionName: string,
  userId: string,
  baseUrl: string
): Promise<{ success: boolean; error?: string }> {
  const user = getUserById(collectionName, userId);
  if (!user) {
    return { success: false, error: "User not found" };
  }

  if (user.verified) {
    return { success: false, error: "Email already verified" };
  }

  const { token } = await createVerificationToken(
    userId,
    collectionName,
    "email_verification"
  );
  const verificationLink = `${baseUrl}/api/collections/${collectionName}/auth/confirm-verification?token=${token}`;

  const result = await sendEmail({
    to: user.email,
    subject: "Verify your email address",
    text: `Please verify your email by clicking the link below:\n\n{{link}}\n\nThis link expires in 1 hour.`,
    html: `<p>Please verify your email by clicking the link below:</p><p><a href="{{link}}">Verify Email</a></p><p>This link expires in 1 hour.</p>`,
    placeholders: { link: verificationLink },
  });

  if (!result.success) {
    return { success: false, error: result.error };
  }

  return { success: true };
}

/**
 * Confirm email verification with token.
 */
export async function confirmEmailVerification(
  token: string
): Promise<{ success: boolean; error?: string }> {
  const tokenInfo = await verifyToken(token, "email_verification");
  if (!tokenInfo) {
    return { success: false, error: "Invalid or expired token" };
  }

  // Mark user as verified
  const db = getDatabase();
  const now = new Date().toISOString();
  db.run(
    `UPDATE "${tokenInfo.collectionName}" SET verified = 1, updated_at = ? WHERE id = ?`,
    [now, tokenInfo.userId]
  );

  // Mark token as used
  await markTokenUsed(token);

  return { success: true };
}

/**
 * Clean up expired verification tokens.
 */
export function cleanupExpiredVerificationTokens(): number {
  const db = getDatabase();
  const result = db.run(`DELETE FROM _verification_tokens WHERE expires_at < ?`, [
    new Date().toISOString(),
  ]);
  return result.changes;
}
