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

    // Create test collection "authors" for relation testing
    createCollection("authors", [
      { name: "name", type: "text", required: true },
    ]);

    // Create test collection "posts" with title (required), content (optional), author (relation)
    createCollection("posts", [
      { name: "title", type: "text", required: true },
      { name: "content", type: "text", required: false },
      { name: "author", type: "relation", required: false, options: { collection: "authors" } },
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
      deleteCollection("authors");
    } catch {
      // Collections may already be deleted
    }
    closeDatabase();
  });

  beforeEach(() => {
    // Clear all records from posts and authors tables
    const db = getDatabase();
    db.run('DELETE FROM "posts"');
    db.run('DELETE FROM "authors"');
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
      // Check pagination metadata
      expect(data.page).toBe(1);
      expect(data.perPage).toBe(30);
      expect(data.totalPages).toBe(0);
    });

    test("returns 200 with items array containing records", async () => {
      // Create a record directly via database for setup
      const db = getDatabase();
      const id = "test-id-123";
      const now = new Date().toISOString();
      db.run(
        'INSERT INTO "posts" (id, created_at, updated_at, title, content, author) VALUES ($id, $created_at, $updated_at, $title, $content, $author)',
        {
          id,
          created_at: now,
          updated_at: now,
          title: "Test Post",
          content: "Test content",
          author: null,
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
          'INSERT INTO "posts" (id, created_at, updated_at, title, content, author) VALUES ($id, $created_at, $updated_at, $title, $content, $author)',
          {
            id: `test-id-${i}`,
            created_at: now,
            updated_at: now,
            title: `Post ${i}`,
            content: `Content ${i}`,
            author: null,
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
  // Query Capabilities Tests
  // ============================================================================

  describe("Query Capabilities", () => {
    // Helper to create test records
    async function createTestRecords() {
      const db = getDatabase();
      const now = new Date().toISOString();
      const records = [
        { id: "post-1", title: "Alpha Post", content: "First content" },
        { id: "post-2", title: "Beta Post", content: "Second content" },
        { id: "post-3", title: "Gamma Post", content: "Third content" },
        { id: "post-4", title: "Delta Post", content: "Fourth content" },
        { id: "post-5", title: "Epsilon Post", content: "Fifth content" },
      ];
      for (const rec of records) {
        db.run(
          'INSERT INTO "posts" (id, created_at, updated_at, title, content, author) VALUES ($id, $created_at, $updated_at, $title, $content, $author)',
          {
            id: rec.id,
            created_at: now,
            updated_at: now,
            title: rec.title,
            content: rec.content,
            author: null,
          }
        );
      }
    }

    // Pagination tests
    test("pagination: returns correct page with perPage limit", async () => {
      await createTestRecords();

      const res = await fetch(
        `${BASE_URL}/api/collections/posts/records?page=1&perPage=2`
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.items).toHaveLength(2);
      expect(data.page).toBe(1);
      expect(data.perPage).toBe(2);
      expect(data.totalItems).toBe(5);
      expect(data.totalPages).toBe(3);
    });

    test("pagination: returns second page correctly", async () => {
      await createTestRecords();

      const res = await fetch(
        `${BASE_URL}/api/collections/posts/records?page=2&perPage=2`
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.items).toHaveLength(2);
      expect(data.page).toBe(2);
    });

    test("pagination: returns empty items for page beyond data", async () => {
      await createTestRecords();

      const res = await fetch(
        `${BASE_URL}/api/collections/posts/records?page=10&perPage=2`
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.items).toHaveLength(0);
      expect(data.totalItems).toBe(5);
    });

    // Sort tests
    test("sort: ascending by title", async () => {
      await createTestRecords();

      const res = await fetch(
        `${BASE_URL}/api/collections/posts/records?sort=title`
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.items[0].title).toBe("Alpha Post");
      // Alphabetical order: Alpha, Beta, Delta, Epsilon, Gamma
      expect(data.items[4].title).toBe("Gamma Post");
    });

    test("sort: descending by title with - prefix", async () => {
      await createTestRecords();

      const res = await fetch(
        `${BASE_URL}/api/collections/posts/records?sort=-title`
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.items[0].title).toBe("Gamma Post");
      expect(data.items[4].title).toBe("Alpha Post");
    });

    // Filter tests
    test("filter: equals operator", async () => {
      await createTestRecords();

      const res = await fetch(
        `${BASE_URL}/api/collections/posts/records?title=Alpha%20Post`
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.items).toHaveLength(1);
      expect(data.items[0].title).toBe("Alpha Post");
      expect(data.totalItems).toBe(1);
    });

    test("filter: not equals operator", async () => {
      await createTestRecords();

      const res = await fetch(
        `${BASE_URL}/api/collections/posts/records?title!=Alpha%20Post`
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.items).toHaveLength(4);
      expect(data.totalItems).toBe(4);
    });

    test("filter: like operator (contains)", async () => {
      await createTestRecords();

      const res = await fetch(
        `${BASE_URL}/api/collections/posts/records?title~=Post`
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.items).toHaveLength(5);
    });

    test("filter: returns 400 for invalid field name", async () => {
      await createTestRecords();

      const res = await fetch(
        `${BASE_URL}/api/collections/posts/records?invalid_field=value`
      );
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain("Invalid filter field");
    });

    test("sort: returns 400 for invalid sort field", async () => {
      await createTestRecords();

      const res = await fetch(
        `${BASE_URL}/api/collections/posts/records?sort=invalid_field`
      );
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain("Invalid sort field");
    });

    // Expand tests
    test("expand: includes related record in expand object", async () => {
      const db = getDatabase();
      const now = new Date().toISOString();

      // Create an author
      db.run(
        'INSERT INTO "authors" (id, created_at, updated_at, name) VALUES ($id, $created_at, $updated_at, $name)',
        {
          id: "author-1",
          created_at: now,
          updated_at: now,
          name: "John Doe",
        }
      );

      // Create a post with author relation
      db.run(
        'INSERT INTO "posts" (id, created_at, updated_at, title, content, author) VALUES ($id, $created_at, $updated_at, $title, $content, $author)',
        {
          id: "post-with-author",
          created_at: now,
          updated_at: now,
          title: "Post With Author",
          content: "Content",
          author: "author-1",
        }
      );

      const res = await fetch(
        `${BASE_URL}/api/collections/posts/records?expand=author`
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.items).toHaveLength(1);
      expect(data.items[0].expand).toBeDefined();
      expect(data.items[0].expand.author).toBeDefined();
      expect(data.items[0].expand.author.name).toBe("John Doe");
    });

    test("expand: skips gracefully when relation is null", async () => {
      const db = getDatabase();
      const now = new Date().toISOString();

      // Create a post without author
      db.run(
        'INSERT INTO "posts" (id, created_at, updated_at, title, content, author) VALUES ($id, $created_at, $updated_at, $title, $content, $author)',
        {
          id: "post-no-author",
          created_at: now,
          updated_at: now,
          title: "Post Without Author",
          content: "Content",
          author: null,
        }
      );

      const res = await fetch(
        `${BASE_URL}/api/collections/posts/records?expand=author`
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.items).toHaveLength(1);
      // No expand object should be present since relation is null
      expect(data.items[0].expand).toBeUndefined();
    });

    // Combined query test
    test("combined: filter + sort + pagination work together", async () => {
      await createTestRecords();

      const res = await fetch(
        `${BASE_URL}/api/collections/posts/records?title~=Post&sort=-title&page=1&perPage=2`
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.items).toHaveLength(2);
      expect(data.items[0].title).toBe("Gamma Post"); // Descending
      expect(data.page).toBe(1);
      expect(data.perPage).toBe(2);
      expect(data.totalItems).toBe(5);
    });

    // System field tests
    test("filter by system field id works", async () => {
      await createTestRecords();

      const res = await fetch(
        `${BASE_URL}/api/collections/posts/records?id=post-1`
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.items).toHaveLength(1);
      expect(data.items[0].id).toBe("post-1");
    });

    test("sort by system field created_at works", async () => {
      const db = getDatabase();
      const now = new Date().toISOString();
      const later = new Date(Date.now() + 1000).toISOString();

      db.run(
        'INSERT INTO "posts" (id, created_at, updated_at, title, content, author) VALUES ($id, $created_at, $updated_at, $title, $content, $author)',
        { id: "old-post", created_at: now, updated_at: now, title: "Old", content: "Old", author: null }
      );
      db.run(
        'INSERT INTO "posts" (id, created_at, updated_at, title, content, author) VALUES ($id, $created_at, $updated_at, $title, $content, $author)',
        { id: "new-post", created_at: later, updated_at: later, title: "New", content: "New", author: null }
      );

      const res = await fetch(
        `${BASE_URL}/api/collections/posts/records?sort=-created_at`
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.items[0].id).toBe("new-post");
      expect(data.items[1].id).toBe("old-post");
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
