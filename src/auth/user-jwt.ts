import { SignJWT, jwtVerify } from "jose";
import { nanoid } from "nanoid";
import { getDatabase } from "../core/database";
import type { UserTokenPayload, RefreshTokenPayload } from "../types/auth";

/**
 * Get JWT secret from environment variable.
 * Uses the same secret as admin tokens for simplicity.
 */
function getSecret(): Uint8Array {
  const secret = Bun.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is required");
  }
  return new TextEncoder().encode(secret);
}

/**
 * Create a user access token (15 minute expiry).
 */
export async function createUserAccessToken(
  userId: string,
  collectionId: string,
  collectionName: string
): Promise<string> {
  return await new SignJWT({
    userId,
    collectionId,
    collectionName,
    type: "access",
  } as UserTokenPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(getSecret());
}

/**
 * Create a user refresh token (7 day expiry).
 * Stores token_id in database for revocation support.
 */
export async function createUserRefreshToken(
  userId: string,
  collectionId: string,
  collectionName: string
): Promise<{ token: string; tokenId: string }> {
  const tokenId = nanoid();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const token = await new SignJWT({
    userId,
    collectionId,
    collectionName,
    tokenId,
    type: "refresh",
  } as RefreshTokenPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());

  // Store in database
  const db = getDatabase();
  const id = nanoid();
  db.run(
    `INSERT INTO _refresh_tokens (id, user_id, collection_id, token_id, created_at, expires_at, revoked)
     VALUES (?, ?, ?, ?, ?, ?, 0)`,
    [id, userId, collectionId, tokenId, now.toISOString(), expiresAt.toISOString()]
  );

  return { token, tokenId };
}

/**
 * Verify a user token (access or refresh).
 * Returns payload or null if invalid/expired.
 */
export async function verifyUserToken<T extends "access" | "refresh">(
  token: string,
  expectedType: T
): Promise<(T extends "access" ? UserTokenPayload : RefreshTokenPayload) | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
    });

    // Verify required fields exist
    if (!payload.userId || typeof payload.userId !== "string") return null;
    if (!payload.collectionId || typeof payload.collectionId !== "string") return null;
    if (!payload.collectionName || typeof payload.collectionName !== "string") return null;
    if (!payload.type || payload.type !== expectedType) return null;

    // For refresh tokens, verify tokenId exists
    if (expectedType === "refresh") {
      if (!payload.tokenId || typeof payload.tokenId !== "string") return null;
    }

    return payload as T extends "access" ? UserTokenPayload : RefreshTokenPayload;
  } catch {
    return null;
  }
}

/**
 * Check if a refresh token is still valid (not revoked, not expired).
 */
export function checkRefreshTokenValid(tokenId: string): boolean {
  const db = getDatabase();
  const result = db
    .query<{ revoked: number; expires_at: string }, [string]>(
      `SELECT revoked, expires_at FROM _refresh_tokens WHERE token_id = ?`
    )
    .get(tokenId);

  if (!result) return false;
  if (result.revoked === 1) return false;
  if (new Date(result.expires_at) < new Date()) return false;

  return true;
}

/**
 * Revoke a specific refresh token.
 */
export function revokeRefreshToken(tokenId: string): void {
  const db = getDatabase();
  db.run(`UPDATE _refresh_tokens SET revoked = 1 WHERE token_id = ?`, [tokenId]);
}

/**
 * Revoke all refresh tokens for a user (force logout from all devices).
 */
export function revokeAllUserRefreshTokens(userId: string): void {
  const db = getDatabase();
  db.run(`UPDATE _refresh_tokens SET revoked = 1 WHERE user_id = ?`, [userId]);
}

/**
 * Clean up expired refresh tokens (can be called periodically).
 */
export function cleanupExpiredRefreshTokens(): number {
  const db = getDatabase();
  const result = db.run(`DELETE FROM _refresh_tokens WHERE expires_at < ?`, [
    new Date().toISOString(),
  ]);
  return result.changes;
}
