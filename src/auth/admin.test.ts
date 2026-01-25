import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { initDatabase, closeDatabase, getDatabase } from "../core/database";
import {
  createAdmin,
  getAdminByEmail,
  getAdminById,
  verifyAdminPassword,
  updateAdminPassword,
  type Admin,
} from "./admin";

describe("admin module", () => {
  beforeEach(() => {
    initDatabase(":memory:");
  });

  afterEach(() => {
    closeDatabase();
  });

  describe("createAdmin", () => {
    test("creates admin with hashed password (not plaintext)", async () => {
      const admin = await createAdmin("test@example.com", "password123");

      expect(admin.id).toBeDefined();
      expect(admin.email).toBe("test@example.com");
      expect(admin.created_at).toBeDefined();
      expect(admin.updated_at).toBeDefined();
      // Admin object should NOT contain password_hash
      expect((admin as any).password_hash).toBeUndefined();

      // Verify password is stored as argon2id hash in database
      const db = getDatabase();
      const row = db
        .query<{ password_hash: string }, [string]>(
          "SELECT password_hash FROM _admins WHERE email = ?"
        )
        .get("test@example.com");

      expect(row).not.toBeNull();
      expect(row!.password_hash).toMatch(/^\$argon2id\$/);
      expect(row!.password_hash).not.toBe("password123");
    });

    test("throws on duplicate email", async () => {
      await createAdmin("dup@example.com", "password1");

      await expect(createAdmin("dup@example.com", "password2")).rejects.toThrow(
        'Admin with email "dup@example.com" already exists'
      );
    });
  });

  describe("getAdminByEmail", () => {
    test("returns admin for existing email", async () => {
      await createAdmin("found@example.com", "password123");

      const admin = getAdminByEmail("found@example.com");

      expect(admin).not.toBeNull();
      expect(admin!.email).toBe("found@example.com");
      expect(admin!.password_hash).toMatch(/^\$argon2id\$/);
    });

    test("returns null for unknown email", () => {
      const admin = getAdminByEmail("nonexistent@example.com");

      expect(admin).toBeNull();
    });
  });

  describe("getAdminById", () => {
    test("returns admin for existing id", async () => {
      const created = await createAdmin("byid@example.com", "password123");

      const admin = getAdminById(created.id);

      expect(admin).not.toBeNull();
      expect(admin!.id).toBe(created.id);
      expect(admin!.email).toBe("byid@example.com");
    });

    test("returns null for unknown id", () => {
      const admin = getAdminById("nonexistent-id");

      expect(admin).toBeNull();
    });
  });

  describe("verifyAdminPassword", () => {
    test("returns admin for correct password", async () => {
      await createAdmin("verify@example.com", "correctpassword");

      const admin = await verifyAdminPassword(
        "verify@example.com",
        "correctpassword"
      );

      expect(admin).not.toBeNull();
      expect(admin!.email).toBe("verify@example.com");
      // Should NOT contain password_hash
      expect((admin as any).password_hash).toBeUndefined();
    });

    test("returns null for incorrect password", async () => {
      await createAdmin("verify2@example.com", "correctpassword");

      const admin = await verifyAdminPassword(
        "verify2@example.com",
        "wrongpassword"
      );

      expect(admin).toBeNull();
    });

    test("returns null for unknown email", async () => {
      const admin = await verifyAdminPassword(
        "unknown@example.com",
        "anypassword"
      );

      expect(admin).toBeNull();
    });
  });

  describe("updateAdminPassword", () => {
    test("changes the password (old fails, new works)", async () => {
      const admin = await createAdmin("update@example.com", "oldpassword");

      // Old password works before update
      const beforeUpdate = await verifyAdminPassword(
        "update@example.com",
        "oldpassword"
      );
      expect(beforeUpdate).not.toBeNull();

      // Update password
      await updateAdminPassword(admin.id, "newpassword");

      // Old password fails after update
      const oldAfterUpdate = await verifyAdminPassword(
        "update@example.com",
        "oldpassword"
      );
      expect(oldAfterUpdate).toBeNull();

      // New password works after update
      const newAfterUpdate = await verifyAdminPassword(
        "update@example.com",
        "newpassword"
      );
      expect(newAfterUpdate).not.toBeNull();
    });

    test("throws for non-existent admin", async () => {
      await expect(
        updateAdminPassword("nonexistent-id", "newpassword")
      ).rejects.toThrow('Admin with id "nonexistent-id" not found');
    });
  });
});
