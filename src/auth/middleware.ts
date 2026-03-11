import { verifyAdminToken } from "./jwt";
import { getAdminById, Admin } from "./admin";
import { verifyUserToken } from "./user-jwt";
import { getUserById } from "./user";
import { verifyApiKey } from "./apikeys";
import type { User } from "../types/auth";

/**
 * Create a 401 response with a specific error message.
 */
function authError(message: string): Response {
  return Response.json({ error: message }, { status: 401 });
}

/**
 * Extract Bearer token from Authorization header.
 *
 * @param req - The incoming request
 * @returns The token string or null if not present/invalid format
 */
export function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.slice(7); // "Bearer ".length === 7
  return token || null; // Return null for empty tokens
}

/**
 * Extract token from Authorization header OR query parameter.
 * Useful for file downloads where browser can't set headers.
 *
 * @param req - The incoming request
 * @returns The token string or null if not present
 */
export function extractToken(req: Request): string | null {
  // Try header first
  const headerToken = extractBearerToken(req);
  if (headerToken) {
    return headerToken;
  }

  // Fall back to query parameter
  const url = new URL(req.url);
  const queryToken = url.searchParams.get("token");
  return queryToken || null;
}

/**
 * Verify request has valid admin JWT.
 * Returns Admin if valid, or 401 Response if not.
 *
 * @param req - The incoming request
 * @returns Admin (without password_hash) if valid, or 401 Response if not
 */
export async function requireAdmin(req: Request): Promise<Admin | Response> {
  // Check API key first — API keys have admin-level access
  const apiKey = req.headers.get("X-API-Key");
  if (apiKey) {
    const verified = await verifyApiKey(apiKey);
    if (verified) {
      return {
        id: verified.id,
        email: `apikey:${verified.name}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } satisfies Admin;
    }
    return authError("Invalid API key");
  }

  // Check Bearer token (admin JWT)
  const token = extractBearerToken(req);
  if (!token) {
    return authError("No authentication credentials provided");
  }

  const payload = await verifyAdminToken(token);
  if (!payload) {
    return authError("Invalid or expired admin token");
  }

  const admin = getAdminById(payload.adminId);
  if (!admin) {
    return authError("Admin account not found");
  }

  // Return admin without password_hash
  const { password_hash: _, ...safeAdmin } = admin;
  return safeAdmin;
}

/**
 * User with collection context for auth rules.
 */
export interface AuthenticatedUser extends User {
  collectionId: string;
  collectionName: string;
}

/**
 * Require valid user JWT for request.
 * Returns authenticated user or 401 Response.
 */
export async function requireUser(req: Request): Promise<AuthenticatedUser | Response> {
  const token = extractBearerToken(req);
  if (!token) {
    return authError("No authentication credentials provided");
  }

  const payload = await verifyUserToken(token, 'access');
  if (!payload) {
    return authError("Invalid or expired user token");
  }

  const user = getUserById(payload.collectionName, payload.userId);
  if (!user) {
    return authError("User account not found");
  }

  // Return user without password_hash, with collection context
  const { password_hash: _, ...safeUser } = user;
  return {
    ...safeUser,
    collectionId: payload.collectionId,
    collectionName: payload.collectionName,
  };
}

/**
 * Optional user auth - attaches user if valid token present, null otherwise.
 * Never returns error Response, always continues.
 */
export async function optionalUser(req: Request): Promise<AuthenticatedUser | null> {
  const token = extractBearerToken(req);
  if (!token) return null;

  return verifyUserFromToken(token);
}

/**
 * Verify user from a token string directly.
 * Returns authenticated user or null if invalid.
 */
export async function verifyUserFromToken(token: string): Promise<AuthenticatedUser | null> {
  const payload = await verifyUserToken(token, 'access');
  if (!payload) return null;

  const user = getUserById(payload.collectionName, payload.userId);
  if (!user) return null;

  const { password_hash: _, ...safeUser } = user;
  return {
    ...safeUser,
    collectionId: payload.collectionId,
    collectionName: payload.collectionName,
  };
}
