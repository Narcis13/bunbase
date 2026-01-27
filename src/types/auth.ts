import type { JWTPayload } from "jose";

/**
 * User without password hash (safe to return to clients)
 */
export interface User {
  id: string;
  email: string;
  verified: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * User with password hash (internal use only)
 */
export interface UserWithHash extends User {
  password_hash: string;
}

/**
 * Auth collection configuration options
 */
export interface AuthCollectionOptions {
  /** Minimum password length (default: 8) */
  minPasswordLength?: number;
  /** Require email verification before login (default: false) */
  requireEmailVerification?: boolean;
}

/**
 * JWT payload for user access tokens (15 min)
 */
export interface UserTokenPayload extends JWTPayload {
  userId: string;
  collectionId: string;
  collectionName: string;
  type: "access";
}

/**
 * JWT payload for refresh tokens (7 days)
 */
export interface RefreshTokenPayload extends JWTPayload {
  userId: string;
  collectionId: string;
  collectionName: string;
  /** Unique ID for revocation lookup */
  tokenId: string;
  type: "refresh";
}
