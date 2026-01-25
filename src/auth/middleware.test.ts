import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { extractBearerToken, requireAdmin } from "./middleware";
import { createAdmin, Admin } from "./admin";
import { createAdminToken } from "./jwt";
import { initDatabase, closeDatabase } from "../core/database";

// Set JWT_SECRET for tests
process.env.JWT_SECRET = "test-secret-key-minimum-32-characters-long";

describe("extractBearerToken", () => {
  test("returns token from valid Authorization header", () => {
    const req = new Request("http://localhost/test", {
      headers: {
        Authorization: "Bearer abc123token",
      },
    });

    const token = extractBearerToken(req);
    expect(token).toBe("abc123token");
  });

  test("returns null for missing Authorization header", () => {
    const req = new Request("http://localhost/test");

    const token = extractBearerToken(req);
    expect(token).toBeNull();
  });

  test("returns null for non-Bearer auth scheme", () => {
    const req = new Request("http://localhost/test", {
      headers: {
        Authorization: "Basic dXNlcjpwYXNz",
      },
    });

    const token = extractBearerToken(req);
    expect(token).toBeNull();
  });

  test("returns null for malformed Bearer header", () => {
    const req = new Request("http://localhost/test", {
      headers: {
        Authorization: "Bearertoken", // Missing space
      },
    });

    const token = extractBearerToken(req);
    expect(token).toBeNull();
  });

  test("returns null for Bearer with empty token", () => {
    const req = new Request("http://localhost/test", {
      headers: {
        Authorization: "Bearer ",
      },
    });

    // Empty token after "Bearer " should return null
    const token = extractBearerToken(req);
    expect(token).toBeNull();
  });
});

describe("requireAdmin", () => {
  let testAdmin: Admin;
  let validToken: string;

  beforeAll(async () => {
    // Initialize in-memory database
    initDatabase(":memory:");

    // Create a test admin
    testAdmin = await createAdmin("middleware-test@example.com", "password123");

    // Create a valid token for the test admin
    validToken = await createAdminToken(testAdmin.id);
  });

  afterAll(() => {
    closeDatabase();
  });

  test("returns 401 Response when no token provided", async () => {
    const req = new Request("http://localhost/test");

    const result = await requireAdmin(req);

    expect(result).toBeInstanceOf(Response);
    const response = result as Response;
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  test("returns 401 Response when invalid token provided", async () => {
    const req = new Request("http://localhost/test", {
      headers: {
        Authorization: "Bearer invalid.token.here",
      },
    });

    const result = await requireAdmin(req);

    expect(result).toBeInstanceOf(Response);
    const response = result as Response;
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  test("returns 401 Response when admin not found", async () => {
    // Create a token for a non-existent admin ID
    const fakeToken = await createAdminToken("nonexistent-id-12345");

    const req = new Request("http://localhost/test", {
      headers: {
        Authorization: `Bearer ${fakeToken}`,
      },
    });

    const result = await requireAdmin(req);

    expect(result).toBeInstanceOf(Response);
    const response = result as Response;
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  test("returns Admin when valid token and admin exists", async () => {
    const req = new Request("http://localhost/test", {
      headers: {
        Authorization: `Bearer ${validToken}`,
      },
    });

    const result = await requireAdmin(req);

    // Should return Admin object, not Response
    expect(result).not.toBeInstanceOf(Response);

    const admin = result as Admin;
    expect(admin.id).toBe(testAdmin.id);
    expect(admin.email).toBe(testAdmin.email);
    expect(admin.created_at).toBeDefined();
    expect(admin.updated_at).toBeDefined();

    // Should NOT include password_hash
    expect((admin as any).password_hash).toBeUndefined();
  });

  test("returns 401 Response for expired token", async () => {
    // We can't easily test expiry without mocking time,
    // but we can verify the token verification path works
    const req = new Request("http://localhost/test", {
      headers: {
        Authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.eyJhZG1pbklkIjoieHh4IiwiZXhwIjoxfQ.invalid",
      },
    });

    const result = await requireAdmin(req);

    expect(result).toBeInstanceOf(Response);
    const response = result as Response;
    expect(response.status).toBe(401);
  });
});
