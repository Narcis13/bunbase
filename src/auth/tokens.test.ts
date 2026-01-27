import { test, expect, beforeEach, afterEach, mock, describe } from "bun:test";
import { initDatabase, closeDatabase, getDatabase } from "../core/database";
import { createCollection } from "../core/schema";
import {
  createVerificationToken,
  verifyToken,
  markTokenUsed,
  requestEmailVerification,
  confirmEmailVerification,
  cleanupExpiredVerificationTokens,
  requestPasswordReset,
  confirmPasswordReset,
} from "./tokens";
import { createUserRefreshToken, checkRefreshTokenValid } from "./user-jwt";

// Mock the email send function
const mockSendEmail = mock(() =>
  Promise.resolve({ success: true, messageId: "test-id" })
);

// Mock the email module
mock.module("../email/send", () => ({
  sendEmail: mockSendEmail,
}));

describe("tokens", () => {
  let testUserId: string;
  const testCollectionName = "test_users";

  beforeEach(() => {
    // Reset mocks
    mockSendEmail.mockClear();
    mockSendEmail.mockImplementation(() =>
      Promise.resolve({ success: true, messageId: "test-id" })
    );

    // Initialize fresh in-memory database
    initDatabase(":memory:");

    // Create auth collection
    createCollection(testCollectionName, [], { type: "auth" });

    // Create a test user
    const db = getDatabase();
    testUserId = "test-user-123";
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO "${testCollectionName}" (id, email, password_hash, verified, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, ?)`,
      [
        testUserId,
        "test@example.com",
        "$argon2id$v=19$m=65536,t=2,p=1$dummy$dummy",
        now,
        now,
      ]
    );
  });

  afterEach(() => {
    closeDatabase();
  });

  describe("createVerificationToken", () => {
    test("generates 64-char token", async () => {
      const { token } = await createVerificationToken(
        testUserId,
        testCollectionName,
        "email_verification"
      );
      expect(token.length).toBe(64);
    });

    test("stores hashed token (not plain)", async () => {
      const { token } = await createVerificationToken(
        testUserId,
        testCollectionName,
        "email_verification"
      );

      // Check database stores hash, not plain token
      const db = getDatabase();
      const record = db
        .query<{ token_hash: string }, []>(
          `SELECT token_hash FROM _verification_tokens WHERE user_id = ?`
        )
        .get(testUserId);

      expect(record).toBeTruthy();
      expect(record!.token_hash).not.toBe(token);
      expect(record!.token_hash.length).toBe(64); // SHA-256 hex is 64 chars
    });

    test("invalidates previous tokens for same user/type", async () => {
      // Create first token
      await createVerificationToken(
        testUserId,
        testCollectionName,
        "email_verification"
      );

      // Create second token
      await createVerificationToken(
        testUserId,
        testCollectionName,
        "email_verification"
      );

      // Check first token is marked used
      const db = getDatabase();
      const tokens = db
        .query<{ used: number }, [string]>(
          `SELECT used FROM _verification_tokens WHERE user_id = ? ORDER BY created_at`
        )
        .all(testUserId);

      expect(tokens.length).toBe(2);
      expect(tokens[0].used).toBe(1); // First token invalidated
      expect(tokens[1].used).toBe(0); // Second token active
    });

    test("does not invalidate tokens of different type", async () => {
      // Create email verification token
      await createVerificationToken(
        testUserId,
        testCollectionName,
        "email_verification"
      );

      // Create password reset token
      await createVerificationToken(
        testUserId,
        testCollectionName,
        "password_reset"
      );

      // Both should be active
      const db = getDatabase();
      const activeTokens = db
        .query<{ type: string }, [string]>(
          `SELECT type FROM _verification_tokens WHERE user_id = ? AND used = 0`
        )
        .all(testUserId);

      expect(activeTokens.length).toBe(2);
    });
  });

  describe("verifyToken", () => {
    test("returns user info for valid token", async () => {
      const { token } = await createVerificationToken(
        testUserId,
        testCollectionName,
        "email_verification"
      );

      const result = await verifyToken(token, "email_verification");

      expect(result).not.toBeNull();
      expect(result!.userId).toBe(testUserId);
      expect(result!.collectionName).toBe(testCollectionName);
    });

    test("returns null for invalid token", async () => {
      const result = await verifyToken("invalid-token", "email_verification");
      expect(result).toBeNull();
    });

    test("returns null for expired token", async () => {
      const { token } = await createVerificationToken(
        testUserId,
        testCollectionName,
        "email_verification"
      );

      // Manually expire the token
      const db = getDatabase();
      const pastDate = new Date(Date.now() - 1000).toISOString();
      db.run(
        `UPDATE _verification_tokens SET expires_at = ? WHERE user_id = ?`,
        [pastDate, testUserId]
      );

      const result = await verifyToken(token, "email_verification");
      expect(result).toBeNull();
    });

    test("returns null for used token", async () => {
      const { token } = await createVerificationToken(
        testUserId,
        testCollectionName,
        "email_verification"
      );

      // Mark as used
      await markTokenUsed(token);

      const result = await verifyToken(token, "email_verification");
      expect(result).toBeNull();
    });

    test("returns null for wrong type", async () => {
      const { token } = await createVerificationToken(
        testUserId,
        testCollectionName,
        "email_verification"
      );

      const result = await verifyToken(token, "password_reset");
      expect(result).toBeNull();
    });
  });

  describe("markTokenUsed", () => {
    test("marks token as used", async () => {
      const { token } = await createVerificationToken(
        testUserId,
        testCollectionName,
        "email_verification"
      );

      await markTokenUsed(token);

      const db = getDatabase();
      const record = db
        .query<{ used: number }, [string]>(
          `SELECT used FROM _verification_tokens WHERE user_id = ?`
        )
        .get(testUserId);

      expect(record!.used).toBe(1);
    });
  });

  describe("requestEmailVerification", () => {
    test("sends email with verification link", async () => {
      const result = await requestEmailVerification(
        testCollectionName,
        testUserId,
        "http://localhost:8090"
      );

      expect(result.success).toBe(true);
      expect(mockSendEmail).toHaveBeenCalledTimes(1);

      const callArgs = mockSendEmail.mock.calls[0][0] as {
        to: string;
        subject: string;
        placeholders?: { link: string };
      };
      expect(callArgs.to).toBe("test@example.com");
      expect(callArgs.subject).toBe("Verify your email address");
      expect(callArgs.placeholders?.link).toContain(
        "/api/collections/test_users/auth/confirm-verification?token="
      );
    });

    test("returns error for non-existent user", async () => {
      const result = await requestEmailVerification(
        testCollectionName,
        "non-existent-user",
        "http://localhost:8090"
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("User not found");
    });

    test("returns error for already verified user", async () => {
      // Mark user as verified
      const db = getDatabase();
      db.run(`UPDATE "${testCollectionName}" SET verified = 1 WHERE id = ?`, [
        testUserId,
      ]);

      const result = await requestEmailVerification(
        testCollectionName,
        testUserId,
        "http://localhost:8090"
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Email already verified");
    });

    test("returns error if email sending fails", async () => {
      mockSendEmail.mockImplementation(() =>
        Promise.resolve({ success: false, error: "SMTP error" })
      );

      const result = await requestEmailVerification(
        testCollectionName,
        testUserId,
        "http://localhost:8090"
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("SMTP error");
    });
  });

  describe("confirmEmailVerification", () => {
    test("marks user verified and token used", async () => {
      const { token } = await createVerificationToken(
        testUserId,
        testCollectionName,
        "email_verification"
      );

      const result = await confirmEmailVerification(token);

      expect(result.success).toBe(true);

      // Check user is verified
      const db = getDatabase();
      const user = db
        .query<{ verified: number }, [string]>(
          `SELECT verified FROM "${testCollectionName}" WHERE id = ?`
        )
        .get(testUserId);
      expect(user!.verified).toBe(1);

      // Check token is used
      const tokenRecord = db
        .query<{ used: number }, [string]>(
          `SELECT used FROM _verification_tokens WHERE user_id = ?`
        )
        .get(testUserId);
      expect(tokenRecord!.used).toBe(1);
    });

    test("returns error for invalid token", async () => {
      const result = await confirmEmailVerification("invalid-token");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid or expired token");
    });

    test("token cannot be reused", async () => {
      const { token } = await createVerificationToken(
        testUserId,
        testCollectionName,
        "email_verification"
      );

      // First use succeeds
      const result1 = await confirmEmailVerification(token);
      expect(result1.success).toBe(true);

      // Second use fails
      const result2 = await confirmEmailVerification(token);
      expect(result2.success).toBe(false);
      expect(result2.error).toBe("Invalid or expired token");
    });
  });

  describe("cleanupExpiredVerificationTokens", () => {
    test("removes expired tokens", async () => {
      // Create a token
      await createVerificationToken(
        testUserId,
        testCollectionName,
        "email_verification"
      );

      // Manually expire it
      const db = getDatabase();
      const pastDate = new Date(Date.now() - 1000).toISOString();
      db.run(`UPDATE _verification_tokens SET expires_at = ?`, [pastDate]);

      const deleted = cleanupExpiredVerificationTokens();

      expect(deleted).toBe(1);

      // Verify it's gone
      const remaining = db
        .query<{ id: string }, []>(`SELECT id FROM _verification_tokens`)
        .all();
      expect(remaining.length).toBe(0);
    });

    test("keeps non-expired tokens", async () => {
      await createVerificationToken(
        testUserId,
        testCollectionName,
        "email_verification"
      );

      const deleted = cleanupExpiredVerificationTokens();

      expect(deleted).toBe(0);

      // Verify it's still there
      const db = getDatabase();
      const remaining = db
        .query<{ id: string }, []>(`SELECT id FROM _verification_tokens`)
        .all();
      expect(remaining.length).toBe(1);
    });
  });

  describe("requestPasswordReset", () => {
    test("sends email for existing user", async () => {
      const result = await requestPasswordReset(
        testCollectionName,
        "test@example.com",
        "http://localhost:8090"
      );

      expect(result.success).toBe(true);
      expect(mockSendEmail).toHaveBeenCalledTimes(1);

      const callArgs = mockSendEmail.mock.calls[0][0] as {
        to: string;
        subject: string;
        placeholders?: { link: string };
      };
      expect(callArgs.to).toBe("test@example.com");
      expect(callArgs.subject).toBe("Reset your password");
      expect(callArgs.placeholders?.link).toContain(
        "/api/collections/test_users/auth/confirm-reset?token="
      );
    });

    test("returns success for non-existing user (no enumeration)", async () => {
      const result = await requestPasswordReset(
        testCollectionName,
        "nonexistent@example.com",
        "http://localhost:8090"
      );

      // Should return success to prevent email enumeration
      expect(result.success).toBe(true);
      // But should NOT send email
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    test("returns success for non-auth collection (no enumeration)", async () => {
      // Create a base collection
      createCollection("base_collection", [], { type: "base" });

      const result = await requestPasswordReset(
        "base_collection",
        "test@example.com",
        "http://localhost:8090"
      );

      // Should return success to prevent collection type enumeration
      expect(result.success).toBe(true);
      expect(mockSendEmail).not.toHaveBeenCalled();
    });
  });

  describe("confirmPasswordReset", () => {
    test("updates password with valid token", async () => {
      const { token } = await createVerificationToken(
        testUserId,
        testCollectionName,
        "password_reset"
      );

      const result = await confirmPasswordReset(token, "newPassword123");

      expect(result.success).toBe(true);

      // Verify password was updated (check hash changed)
      const db = getDatabase();
      const user = db
        .query<{ password_hash: string }, [string]>(
          `SELECT password_hash FROM "${testCollectionName}" WHERE id = ?`
        )
        .get(testUserId);

      expect(user!.password_hash).not.toBe(
        "$argon2id$v=19$m=65536,t=2,p=1$dummy$dummy"
      );

      // Verify new password works
      const verified = await Bun.password.verify(
        "newPassword123",
        user!.password_hash
      );
      expect(verified).toBe(true);
    });

    test("rejects invalid password (too short)", async () => {
      const { token } = await createVerificationToken(
        testUserId,
        testCollectionName,
        "password_reset"
      );

      const result = await confirmPasswordReset(token, "short1");

      expect(result.success).toBe(false);
      expect(result.error).toContain("at least 8 characters");
    });

    test("rejects invalid password (no number)", async () => {
      const { token } = await createVerificationToken(
        testUserId,
        testCollectionName,
        "password_reset"
      );

      const result = await confirmPasswordReset(token, "passwordonly");

      expect(result.success).toBe(false);
      expect(result.error).toContain("at least one number");
    });

    test("rejects expired token", async () => {
      const { token } = await createVerificationToken(
        testUserId,
        testCollectionName,
        "password_reset"
      );

      // Manually expire the token
      const db = getDatabase();
      const pastDate = new Date(Date.now() - 1000).toISOString();
      db.run(`UPDATE _verification_tokens SET expires_at = ?`, [pastDate]);

      const result = await confirmPasswordReset(token, "newPassword123");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid or expired token");
    });

    test("rejects used token", async () => {
      const { token } = await createVerificationToken(
        testUserId,
        testCollectionName,
        "password_reset"
      );

      // First use succeeds
      const result1 = await confirmPasswordReset(token, "newPassword123");
      expect(result1.success).toBe(true);

      // Second use fails
      const result2 = await confirmPasswordReset(token, "anotherPassword456");
      expect(result2.success).toBe(false);
      expect(result2.error).toBe("Invalid or expired token");
    });

    test("rejects invalid token", async () => {
      const result = await confirmPasswordReset(
        "invalid-token-xyz",
        "newPassword123"
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid or expired token");
    });

    test("revokes all refresh tokens after reset", async () => {
      // First, get collection id for refresh token creation
      const db = getDatabase();
      const collection = db
        .query<{ id: string }, [string]>(
          `SELECT id FROM _collections WHERE name = ?`
        )
        .get(testCollectionName);

      // Create a refresh token for this user
      const { tokenId } = await createUserRefreshToken(
        testUserId,
        collection!.id,
        testCollectionName
      );

      // Verify refresh token is valid
      expect(checkRefreshTokenValid(tokenId)).toBe(true);

      // Create password reset token and confirm
      const { token } = await createVerificationToken(
        testUserId,
        testCollectionName,
        "password_reset"
      );
      await confirmPasswordReset(token, "newPassword123");

      // Verify refresh token is now revoked
      expect(checkRefreshTokenValid(tokenId)).toBe(false);
    });
  });
});
