import { test, expect, beforeAll, afterAll } from "bun:test";
import { initDatabase, closeDatabase, getDatabase } from "../core/database";
import { createServer } from "./server";
import { createAdmin } from "../auth/admin";
import { createAdminToken } from "../auth/jwt";
import { getAllCollections, getCollection, getFields } from "../core/schema";
import { listRecordsWithQuery } from "../core/records";
import { unlink } from "node:fs/promises";

const TEST_DB = `/tmp/bunbase-bulk-test-${process.pid}.db`;
const TEST_PORT = 18765;

let server: ReturnType<typeof createServer>;
let adminToken: string;

beforeAll(async () => {
  initDatabase(TEST_DB);
  const admin = await createAdmin("admin@test.local", "testpass");
  adminToken = await createAdminToken(admin.id);
  server = createServer(TEST_PORT);
});

afterAll(async () => {
  server.stop();
  closeDatabase();
  try { await unlink(TEST_DB); } catch {}
  try { await unlink(TEST_DB + "-wal"); } catch {}
  try { await unlink(TEST_DB + "-shm"); } catch {}
});

const BASE = `http://localhost:${TEST_PORT}`;

test("POST /_/api/bulk creates collections and records atomically", async () => {
  const res = await fetch(`${BASE}/_/api/bulk`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      operations: [
        {
          action: "createCollection",
          name: "projects",
          fields: [
            { name: "title", type: "text", required: true, options: null },
            { name: "status", type: "text", required: false, options: null },
          ],
        },
        {
          action: "updateRules",
          collection: "projects",
          rules: {
            listRule: "",
            viewRule: "",
            createRule: "",
            updateRule: "",
            deleteRule: "",
          },
        },
        {
          action: "createRecord",
          collection: "projects",
          data: [
            { title: "Project A", status: "active" },
            { title: "Project B", status: "done" },
          ],
        },
      ],
    }),
  });

  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.success).toBe(true);
  expect(body.results.length).toBe(3);

  // Verify collection created
  const collection = getCollection("projects");
  expect(collection).toBeTruthy();
  expect(collection!.rules!.listRule).toBe("");

  // Verify records created
  const records = listRecordsWithQuery("projects", {});
  expect(records.totalItems).toBe(2);
});

test("POST /_/api/bulk rolls back on failure", async () => {
  const res = await fetch(`${BASE}/_/api/bulk`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      operations: [
        {
          action: "createCollection",
          name: "will_rollback",
          fields: [
            { name: "val", type: "text", required: false, options: null },
          ],
        },
        {
          action: "createRecord",
          collection: "nonexistent_collection",
          data: { val: "test" },
        },
      ],
    }),
  });

  expect(res.status).not.toBe(200);

  // Collection should not exist due to rollback
  const collection = getCollection("will_rollback");
  expect(collection).toBeNull();
});

test("POST /_/api/bulk requires authentication", async () => {
  const res = await fetch(`${BASE}/_/api/bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operations: [] }),
  });

  expect(res.status).toBe(401);
});

test("POST /_/api/bulk validates operations", async () => {
  const res = await fetch(`${BASE}/_/api/bulk`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      operations: [{ action: "invalidAction" }],
    }),
  });

  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.error).toContain("Invalid action");
});

test("GET /_/api/status returns database info", async () => {
  const res = await fetch(`${BASE}/_/api/status`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });

  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.collections).toBeDefined();
  expect(body.collections.count).toBeGreaterThanOrEqual(0);
  expect(body.auth).toBeDefined();
  expect(typeof body.auth.jwt_secret_set).toBe("boolean");
  expect(typeof body.auth.admin_accounts).toBe("number");
});

test("GET /_/api/status requires auth", async () => {
  const res = await fetch(`${BASE}/_/api/status`);
  expect(res.status).toBe(401);
});
