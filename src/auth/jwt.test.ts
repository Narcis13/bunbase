import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import { SignJWT } from "jose";
import { createAdminToken, verifyAdminToken } from "./jwt";

// Store original JWT_SECRET to restore later
const originalJwtSecret = process.env.JWT_SECRET;

describe("jwt module", () => {
  beforeAll(() => {
    // Set a test secret for all tests
    process.env.JWT_SECRET = "test-secret-at-least-32-characters-long";
  });

  afterAll(() => {
    // Restore original JWT_SECRET
    if (originalJwtSecret) {
      process.env.JWT_SECRET = originalJwtSecret;
    } else {
      delete process.env.JWT_SECRET;
    }
  });

  describe("createAdminToken", () => {
    test("returns a string token (3 dot-separated parts)", async () => {
      const token = await createAdminToken("admin-123");

      expect(typeof token).toBe("string");
      const parts = token.split(".");
      expect(parts.length).toBe(3); // header.payload.signature
    });

    test("throws if JWT_SECRET not set", async () => {
      // Temporarily remove JWT_SECRET
      const backup = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;

      try {
        await expect(createAdminToken("admin-123")).rejects.toThrow(
          "JWT_SECRET environment variable is required"
        );
      } finally {
        // Restore JWT_SECRET
        process.env.JWT_SECRET = backup;
      }
    });
  });

  describe("verifyAdminToken", () => {
    test("returns payload with adminId for valid token", async () => {
      const token = await createAdminToken("admin-456");

      const payload = await verifyAdminToken(token);

      expect(payload).not.toBeNull();
      expect(payload!.adminId).toBe("admin-456");
    });

    test("returns null for invalid token", async () => {
      const payload = await verifyAdminToken("invalid.token.here");

      expect(payload).toBeNull();
    });

    test("returns null for malformed token", async () => {
      const payload = await verifyAdminToken("not-even-close");

      expect(payload).toBeNull();
    });

    test("returns null for expired token", async () => {
      // Create a token that expires immediately (in the past)
      const secret = new TextEncoder().encode(
        "test-secret-at-least-32-characters-long"
      );
      const expiredToken = await new SignJWT({ adminId: "admin-789" })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt(Math.floor(Date.now() / 1000) - 3600) // Issued 1 hour ago
        .setExpirationTime(Math.floor(Date.now() / 1000) - 1800) // Expired 30 mins ago
        .sign(secret);

      const payload = await verifyAdminToken(expiredToken);

      expect(payload).toBeNull();
    });

    test("returns null for token signed with different secret", async () => {
      // Create a token with a different secret
      const differentSecret = new TextEncoder().encode(
        "different-secret-not-the-same-one"
      );
      const tokenWithWrongSecret = await new SignJWT({ adminId: "admin-wrong" })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("24h")
        .sign(differentSecret);

      const payload = await verifyAdminToken(tokenWithWrongSecret);

      expect(payload).toBeNull();
    });

    test("returns null for token without adminId", async () => {
      // Create a token without adminId
      const secret = new TextEncoder().encode(
        "test-secret-at-least-32-characters-long"
      );
      const tokenWithoutAdminId = await new SignJWT({ userId: "user-123" }) // Wrong payload key
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("24h")
        .sign(secret);

      const payload = await verifyAdminToken(tokenWithoutAdminId);

      expect(payload).toBeNull();
    });
  });
});
