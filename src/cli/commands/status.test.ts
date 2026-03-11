import { test, expect, beforeEach, afterEach } from "bun:test";
import { initDatabase, closeDatabase } from "../../core/database";
import { createCollection } from "../../core/schema";
import { createRecord } from "../../core/records";
import { unlink } from "node:fs/promises";

const TEST_DB = `/tmp/bunbase-status-test-${process.pid}.db`;

beforeEach(() => {
  initDatabase(TEST_DB);
});

afterEach(async () => {
  closeDatabase();
  try { await unlink(TEST_DB); } catch {}
  try { await unlink(TEST_DB + "-wal"); } catch {}
  try { await unlink(TEST_DB + "-shm"); } catch {}
});

test("bunbase status shows database info", async () => {
  // Create some test data
  createCollection("tasks", [
    { name: "title", type: "text", required: true, options: null },
  ]);
  createRecord("tasks", { title: "Test task" });
  createRecord("tasks", { title: "Another task" });

  createCollection("notes", [
    { name: "body", type: "text", required: false, options: null },
  ]);

  const { execute } = await import("./status");

  let captured: unknown = null;
  const origLog = console.log;
  console.log = (msg: string) => { captured = JSON.parse(msg); };
  try {
    await execute([], "json", TEST_DB);
  } finally {
    console.log = origLog;
  }

  const status = captured as any;
  expect(status.database.path).toBe(TEST_DB);
  expect(status.collections.count).toBe(2);
  expect(status.collections.details.length).toBe(2);

  const tasks = status.collections.details.find((d: any) => d.name === "tasks");
  expect(tasks.records).toBe(2);
  expect(tasks.fields).toBe(1);

  const notes = status.collections.details.find((d: any) => d.name === "notes");
  expect(notes.records).toBe(0);
  expect(notes.fields).toBe(1);

  expect(status.auth).toBeDefined();
  expect(typeof status.auth.jwt_secret_set).toBe("boolean");
  expect(typeof status.auth.admin_password_set).toBe("boolean");
});

test("bunbase status with empty database", async () => {
  const { execute } = await import("./status");

  let captured: unknown = null;
  const origLog = console.log;
  console.log = (msg: string) => { captured = JSON.parse(msg); };
  try {
    await execute([], "json", TEST_DB);
  } finally {
    console.log = origLog;
  }

  const status = captured as any;
  expect(status.collections.count).toBe(0);
  expect(status.collections.details).toEqual([]);
});
