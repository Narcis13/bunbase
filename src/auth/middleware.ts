import { verifyAdminToken } from "./jwt";
import { getAdminById, Admin } from "./admin";

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
 * Verify request has valid admin JWT.
 * Returns Admin if valid, or 401 Response if not.
 *
 * @param req - The incoming request
 * @returns Admin (without password_hash) if valid, or 401 Response if not
 */
export async function requireAdmin(req: Request): Promise<Admin | Response> {
  const token = extractBearerToken(req);
  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await verifyAdminToken(token);
  if (!payload) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getAdminById(payload.adminId);
  if (!admin) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Return admin without password_hash
  const { password_hash: _, ...safeAdmin } = admin;
  return safeAdmin;
}
