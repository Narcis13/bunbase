import { SignJWT, jwtVerify, type JWTPayload } from "jose";

/**
 * Get the JWT secret from environment variable.
 * Fails fast if JWT_SECRET is not set.
 *
 * @returns The secret as Uint8Array for use with jose
 * @throws Error if JWT_SECRET environment variable is not set
 */
function getSecret(): Uint8Array {
  const secret = Bun.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is required");
  }
  return new TextEncoder().encode(secret);
}

/**
 * JWT payload for admin authentication tokens.
 */
export interface AdminTokenPayload extends JWTPayload {
  adminId: string;
}

/**
 * Create a JWT token for an admin.
 * Token is signed with HS256 and expires in 24 hours.
 *
 * @param adminId - The admin's ID to encode in the token
 * @returns The signed JWT token string
 * @throws Error if JWT_SECRET is not set
 */
export async function createAdminToken(adminId: string): Promise<string> {
  return await new SignJWT({ adminId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(getSecret());
}

/**
 * Verify a JWT token and extract the admin payload.
 * Returns null for invalid, expired, or malformed tokens.
 *
 * @param token - The JWT token string to verify
 * @returns The token payload with adminId, or null if invalid
 */
export async function verifyAdminToken(
  token: string
): Promise<AdminTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
    });

    // Ensure adminId exists and is a string
    if (!payload.adminId || typeof payload.adminId !== "string") {
      return null;
    }

    return payload as AdminTokenPayload;
  } catch {
    // Return null for any verification error (expired, invalid signature, malformed)
    return null;
  }
}
