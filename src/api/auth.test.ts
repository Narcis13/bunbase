import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createServer } from "./server";
import { initDatabase, closeDatabase } from "../core/database";
import { createAdmin } from "../auth/admin";
import { createAdminToken } from "../auth/jwt";

// Set JWT_SECRET for tests
process.env.JWT_SECRET = "test-secret-key-minimum-32-characters-long";

describe("Auth Routes", () => {
  let server: ReturnType<typeof createServer>;
  const baseUrl = "http://localhost:8099";

  beforeAll(async () => {
    // Initialize in-memory database
    initDatabase(":memory:");

    // Create a test admin
    await createAdmin("test@example.com", "password123");

    // Start server on test port
    server = createServer(8099);
  });

  afterAll(() => {
    server.stop();
    closeDatabase();
  });

  describe("POST /_/api/auth/login", () => {
    test("returns token and admin for valid credentials", async () => {
      const response = await fetch(`${baseUrl}/_/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "test@example.com",
          password: "password123",
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.token).toBeDefined();
      expect(typeof body.token).toBe("string");
      expect(body.token.split(".").length).toBe(3); // JWT has 3 parts

      expect(body.admin).toBeDefined();
      expect(body.admin.email).toBe("test@example.com");
      expect(body.admin.id).toBeDefined();
      expect(body.admin.password_hash).toBeUndefined();
    });

    test("returns 401 for invalid email", async () => {
      const response = await fetch(`${baseUrl}/_/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "wrong@example.com",
          password: "password123",
        }),
      });

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toBe("Invalid credentials");
    });

    test("returns 401 for invalid password", async () => {
      const response = await fetch(`${baseUrl}/_/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "test@example.com",
          password: "wrongpassword",
        }),
      });

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toBe("Invalid credentials");
    });

    test("returns 400 for missing email", async () => {
      const response = await fetch(`${baseUrl}/_/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: "password123",
        }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe("Email and password required");
    });

    test("returns 400 for missing password", async () => {
      const response = await fetch(`${baseUrl}/_/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "test@example.com",
        }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe("Email and password required");
    });
  });

  describe("GET /_/api/auth/me", () => {
    test("returns 401 without token", async () => {
      const response = await fetch(`${baseUrl}/_/api/auth/me`);

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toBe("Unauthorized");
    });

    test("returns 401 with invalid token", async () => {
      const response = await fetch(`${baseUrl}/_/api/auth/me`, {
        headers: {
          Authorization: "Bearer invalid.token.here",
        },
      });

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toBe("Unauthorized");
    });

    test("returns admin with valid token", async () => {
      // First login to get a valid token
      const loginResponse = await fetch(`${baseUrl}/_/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "test@example.com",
          password: "password123",
        }),
      });
      const { token } = await loginResponse.json();

      // Use the token to access /me
      const response = await fetch(`${baseUrl}/_/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.id).toBeDefined();
      expect(body.email).toBe("test@example.com");
      expect(body.created_at).toBeDefined();
      expect(body.updated_at).toBeDefined();
      expect(body.password_hash).toBeUndefined();
    });
  });

  describe("POST /_/api/auth/password", () => {
    test("returns 401 without token", async () => {
      const response = await fetch(`${baseUrl}/_/api/auth/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newPassword: "newpassword123",
        }),
      });

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toBe("Unauthorized");
    });

    test("returns 400 for short password", async () => {
      // Login to get token
      const loginResponse = await fetch(`${baseUrl}/_/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "test@example.com",
          password: "password123",
        }),
      });
      const { token } = await loginResponse.json();

      // Try to change to short password
      const response = await fetch(`${baseUrl}/_/api/auth/password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          newPassword: "short",
        }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe("Password must be at least 8 characters");
    });

    test("successfully changes password", async () => {
      // Create a separate admin for this test to avoid affecting other tests
      await createAdmin("password-change@example.com", "oldpassword123");

      // Login with old password
      const loginResponse = await fetch(`${baseUrl}/_/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "password-change@example.com",
          password: "oldpassword123",
        }),
      });
      const { token } = await loginResponse.json();

      // Change password
      const response = await fetch(`${baseUrl}/_/api/auth/password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          newPassword: "newpassword123",
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.message).toBe("Password updated");

      // Verify old password no longer works
      const oldLoginResponse = await fetch(`${baseUrl}/_/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "password-change@example.com",
          password: "oldpassword123",
        }),
      });
      expect(oldLoginResponse.status).toBe(401);

      // Verify new password works
      const newLoginResponse = await fetch(`${baseUrl}/_/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "password-change@example.com",
          password: "newpassword123",
        }),
      });
      expect(newLoginResponse.status).toBe(200);
    });
  });
});
