import { test, expect, beforeEach, afterEach } from "bun:test";
import { initDatabase, closeDatabase, getDatabase } from "../../core/database";
import { getAllCollections, getFields, getCollection } from "../../core/schema";
import { listRecordsWithQuery } from "../../core/records";
import { unlink } from "node:fs/promises";

const TEST_DB = `/tmp/bunbase-init-test-${process.pid}.db`;

beforeEach(() => {
  initDatabase(TEST_DB);
});

afterEach(async () => {
  closeDatabase();
  try { await unlink(TEST_DB); } catch {}
  try { await unlink(TEST_DB + "-wal"); } catch {}
  try { await unlink(TEST_DB + "-shm"); } catch {}
});

test("bunbase init creates collections from schema file", async () => {
  const schema = JSON.stringify([
    {
      name: "tasks",
      type: "base",
      fields: [
        { name: "title", type: "text", required: true, options: null },
        { name: "status", type: "text", required: false, options: null },
      ],
      rules: {
        listRule: "",
        viewRule: "",
        createRule: "",
        updateRule: "",
        deleteRule: "",
      },
    },
    {
      name: "users",
      type: "auth",
      fields: [
        { name: "display_name", type: "text", required: false, options: null },
      ],
    },
  ]);

  // Write schema to temp file
  const schemaPath = "/tmp/bunbase-init-test-schema.json";
  await Bun.write(schemaPath, schema);

  // Run init via the execute function
  const { execute } = await import("./init");

  // Capture output by mocking console.log
  let captured: unknown = null;
  const origLog = console.log;
  console.log = (msg: string) => { captured = JSON.parse(msg); };
  try {
    await execute(["--collections", schemaPath], "json");
  } finally {
    console.log = origLog;
  }

  // Verify collections were created
  const collections = getAllCollections();
  expect(collections.length).toBe(2);
  expect(collections.map(c => c.name).sort()).toEqual(["tasks", "users"]);

  // Verify fields
  const taskFields = getFields("tasks");
  expect(taskFields.length).toBe(2);
  expect(taskFields.map(f => f.name).sort()).toEqual(["status", "title"]);

  // Verify auth collection
  const usersCollection = getCollection("users");
  expect(usersCollection!.type).toBe("auth");

  // Verify output
  expect(captured).toBeTruthy();
  const result = captured as any;
  expect(result.collections.length).toBe(2);
  expect(result.skipped.length).toBe(0);

  await unlink(schemaPath);
});

test("bunbase init with seed data creates records", async () => {
  const schema = JSON.stringify([
    {
      name: "tasks",
      fields: [
        { name: "title", type: "text", required: true, options: null },
        { name: "done", type: "boolean", required: false, options: null },
      ],
    },
  ]);

  const seed = JSON.stringify({
    tasks: [
      { title: "Task 1", done: false },
      { title: "Task 2", done: true },
      { title: "Task 3", done: false },
    ],
  });

  const schemaPath = "/tmp/bunbase-init-test-schema2.json";
  const seedPath = "/tmp/bunbase-init-test-seed2.json";
  await Bun.write(schemaPath, schema);
  await Bun.write(seedPath, seed);

  const { execute } = await import("./init");

  let captured: unknown = null;
  const origLog = console.log;
  console.log = (msg: string) => { captured = JSON.parse(msg); };
  try {
    await execute(["--collections", schemaPath, "--seed", seedPath], "json");
  } finally {
    console.log = origLog;
  }

  // Verify records were created
  const result = listRecordsWithQuery("tasks", {});
  expect(result.totalItems).toBe(3);

  // Verify output includes record counts
  const output = captured as any;
  expect(output.records.tasks).toBe(3);

  await unlink(schemaPath);
  await unlink(seedPath);
});

test("bunbase init skips existing collections without --force", async () => {
  const { createCollection } = await import("../../core/schema");
  createCollection("existing", [{ name: "val", type: "text", required: false, options: null }]);

  const schema = JSON.stringify([
    {
      name: "existing",
      fields: [{ name: "val", type: "text", required: false, options: null }],
    },
    {
      name: "new_one",
      fields: [{ name: "val", type: "text", required: false, options: null }],
    },
  ]);

  const schemaPath = "/tmp/bunbase-init-test-schema3.json";
  await Bun.write(schemaPath, schema);

  const { execute } = await import("./init");

  let captured: unknown = null;
  const origLog = console.log;
  console.log = (msg: string) => { captured = JSON.parse(msg); };
  try {
    await execute(["--collections", schemaPath], "json");
  } finally {
    console.log = origLog;
  }

  const output = captured as any;
  expect(output.skipped).toEqual(["existing"]);
  expect(output.collections.length).toBe(1);
  expect(output.collections[0].name).toBe("new_one");

  await unlink(schemaPath);
});

test("bunbase init is atomic - rolls back on failure", async () => {
  const schema = JSON.stringify([
    {
      name: "good_collection",
      fields: [{ name: "val", type: "text", required: false, options: null }],
    },
  ]);

  const seed = JSON.stringify({
    nonexistent_collection: [{ val: "test" }],
  });

  const schemaPath = "/tmp/bunbase-init-test-schema4.json";
  const seedPath = "/tmp/bunbase-init-test-seed4.json";
  await Bun.write(schemaPath, schema);
  await Bun.write(seedPath, seed);

  const { execute } = await import("./init");

  // Suppress error output and process.exit
  const origError = console.error;
  const origExit = process.exit;
  let exitCode: number | undefined;
  console.error = () => {};
  process.exit = ((code?: number) => { exitCode = code; throw new Error("exit"); }) as any;

  try {
    await execute(["--collections", schemaPath, "--seed", seedPath], "json");
  } catch (e: any) {
    if (e.message !== "exit") throw e;
  } finally {
    console.error = origError;
    process.exit = origExit;
  }

  // good_collection should NOT exist because the transaction rolled back
  const collection = getCollection("good_collection");
  expect(collection).toBeNull();

  await unlink(schemaPath);
  await unlink(seedPath);
});
