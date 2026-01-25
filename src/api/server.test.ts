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
import { createServer } from "./server";

// Test configuration
const TEST_PORT = 8091;
const BASE_URL = `http://localhost:${TEST_PORT}`;

let server: ReturnType<typeof createServer>;

describe("REST API CRUD Endpoints", () => {
  beforeAll(() => {
    // Initialize test database
    initDatabase(":memory:");

    // Create test collection "posts" with title (required) and content (optional)
    createCollection("posts", [
      { name: "title", type: "text", required: true },
      { name: "content", type: "text", required: false },
    ]);

    // Start server
    server = createServer(TEST_PORT);
  });

  afterAll(() => {
    // Stop server
    server.stop();

    // Clean up
    try {
      deleteCollection("posts");
    } catch {
      // Collection may already be deleted
    }
    closeDatabase();
  });

  beforeEach(() => {
    // Clear all records from posts table
    const db = getDatabase();
    db.run('DELETE FROM "posts"');
  });

  // ============================================================================
  // GET /api/collections/:name/records (list)
  // ============================================================================

  describe("GET /api/collections/:name/records", () => {
    test("returns 200 with empty items array when no records", async () => {
      const res = await fetch(`${BASE_URL}/api/collections/posts/records`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.items).toBeArray();
      expect(data.items).toHaveLength(0);
      expect(data.totalItems).toBe(0);
    });

    test("returns 200 with items array containing records", async () => {
      // Create a record directly via database for setup
      const db = getDatabase();
      const id = "test-id-123";
      const now = new Date().toISOString();
      db.run(
        'INSERT INTO "posts" (id, created_at, updated_at, title, content) VALUES ($id, $created_at, $updated_at, $title, $content)',
        {
          id,
          created_at: now,
          updated_at: now,
          title: "Test Post",
          content: "Test content",
        }
      );

      const res = await fetch(`${BASE_URL}/api/collections/posts/records`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.items).toBeArray();
      expect(data.items).toHaveLength(1);
      expect(data.items[0].title).toBe("Test Post");
    });

    test("returns totalItems count matching items.length", async () => {
      // Create multiple records
      const db = getDatabase();
      const now = new Date().toISOString();
      for (let i = 0; i < 3; i++) {
        db.run(
          'INSERT INTO "posts" (id, created_at, updated_at, title, content) VALUES ($id, $created_at, $updated_at, $title, $content)',
          {
            id: `test-id-${i}`,
            created_at: now,
            updated_at: now,
            title: `Post ${i}`,
            content: `Content ${i}`,
          }
        );
      }

      const res = await fetch(`${BASE_URL}/api/collections/posts/records`);
      const data = await res.json();

      expect(data.totalItems).toBe(3);
      expect(data.items).toHaveLength(3);
      expect(data.totalItems).toBe(data.items.length);
    });

    test("returns 404 when collection doesn't exist", async () => {
      const res = await fetch(
        `${BASE_URL}/api/collections/nonexistent/records`
      );
      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data.error).toBeDefined();
    });
  });

  // ============================================================================
  // GET /api/collections/:name/records/:id (get single)
  // ============================================================================

  describe("GET /api/collections/:name/records/:id", () => {
    test("returns 200 with record when found", async () => {
      // Create a record
      const db = getDatabase();
      const id = "test-record-id";
      const now = new Date().toISOString();
      db.run(
        'INSERT INTO "posts" (id, created_at, updated_at, title, content) VALUES ($id, $created_at, $updated_at, $title, $content)',
        {
          id,
          created_at: now,
          updated_at: now,
          title: "Single Post",
          content: "Single content",
        }
      );

      const res = await fetch(
        `${BASE_URL}/api/collections/posts/records/${id}`
      );
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.id).toBe(id);
      expect(data.title).toBe("Single Post");
      expect(data.content).toBe("Single content");
    });

    test("returns 404 when record not found", async () => {
      const res = await fetch(
        `${BASE_URL}/api/collections/posts/records/nonexistent-id`
      );
      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data.error).toBeDefined();
    });

    test("returns 404 when collection not found", async () => {
      const res = await fetch(
        `${BASE_URL}/api/collections/nonexistent/records/some-id`
      );
      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data.error).toBeDefined();
    });
  });

  // ============================================================================
  // POST /api/collections/:name/records (create)
  // ============================================================================

  describe("POST /api/collections/:name/records", () => {
    test("returns 201 with created record including id, created_at, updated_at", async () => {
      const res = await fetch(`${BASE_URL}/api/collections/posts/records`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New Post", content: "New content" }),
      });
      expect(res.status).toBe(201);

      const data = await res.json();
      expect(data.id).toBeDefined();
      expect(data.id).toBeString();
      expect(data.created_at).toBeDefined();
      expect(data.updated_at).toBeDefined();
      expect(data.title).toBe("New Post");
      expect(data.content).toBe("New content");
    });

    test("returns 400 when validation fails (missing required field)", async () => {
      const res = await fetch(`${BASE_URL}/api/collections/posts/records`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Content without title" }),
      });
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toBeDefined();
      expect(data.error.toLowerCase()).toContain("validation");
    });

    test("returns 404 when collection not found", async () => {
      const res = await fetch(
        `${BASE_URL}/api/collections/nonexistent/records`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Test" }),
        }
      );
      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data.error).toBeDefined();
    });
  });

  // ============================================================================
  // PATCH /api/collections/:name/records/:id (update)
  // ============================================================================

  describe("PATCH /api/collections/:name/records/:id", () => {
    test("returns 200 with updated record", async () => {
      // Create a record first
      const createRes = await fetch(
        `${BASE_URL}/api/collections/posts/records`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Original Title", content: "Original" }),
        }
      );
      const created = await createRes.json();

      // Update it
      const res = await fetch(
        `${BASE_URL}/api/collections/posts/records/${created.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Updated Title" }),
        }
      );
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.title).toBe("Updated Title");
      expect(data.content).toBe("Original"); // Unchanged
    });

    test("updates updated_at timestamp", async () => {
      // Create a record first
      const createRes = await fetch(
        `${BASE_URL}/api/collections/posts/records`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Test", content: "Content" }),
        }
      );
      const created = await createRes.json();

      // Wait a bit to ensure timestamp difference
      await new Promise((r) => setTimeout(r, 10));

      // Update it
      const res = await fetch(
        `${BASE_URL}/api/collections/posts/records/${created.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Updated" }),
        }
      );
      const updated = await res.json();

      expect(updated.updated_at).not.toBe(created.updated_at);
    });

    test("returns 400 when validation fails", async () => {
      // Create a record first
      const createRes = await fetch(
        `${BASE_URL}/api/collections/posts/records`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Test", content: "Content" }),
        }
      );
      const created = await createRes.json();

      // Try to update with invalid data (title as wrong type)
      const res = await fetch(
        `${BASE_URL}/api/collections/posts/records/${created.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: 12345 }), // Number instead of string
        }
      );
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toBeDefined();
    });

    test("returns 404 when record not found", async () => {
      const res = await fetch(
        `${BASE_URL}/api/collections/posts/records/nonexistent-id`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Updated" }),
        }
      );
      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data.error).toBeDefined();
    });

    test("returns 404 when collection not found", async () => {
      const res = await fetch(
        `${BASE_URL}/api/collections/nonexistent/records/some-id`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Updated" }),
        }
      );
      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data.error).toBeDefined();
    });
  });

  // ============================================================================
  // DELETE /api/collections/:name/records/:id (delete)
  // ============================================================================

  describe("DELETE /api/collections/:name/records/:id", () => {
    test("returns 204 No Content on success", async () => {
      // Create a record first
      const createRes = await fetch(
        `${BASE_URL}/api/collections/posts/records`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "To Delete", content: "Content" }),
        }
      );
      const created = await createRes.json();

      // Delete it
      const res = await fetch(
        `${BASE_URL}/api/collections/posts/records/${created.id}`,
        {
          method: "DELETE",
        }
      );
      expect(res.status).toBe(204);

      // Verify it's deleted
      const getRes = await fetch(
        `${BASE_URL}/api/collections/posts/records/${created.id}`
      );
      expect(getRes.status).toBe(404);
    });

    test("returns 404 when record not found", async () => {
      const res = await fetch(
        `${BASE_URL}/api/collections/posts/records/nonexistent-id`,
        {
          method: "DELETE",
        }
      );
      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data.error).toBeDefined();
    });

    test("returns 404 when collection not found", async () => {
      const res = await fetch(
        `${BASE_URL}/api/collections/nonexistent/records/some-id`,
        {
          method: "DELETE",
        }
      );
      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data.error).toBeDefined();
    });
  });
});
