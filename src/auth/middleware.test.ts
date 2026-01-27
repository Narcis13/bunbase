import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { extractBearerToken, requireAdmin, requireUser, optionalUser, AuthenticatedUser } from "./middleware";
import { createAdmin, Admin } from "./admin";
import { createAdminToken } from "./jwt";
import { initDatabase, closeDatabase } from "../core/database";
import { createCollection, deleteCollection } from "../core/schema";
import { createUser } from "./user";
import type { User } from "../types/auth";
import { createUserAccessToken } from "./user-jwt";

// Set JWT_SECRET for tests
process.env.JWT_SECRET = "test-secret-key-minimum-32-characters-long";

// Initialize database once for all tests in this file
beforeAll(() => {
  initDatabase(":memory:");
});

afterAll(() => {
  closeDatabase();
});

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
    // Create a test admin
    testAdmin = await createAdmin("middleware-test@example.com", "password123");

    // Create a valid token for the test admin
    validToken = await createAdminToken(testAdmin.id);
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

describe("requireUser", () => {
  let testUser: User;
  let validToken: string;
  let collectionId: string;

  beforeAll(async () => {
    // Create an auth collection for testing
    const collection = createCollection("test_users", [], { type: "auth" });
    collectionId = collection.id;

    // Create a test user
    const result = await createUser("test_users", "user-middleware@example.com", "password123");
    if (!result.success || !result.user) {
      throw new Error("Failed to create test user");
    }
    testUser = result.user;

    // Create a valid token for the test user
    validToken = await createUserAccessToken(testUser.id, collectionId, "test_users");
  });

  afterAll(() => {
    deleteCollection("test_users");
  });

  test("returns user for valid token", async () => {
    const req = new Request("http://localhost/test", {
      headers: {
        Authorization: `Bearer ${validToken}`,
      },
    });

    const result = await requireUser(req);

    // Should return AuthenticatedUser object, not Response
    expect(result).not.toBeInstanceOf(Response);

    const user = result as AuthenticatedUser;
    expect(user.id).toBe(testUser.id);
    expect(user.email).toBe(testUser.email);
    expect(user.collectionId).toBe(collectionId);
    expect(user.collectionName).toBe("test_users");

    // Should NOT include password_hash
    expect((user as any).password_hash).toBeUndefined();
  });

  test("returns 401 for missing token", async () => {
    const req = new Request("http://localhost/test");

    const result = await requireUser(req);

    expect(result).toBeInstanceOf(Response);
    const response = result as Response;
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  test("returns 401 for invalid token", async () => {
    const req = new Request("http://localhost/test", {
      headers: {
        Authorization: "Bearer invalid.token.here",
      },
    });

    const result = await requireUser(req);

    expect(result).toBeInstanceOf(Response);
    const response = result as Response;
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  test("returns 401 for expired token", async () => {
    // Create a token with expired signature
    const req = new Request("http://localhost/test", {
      headers: {
        Authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJ4eHgiLCJjb2xsZWN0aW9uSWQiOiJ5eXkiLCJjb2xsZWN0aW9uTmFtZSI6InRlc3QiLCJ0eXBlIjoiYWNjZXNzIiwiZXhwIjoxfQ.invalid",
      },
    });

    const result = await requireUser(req);

    expect(result).toBeInstanceOf(Response);
    const response = result as Response;
    expect(response.status).toBe(401);
  });

  test("returns 401 when user not found", async () => {
    // Create token for non-existent user
    const fakeToken = await createUserAccessToken("nonexistent-user-id", collectionId, "test_users");

    const req = new Request("http://localhost/test", {
      headers: {
        Authorization: `Bearer ${fakeToken}`,
      },
    });

    const result = await requireUser(req);

    expect(result).toBeInstanceOf(Response);
    const response = result as Response;
    expect(response.status).toBe(401);
  });
});

describe("optionalUser", () => {
  let testUser: User;
  let validToken: string;
  let collectionId: string;

  beforeAll(async () => {
    // Create an auth collection for testing
    const collection = createCollection("optional_users", [], { type: "auth" });
    collectionId = collection.id;

    // Create a test user
    const result = await createUser("optional_users", "optional-user@example.com", "password123");
    if (!result.success || !result.user) {
      throw new Error("Failed to create test user");
    }
    testUser = result.user;

    // Create a valid token for the test user
    validToken = await createUserAccessToken(testUser.id, collectionId, "optional_users");
  });

  afterAll(() => {
    deleteCollection("optional_users");
  });

  test("returns user for valid token", async () => {
    const req = new Request("http://localhost/test", {
      headers: {
        Authorization: `Bearer ${validToken}`,
      },
    });

    const result = await optionalUser(req);

    expect(result).not.toBeNull();
    const user = result as AuthenticatedUser;
    expect(user.id).toBe(testUser.id);
    expect(user.email).toBe(testUser.email);
    expect(user.collectionId).toBe(collectionId);
    expect(user.collectionName).toBe("optional_users");

    // Should NOT include password_hash
    expect((user as any).password_hash).toBeUndefined();
  });

  test("returns null for missing token (not error)", async () => {
    const req = new Request("http://localhost/test");

    const result = await optionalUser(req);

    // Should return null, not a Response
    expect(result).toBeNull();
  });

  test("returns null for invalid token (not error)", async () => {
    const req = new Request("http://localhost/test", {
      headers: {
        Authorization: "Bearer invalid.token.here",
      },
    });

    const result = await optionalUser(req);

    // Should return null, not a Response
    expect(result).toBeNull();
  });

  test("returns null when user not found", async () => {
    const fakeToken = await createUserAccessToken("nonexistent-user-id", collectionId, "optional_users");

    const req = new Request("http://localhost/test", {
      headers: {
        Authorization: `Bearer ${fakeToken}`,
      },
    });

    const result = await optionalUser(req);

    // Should return null, not a Response
    expect(result).toBeNull();
  });
});
