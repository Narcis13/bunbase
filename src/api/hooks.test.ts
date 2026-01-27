/**
 * Lifecycle Hooks Integration Tests
 *
 * Tests hook execution through HTTP endpoints to verify:
 * - Before hooks can modify data and cancel operations
 * - After hooks execute but don't fail successful operations
 * - Request context is passed to hooks
 * - Collection scoping works correctly
 */

import {
  test,
  expect,
  describe,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import { initDatabase, getDatabase, closeDatabase } from "../core/database";
import { createCollection, deleteCollection } from "../core/schema";
import { createServer, HookManager } from "./server";

const TEST_PORT = 8093;
const BASE_URL = `http://localhost:${TEST_PORT}`;

let server: ReturnType<typeof createServer>;
const hookManager = new HookManager();

describe("Lifecycle Hooks Integration", () => {
  beforeAll(() => {
    // Initialize test database
    initDatabase(":memory:");

    // Public rules for testing (allow all operations without auth)
    const publicRules = {
      listRule: '',
      viewRule: '',
      createRule: '',
      updateRule: '',
      deleteRule: '',
    };

    // Create test collections with public rules
    createCollection("authors", [
      { name: "name", type: "text", required: true },
    ], { rules: publicRules });

    createCollection("posts", [
      { name: "title", type: "text", required: true },
      { name: "content", type: "text", required: false },
      { name: "author", type: "relation", required: false, options: { collection: "authors" } },
    ], { rules: publicRules });

    // Create server with the hook manager
    server = createServer(TEST_PORT, hookManager);
  });

  afterAll(() => {
    server.stop();
    try {
      deleteCollection("posts");
      deleteCollection("authors");
    } catch {
      // Collections may already be deleted
    }
    closeDatabase();
  });

  beforeEach(() => {
    // Clear records
    const db = getDatabase();
    db.run('DELETE FROM "posts"');
    db.run('DELETE FROM "authors"');
    // Clear all hooks
    hookManager.clear();
  });

  // --------------------------------------------------------------------------
  // beforeCreate Tests
  // --------------------------------------------------------------------------

  test("beforeCreate hook modifies data", async () => {
    // Register hook that adds a field
    hookManager.on("beforeCreate", "posts", async (ctx, next) => {
      ctx.data.content = "Modified by hook";
      await next();
    });

    const res = await fetch(`${BASE_URL}/api/collections/posts/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test Post" }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.content).toBe("Modified by hook");
  });

  test("beforeCreate hook cancels operation by throwing", async () => {
    // Register hook that throws
    hookManager.on("beforeCreate", "posts", async () => {
      throw new Error("Blocked by hook");
    });

    const res = await fetch(`${BASE_URL}/api/collections/posts/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test Post" }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Blocked by hook");

    // Verify record was NOT created
    const listRes = await fetch(`${BASE_URL}/api/collections/posts/records`);
    const listData = await listRes.json();
    expect(listData.items).toHaveLength(0);
  });

  // --------------------------------------------------------------------------
  // afterCreate Tests
  // --------------------------------------------------------------------------

  test("afterCreate hook executes after success", async () => {
    let hookExecuted = false;
    let recordFromHook: Record<string, unknown> | null = null;

    hookManager.on("afterCreate", "posts", async (ctx, next) => {
      hookExecuted = true;
      recordFromHook = ctx.record;
      await next();
    });

    const res = await fetch(`${BASE_URL}/api/collections/posts/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test Post" }),
    });

    expect(res.status).toBe(201);
    expect(hookExecuted).toBe(true);
    expect(recordFromHook).not.toBeNull();
    expect((recordFromHook as Record<string, unknown>).title).toBe("Test Post");
  });

  test("afterCreate hook error doesn't fail request", async () => {
    hookManager.on("afterCreate", "posts", async () => {
      throw new Error("After hook error");
    });

    const res = await fetch(`${BASE_URL}/api/collections/posts/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test Post" }),
    });

    // Request should still succeed despite hook error
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.title).toBe("Test Post");

    // Verify record WAS created
    const listRes = await fetch(`${BASE_URL}/api/collections/posts/records`);
    const listData = await listRes.json();
    expect(listData.items).toHaveLength(1);
  });

  // --------------------------------------------------------------------------
  // beforeUpdate Tests
  // --------------------------------------------------------------------------

  test("beforeUpdate hook receives existing record", async () => {
    let existingFromHook: Record<string, unknown> | null = null;

    // Create initial record
    const createRes = await fetch(`${BASE_URL}/api/collections/posts/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Original Title", content: "Original Content" }),
    });
    const created = await createRes.json();

    // Register hook that captures existing
    hookManager.on("beforeUpdate", "posts", async (ctx, next) => {
      existingFromHook = ctx.existing;
      await next();
    });

    // Update the record
    await fetch(`${BASE_URL}/api/collections/posts/records/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Updated Title" }),
    });

    expect(existingFromHook).not.toBeNull();
    expect((existingFromHook as Record<string, unknown>).title).toBe("Original Title");
    expect((existingFromHook as Record<string, unknown>).content).toBe("Original Content");
  });

  test("beforeUpdate hook can modify update data", async () => {
    // Create initial record
    const createRes = await fetch(`${BASE_URL}/api/collections/posts/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Original", content: "Original" }),
    });
    const created = await createRes.json();

    // Register hook that modifies data
    hookManager.on("beforeUpdate", "posts", async (ctx, next) => {
      ctx.data.content = "Modified by update hook";
      await next();
    });

    // Update the record (only updating title)
    const res = await fetch(`${BASE_URL}/api/collections/posts/records/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New Title" }),
    });

    const data = await res.json();
    expect(data.title).toBe("New Title");
    expect(data.content).toBe("Modified by update hook");
  });

  // --------------------------------------------------------------------------
  // beforeDelete Tests
  // --------------------------------------------------------------------------

  test("beforeDelete hook can cancel deletion", async () => {
    // Create a record
    const createRes = await fetch(`${BASE_URL}/api/collections/posts/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Protected Post" }),
    });
    const created = await createRes.json();

    // Register hook that throws to cancel
    hookManager.on("beforeDelete", "posts", async () => {
      throw new Error("Cannot delete");
    });

    // Try to delete
    const res = await fetch(`${BASE_URL}/api/collections/posts/records/${created.id}`, {
      method: "DELETE",
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Cannot delete");

    // Verify record still exists
    const getRes = await fetch(`${BASE_URL}/api/collections/posts/records/${created.id}`);
    expect(getRes.status).toBe(200);
  });

  // --------------------------------------------------------------------------
  // Request Context Tests
  // --------------------------------------------------------------------------

  test("hooks receive request context", async () => {
    let capturedRequest: { method: string; path: string; headers: Headers } | undefined;

    hookManager.on("beforeCreate", "posts", async (ctx, next) => {
      capturedRequest = ctx.request;
      await next();
    });

    const res = await fetch(`${BASE_URL}/api/collections/posts/records`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Custom-Header": "test-value",
      },
      body: JSON.stringify({ title: "Test Post" }),
    });

    expect(res.status).toBe(201);
    expect(capturedRequest).toBeDefined();
    expect(capturedRequest!.method).toBe("POST");
    expect(capturedRequest!.path).toBe("/api/collections/posts/records");
    expect(capturedRequest!.headers.get("X-Custom-Header")).toBe("test-value");
  });

  // --------------------------------------------------------------------------
  // Collection Scoping Tests
  // --------------------------------------------------------------------------

  test("collection-scoped hooks only run for matching collection", async () => {
    let hookRanForPosts = false;

    // Register hook specifically for "users" collection (doesn't exist but scope should filter it)
    hookManager.on("beforeCreate", "users", async (ctx, next) => {
      hookRanForPosts = true;
      await next();
    });

    // Create a record in "posts" collection
    const res = await fetch(`${BASE_URL}/api/collections/posts/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test Post" }),
    });

    expect(res.status).toBe(201);
    // Hook should NOT have run since it was scoped to "users"
    expect(hookRanForPosts).toBe(false);
  });

  // --------------------------------------------------------------------------
  // Global Hooks Tests
  // --------------------------------------------------------------------------

  test("global hooks run for all collections", async () => {
    let hookExecuted = false;
    let capturedCollection: string | undefined;

    // Register global hook (no collection specified)
    hookManager.on("beforeCreate", async (ctx, next) => {
      hookExecuted = true;
      capturedCollection = ctx.collection;
      await next();
    });

    const res = await fetch(`${BASE_URL}/api/collections/posts/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test Post" }),
    });

    expect(res.status).toBe(201);
    expect(hookExecuted).toBe(true);
    expect(capturedCollection).toBe("posts");
  });

  // --------------------------------------------------------------------------
  // afterDelete Tests
  // --------------------------------------------------------------------------

  test("afterDelete hook error doesn't fail request", async () => {
    // Create a record
    const createRes = await fetch(`${BASE_URL}/api/collections/posts/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "To Delete" }),
    });
    const created = await createRes.json();

    // Register afterDelete hook that throws
    hookManager.on("afterDelete", "posts", async () => {
      throw new Error("After delete error");
    });

    // Delete should still succeed
    const res = await fetch(`${BASE_URL}/api/collections/posts/records/${created.id}`, {
      method: "DELETE",
    });

    expect(res.status).toBe(204);

    // Verify record was deleted
    const getRes = await fetch(`${BASE_URL}/api/collections/posts/records/${created.id}`);
    expect(getRes.status).toBe(404);
  });
});
