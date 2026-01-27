import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import { SignJWT } from "jose";
import { initDatabase, closeDatabase, getDatabase } from "../core/database";
import {
  createUserAccessToken,
  createUserRefreshToken,
  verifyUserToken,
  checkRefreshTokenValid,
  revokeRefreshToken,
  revokeAllUserRefreshTokens,
  cleanupExpiredRefreshTokens,
} from "./user-jwt";

// Store original JWT_SECRET to restore later
const originalJwtSecret = process.env.JWT_SECRET;

describe("user-jwt module", () => {
  beforeAll(() => {
    // Set a test secret for all tests
    process.env.JWT_SECRET = "test-secret-at-least-32-characters-long";
    // Initialize in-memory database
    initDatabase(":memory:");
  });

  afterAll(() => {
    // Close database
    closeDatabase();
    // Restore original JWT_SECRET
    if (originalJwtSecret) {
      process.env.JWT_SECRET = originalJwtSecret;
    } else {
      delete process.env.JWT_SECRET;
    }
  });

  beforeEach(() => {
    // Clear refresh tokens table before each test
    const db = getDatabase();
    db.run("DELETE FROM _refresh_tokens");
  });

  describe("createUserAccessToken", () => {
    test("creates valid JWT with 3 dot-separated parts", async () => {
      const token = await createUserAccessToken(
        "user-123",
        "collection-456",
        "users"
      );

      expect(typeof token).toBe("string");
      const parts = token.split(".");
      expect(parts.length).toBe(3); // header.payload.signature
    });

    test("throws if JWT_SECRET not set", async () => {
      const backup = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;

      try {
        await expect(
          createUserAccessToken("user-123", "collection-456", "users")
        ).rejects.toThrow("JWT_SECRET environment variable is required");
      } finally {
        process.env.JWT_SECRET = backup;
      }
    });
  });

  describe("createUserRefreshToken", () => {
    test("creates valid JWT and returns token with tokenId", async () => {
      const result = await createUserRefreshToken(
        "user-123",
        "collection-456",
        "users"
      );

      expect(typeof result.token).toBe("string");
      expect(typeof result.tokenId).toBe("string");
      expect(result.tokenId.length).toBeGreaterThan(0);

      const parts = result.token.split(".");
      expect(parts.length).toBe(3);
    });

    test("stores token in database", async () => {
      const result = await createUserRefreshToken(
        "user-123",
        "collection-456",
        "users"
      );

      const db = getDatabase();
      const row = db
        .query<{ token_id: string; user_id: string; revoked: number }, [string]>(
          "SELECT token_id, user_id, revoked FROM _refresh_tokens WHERE token_id = ?"
        )
        .get(result.tokenId);

      expect(row).not.toBeNull();
      expect(row!.token_id).toBe(result.tokenId);
      expect(row!.user_id).toBe("user-123");
      expect(row!.revoked).toBe(0);
    });
  });

  describe("verifyUserToken - access tokens", () => {
    test("returns payload for valid access token", async () => {
      const token = await createUserAccessToken(
        "user-456",
        "collection-789",
        "members"
      );

      const payload = await verifyUserToken(token, "access");

      expect(payload).not.toBeNull();
      expect(payload!.userId).toBe("user-456");
      expect(payload!.collectionId).toBe("collection-789");
      expect(payload!.collectionName).toBe("members");
      expect(payload!.type).toBe("access");
    });

    test("returns null for invalid token", async () => {
      const payload = await verifyUserToken("invalid.token.here", "access");
      expect(payload).toBeNull();
    });

    test("returns null for malformed token", async () => {
      const payload = await verifyUserToken("not-a-jwt", "access");
      expect(payload).toBeNull();
    });

    test("returns null when expecting access but given refresh token", async () => {
      const { token } = await createUserRefreshToken(
        "user-123",
        "collection-456",
        "users"
      );

      const payload = await verifyUserToken(token, "access");
      expect(payload).toBeNull();
    });

    test("returns null for expired token", async () => {
      const secret = new TextEncoder().encode(
        "test-secret-at-least-32-characters-long"
      );
      const expiredToken = await new SignJWT({
        userId: "user-789",
        collectionId: "collection-123",
        collectionName: "users",
        type: "access",
      })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
        .setExpirationTime(Math.floor(Date.now() / 1000) - 1800)
        .sign(secret);

      const payload = await verifyUserToken(expiredToken, "access");
      expect(payload).toBeNull();
    });

    test("returns null for token signed with different secret", async () => {
      const differentSecret = new TextEncoder().encode(
        "different-secret-not-the-same-one"
      );
      const wrongToken = await new SignJWT({
        userId: "user-wrong",
        collectionId: "collection-wrong",
        collectionName: "wrong",
        type: "access",
      })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("15m")
        .sign(differentSecret);

      const payload = await verifyUserToken(wrongToken, "access");
      expect(payload).toBeNull();
    });
  });

  describe("verifyUserToken - refresh tokens", () => {
    test("returns payload for valid refresh token", async () => {
      const { token, tokenId } = await createUserRefreshToken(
        "user-456",
        "collection-789",
        "members"
      );

      const payload = await verifyUserToken(token, "refresh");

      expect(payload).not.toBeNull();
      expect(payload!.userId).toBe("user-456");
      expect(payload!.collectionId).toBe("collection-789");
      expect(payload!.collectionName).toBe("members");
      expect(payload!.tokenId).toBe(tokenId);
      expect(payload!.type).toBe("refresh");
    });

    test("returns null when expecting refresh but given access token", async () => {
      const token = await createUserAccessToken(
        "user-123",
        "collection-456",
        "users"
      );

      const payload = await verifyUserToken(token, "refresh");
      expect(payload).toBeNull();
    });

    test("returns null for refresh token without tokenId", async () => {
      const secret = new TextEncoder().encode(
        "test-secret-at-least-32-characters-long"
      );
      const tokenWithoutId = await new SignJWT({
        userId: "user-789",
        collectionId: "collection-123",
        collectionName: "users",
        type: "refresh",
        // Missing tokenId
      })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("7d")
        .sign(secret);

      const payload = await verifyUserToken(tokenWithoutId, "refresh");
      expect(payload).toBeNull();
    });
  });

  describe("checkRefreshTokenValid", () => {
    test("returns true for valid non-revoked token", async () => {
      const { tokenId } = await createUserRefreshToken(
        "user-123",
        "collection-456",
        "users"
      );

      const valid = checkRefreshTokenValid(tokenId);
      expect(valid).toBe(true);
    });

    test("returns false for non-existent token", () => {
      const valid = checkRefreshTokenValid("non-existent-token-id");
      expect(valid).toBe(false);
    });

    test("returns false for revoked token", async () => {
      const { tokenId } = await createUserRefreshToken(
        "user-123",
        "collection-456",
        "users"
      );

      revokeRefreshToken(tokenId);

      const valid = checkRefreshTokenValid(tokenId);
      expect(valid).toBe(false);
    });

    test("returns false for expired token", async () => {
      const db = getDatabase();
      const tokenId = "test-expired-token";
      const pastDate = new Date(Date.now() - 1000).toISOString();

      db.run(
        `INSERT INTO _refresh_tokens (id, user_id, collection_id, token_id, created_at, expires_at, revoked)
         VALUES (?, ?, ?, ?, ?, ?, 0)`,
        ["id-1", "user-123", "collection-456", tokenId, pastDate, pastDate]
      );

      const valid = checkRefreshTokenValid(tokenId);
      expect(valid).toBe(false);
    });
  });

  describe("revokeRefreshToken", () => {
    test("marks token as revoked", async () => {
      const { tokenId } = await createUserRefreshToken(
        "user-123",
        "collection-456",
        "users"
      );

      revokeRefreshToken(tokenId);

      const db = getDatabase();
      const row = db
        .query<{ revoked: number }, [string]>(
          "SELECT revoked FROM _refresh_tokens WHERE token_id = ?"
        )
        .get(tokenId);

      expect(row).not.toBeNull();
      expect(row!.revoked).toBe(1);
    });

    test("does not affect other tokens", async () => {
      const result1 = await createUserRefreshToken(
        "user-123",
        "collection-456",
        "users"
      );
      const result2 = await createUserRefreshToken(
        "user-123",
        "collection-456",
        "users"
      );

      revokeRefreshToken(result1.tokenId);

      expect(checkRefreshTokenValid(result1.tokenId)).toBe(false);
      expect(checkRefreshTokenValid(result2.tokenId)).toBe(true);
    });
  });

  describe("revokeAllUserRefreshTokens", () => {
    test("revokes all tokens for a user", async () => {
      const result1 = await createUserRefreshToken(
        "user-123",
        "collection-456",
        "users"
      );
      const result2 = await createUserRefreshToken(
        "user-123",
        "collection-456",
        "users"
      );
      const result3 = await createUserRefreshToken(
        "user-999",
        "collection-456",
        "users"
      );

      revokeAllUserRefreshTokens("user-123");

      expect(checkRefreshTokenValid(result1.tokenId)).toBe(false);
      expect(checkRefreshTokenValid(result2.tokenId)).toBe(false);
      // Other user's token should still be valid
      expect(checkRefreshTokenValid(result3.tokenId)).toBe(true);
    });
  });

  describe("cleanupExpiredRefreshTokens", () => {
    test("removes expired tokens", async () => {
      const db = getDatabase();
      const pastDate = new Date(Date.now() - 1000).toISOString();

      // Insert an expired token
      db.run(
        `INSERT INTO _refresh_tokens (id, user_id, collection_id, token_id, created_at, expires_at, revoked)
         VALUES (?, ?, ?, ?, ?, ?, 0)`,
        ["id-expired", "user-123", "collection-456", "expired-token", pastDate, pastDate]
      );

      // Insert a valid token
      await createUserRefreshToken("user-456", "collection-789", "members");

      const deleted = cleanupExpiredRefreshTokens();

      expect(deleted).toBe(1);

      // Verify expired token is gone
      const row = db
        .query<{ id: string }, [string]>(
          "SELECT id FROM _refresh_tokens WHERE token_id = ?"
        )
        .get("expired-token");
      expect(row).toBeNull();

      // Verify valid token still exists
      const count = db
        .query<{ count: number }, []>(
          "SELECT COUNT(*) as count FROM _refresh_tokens"
        )
        .get();
      expect(count!.count).toBe(1);
    });
  });
});
