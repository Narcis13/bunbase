import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { initDatabase, closeDatabase, getDatabase } from "../core/database";
import { createCollection, deleteCollection, getCollection } from "../core/schema";
import {
  createUser,
  loginUser,
  refreshTokens,
  updateUserPassword,
  getUserById,
  getUserByEmail,
} from "./user";
import { checkRefreshTokenValid, verifyUserToken } from "./user-jwt";

// Set JWT_SECRET for tests
process.env.JWT_SECRET = "test-secret-key-for-user-auth-tests";

describe("User Auth Operations", () => {
  const testDbPath = `:memory:`;
  const collectionName = "users";

  beforeEach(() => {
    initDatabase(testDbPath);
    // Create an auth collection for testing
    createCollection(collectionName, [], { type: "auth" });
  });

  afterEach(() => {
    try {
      deleteCollection(collectionName);
    } catch {
      // Collection might not exist
    }
    closeDatabase();
  });

  describe("createUser", () => {
    test("creates user successfully", async () => {
      const result = await createUser(collectionName, "test@example.com", "Password1");

      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user!.email).toBe("test@example.com");
      expect(result.user!.verified).toBe(false);
      expect(result.user!.id).toBeDefined();
      expect(result.user!.created_at).toBeDefined();
      expect(result.user!.updated_at).toBeDefined();
    });

    test("validates email format", async () => {
      const result = await createUser(collectionName, "invalid-email", "Password1");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid email address");
    });

    test("rejects empty email", async () => {
      const result = await createUser(collectionName, "", "Password1");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid email address");
    });

    test("rejects duplicate email", async () => {
      await createUser(collectionName, "test@example.com", "Password1");
      const result = await createUser(collectionName, "test@example.com", "Password2");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Email already registered");
    });

    test("validates password - too short", async () => {
      const result = await createUser(collectionName, "test@example.com", "Pass1");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Password must be at least 8 characters");
    });

    test("validates password - no letter", async () => {
      const result = await createUser(collectionName, "test@example.com", "12345678");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Password must contain at least one letter");
    });

    test("validates password - no number", async () => {
      const result = await createUser(collectionName, "test@example.com", "PasswordOnly");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Password must contain at least one number");
    });

    test("fails for non-auth collection", async () => {
      // Create a base collection
      createCollection("posts", [], { type: "base" });

      const result = await createUser("posts", "test@example.com", "Password1");

      expect(result.success).toBe(false);
      expect(result.error).toBe(`"posts" is not an auth collection`);

      deleteCollection("posts");
    });

    test("fails for non-existent collection", async () => {
      const result = await createUser("nonexistent", "test@example.com", "Password1");

      expect(result.success).toBe(false);
      expect(result.error).toBe(`"nonexistent" is not an auth collection`);
    });
  });

  describe("loginUser", () => {
    beforeEach(async () => {
      await createUser(collectionName, "test@example.com", "Password1");
    });

    test("returns tokens for valid credentials", async () => {
      const result = await loginUser(collectionName, "test@example.com", "Password1");

      expect(result.success).toBe(true);
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.user!.email).toBe("test@example.com");
      // Ensure password_hash is not returned
      expect((result.user as Record<string, unknown>).password_hash).toBeUndefined();
    });

    test("returns generic error for wrong password", async () => {
      const result = await loginUser(collectionName, "test@example.com", "WrongPassword1");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid credentials");
      // Should NOT say "wrong password" or "password incorrect"
    });

    test("returns generic error for non-existent user", async () => {
      const result = await loginUser(collectionName, "nobody@example.com", "Password1");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid credentials");
      // Should NOT say "user not found" or "email not registered"
    });

    test("respects requireEmailVerification setting", async () => {
      // Create collection with email verification required
      createCollection("verified_users", [], {
        type: "auth",
        authOptions: { requireEmailVerification: true },
      });

      await createUser("verified_users", "unverified@example.com", "Password1");

      const result = await loginUser("verified_users", "unverified@example.com", "Password1");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Email not verified");

      deleteCollection("verified_users");
    });

    test("access token is valid JWT", async () => {
      const result = await loginUser(collectionName, "test@example.com", "Password1");

      const payload = await verifyUserToken(result.accessToken!, "access");
      expect(payload).toBeDefined();
      expect(payload!.userId).toBeDefined();
      expect(payload!.collectionName).toBe(collectionName);
      expect(payload!.type).toBe("access");
    });

    test("refresh token is valid JWT", async () => {
      const result = await loginUser(collectionName, "test@example.com", "Password1");

      const payload = await verifyUserToken(result.refreshToken!, "refresh");
      expect(payload).toBeDefined();
      expect(payload!.userId).toBeDefined();
      expect(payload!.tokenId).toBeDefined();
      expect(payload!.type).toBe("refresh");
    });

    test("fails for non-auth collection", async () => {
      createCollection("posts", [], { type: "base" });

      const result = await loginUser("posts", "test@example.com", "Password1");

      expect(result.success).toBe(false);
      expect(result.error).toBe(`"posts" is not an auth collection`);

      deleteCollection("posts");
    });
  });

  describe("refreshTokens", () => {
    test("works with valid refresh token", async () => {
      await createUser(collectionName, "test@example.com", "Password1");
      const loginResult = await loginUser(collectionName, "test@example.com", "Password1");

      const result = await refreshTokens(loginResult.refreshToken!);

      expect(result.success).toBe(true);
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      // Refresh tokens should always be different (different tokenId in payload)
      expect(result.refreshToken).not.toBe(loginResult.refreshToken);
      // New tokens are valid
      const accessPayload = await verifyUserToken(result.accessToken!, "access");
      const refreshPayload = await verifyUserToken(result.refreshToken!, "refresh");
      expect(accessPayload).toBeDefined();
      expect(refreshPayload).toBeDefined();
      expect(refreshPayload!.tokenId).toBeDefined();
    });

    test("rejects invalid token", async () => {
      const result = await refreshTokens("invalid-token");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid refresh token");
    });

    test("rejects revoked tokens", async () => {
      await createUser(collectionName, "test@example.com", "Password1");
      const loginResult = await loginUser(collectionName, "test@example.com", "Password1");

      // First refresh should work
      const firstRefresh = await refreshTokens(loginResult.refreshToken!);
      expect(firstRefresh.success).toBe(true);

      // Using the same old refresh token again should fail (it was revoked during rotation)
      const secondAttempt = await refreshTokens(loginResult.refreshToken!);
      expect(secondAttempt.success).toBe(false);
      expect(secondAttempt.error).toBe("Refresh token revoked");
    });

    test("implements token rotation - old token revoked", async () => {
      await createUser(collectionName, "test@example.com", "Password1");
      const loginResult = await loginUser(collectionName, "test@example.com", "Password1");

      // Get the token ID from the original refresh token
      const originalPayload = await verifyUserToken(loginResult.refreshToken!, "refresh");
      expect(checkRefreshTokenValid(originalPayload!.tokenId)).toBe(true);

      // Refresh
      await refreshTokens(loginResult.refreshToken!);

      // Original token ID should now be revoked
      expect(checkRefreshTokenValid(originalPayload!.tokenId)).toBe(false);
    });

    test("new refresh token is valid after rotation", async () => {
      await createUser(collectionName, "test@example.com", "Password1");
      const loginResult = await loginUser(collectionName, "test@example.com", "Password1");

      const firstRefresh = await refreshTokens(loginResult.refreshToken!);
      expect(firstRefresh.success).toBe(true);

      // Using the new refresh token should work
      const secondRefresh = await refreshTokens(firstRefresh.refreshToken!);
      expect(secondRefresh.success).toBe(true);
    });
  });

  describe("updateUserPassword", () => {
    test("changes password successfully", async () => {
      const createResult = await createUser(collectionName, "test@example.com", "Password1");
      const userId = createResult.user!.id;

      await updateUserPassword(collectionName, userId, "NewPassword2");

      // Old password should not work
      const oldLoginResult = await loginUser(collectionName, "test@example.com", "Password1");
      expect(oldLoginResult.success).toBe(false);

      // New password should work
      const newLoginResult = await loginUser(collectionName, "test@example.com", "NewPassword2");
      expect(newLoginResult.success).toBe(true);
    });

    test("revokes all refresh tokens", async () => {
      const createResult = await createUser(collectionName, "test@example.com", "Password1");
      const userId = createResult.user!.id;

      // Login to get a refresh token
      const loginResult = await loginUser(collectionName, "test@example.com", "Password1");
      const refreshPayload = await verifyUserToken(loginResult.refreshToken!, "refresh");

      // Token should be valid
      expect(checkRefreshTokenValid(refreshPayload!.tokenId)).toBe(true);

      // Change password
      await updateUserPassword(collectionName, userId, "NewPassword2");

      // Old refresh token should be revoked
      expect(checkRefreshTokenValid(refreshPayload!.tokenId)).toBe(false);
    });

    test("validates new password", async () => {
      const createResult = await createUser(collectionName, "test@example.com", "Password1");
      const userId = createResult.user!.id;

      await expect(
        updateUserPassword(collectionName, userId, "short")
      ).rejects.toThrow("Password must be at least 8 characters");
    });

    test("throws for non-existent user", async () => {
      await expect(
        updateUserPassword(collectionName, "nonexistent-id", "Password1")
      ).rejects.toThrow("User not found");
    });

    test("throws for non-auth collection", async () => {
      createCollection("posts", [], { type: "base" });

      await expect(
        updateUserPassword("posts", "some-id", "Password1")
      ).rejects.toThrow(`"posts" is not an auth collection`);

      deleteCollection("posts");
    });
  });

  describe("getUserById", () => {
    test("returns user with hash", async () => {
      const createResult = await createUser(collectionName, "test@example.com", "Password1");
      const userId = createResult.user!.id;

      const user = getUserById(collectionName, userId);

      expect(user).toBeDefined();
      expect(user!.id).toBe(userId);
      expect(user!.email).toBe("test@example.com");
      expect(user!.password_hash).toBeDefined();
      expect(user!.password_hash.startsWith("$argon2id$")).toBe(true);
    });

    test("returns null for non-existent user", async () => {
      const user = getUserById(collectionName, "nonexistent-id");
      expect(user).toBeNull();
    });

    test("throws for non-auth collection", () => {
      createCollection("posts", [], { type: "base" });

      expect(() => getUserById("posts", "some-id")).toThrow(
        `"posts" is not an auth collection`
      );

      deleteCollection("posts");
    });
  });

  describe("getUserByEmail", () => {
    test("returns user with hash", async () => {
      await createUser(collectionName, "test@example.com", "Password1");

      const user = getUserByEmail(collectionName, "test@example.com");

      expect(user).toBeDefined();
      expect(user!.email).toBe("test@example.com");
      expect(user!.password_hash).toBeDefined();
    });

    test("returns null for non-existent email", async () => {
      const user = getUserByEmail(collectionName, "nobody@example.com");
      expect(user).toBeNull();
    });

    test("throws for non-auth collection", () => {
      createCollection("posts", [], { type: "base" });

      expect(() => getUserByEmail("posts", "test@example.com")).toThrow(
        `"posts" is not an auth collection`
      );

      deleteCollection("posts");
    });
  });

  describe("custom minPasswordLength", () => {
    test("respects custom minPasswordLength from collection options", async () => {
      createCollection("strict_users", [], {
        type: "auth",
        authOptions: { minPasswordLength: 12 },
      });

      // 8 char password should fail (collection requires 12)
      const result = await createUser("strict_users", "test@example.com", "Pass1234");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Password must be at least 12 characters");

      // 12 char password should succeed
      const result2 = await createUser("strict_users", "test@example.com", "Password1234");
      expect(result2.success).toBe(true);

      deleteCollection("strict_users");
    });
  });
});
