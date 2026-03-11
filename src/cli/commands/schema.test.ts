import { test, expect, beforeEach, afterEach } from "bun:test";
import { initDatabase, closeDatabase } from "../../core/database";
import { createCollection, getAllCollections, getFields, getCollection, updateCollectionRules } from "../../core/schema";
import { unlink } from "node:fs/promises";

const TEST_DB = `/tmp/bunbase-schema-test-${process.pid}.db`;

beforeEach(() => {
  initDatabase(TEST_DB);
});

afterEach(async () => {
  closeDatabase();
  try { await unlink(TEST_DB); } catch {}
  try { await unlink(TEST_DB + "-wal"); } catch {}
  try { await unlink(TEST_DB + "-shm"); } catch {}
});

test("schema export produces correct format", async () => {
  createCollection("tasks", [
    { name: "title", type: "text", required: true, options: null },
    { name: "priority", type: "number", required: false, options: null },
  ], {
    rules: {
      listRule: "",
      viewRule: "",
      createRule: null,
      updateRule: null,
      deleteRule: null,
    },
  });

  createCollection("users", [
    { name: "display_name", type: "text", required: false, options: null },
  ], { type: "auth" });

  const { execute } = await import("./schema");

  let captured: unknown = null;
  const origLog = console.log;
  console.log = (msg: string) => { captured = JSON.parse(msg); };
  try {
    await execute(["export"], "json");
  } finally {
    console.log = origLog;
  }

  const exported = captured as any[];
  expect(exported.length).toBe(2);

  const tasks = exported.find((e: any) => e.name === "tasks");
  expect(tasks.type).toBe("base");
  expect(tasks.fields.length).toBe(2);
  const fieldNames = tasks.fields.map((f: any) => f.name).sort();
  expect(fieldNames).toEqual(["priority", "title"]);
  const titleField = tasks.fields.find((f: any) => f.name === "title");
  expect(titleField.required).toBe(true);
  expect(tasks.rules.listRule).toBe("");
  expect(tasks.rules.createRule).toBeNull();

  const users = exported.find((e: any) => e.name === "users");
  expect(users.type).toBe("auth");
  expect(users.fields.length).toBe(1);
});

test("schema export then import roundtrip", async () => {
  // Create collections
  createCollection("tasks", [
    { name: "title", type: "text", required: true, options: null },
    { name: "status", type: "text", required: false, options: null },
  ], {
    rules: {
      listRule: "",
      viewRule: "",
      createRule: "",
      updateRule: "",
      deleteRule: "",
    },
  });

  // Export
  const { execute } = await import("./schema");

  let exported: unknown = null;
  const origLog = console.log;
  console.log = (msg: string) => { exported = JSON.parse(msg); };
  try {
    await execute(["export"], "json");
  } finally {
    console.log = origLog;
  }

  // Write export to file
  const exportPath = "/tmp/bunbase-schema-roundtrip.json";
  await Bun.write(exportPath, JSON.stringify(exported));

  // Close and reinit with fresh DB
  closeDatabase();
  try { await unlink(TEST_DB); } catch {}
  try { await unlink(TEST_DB + "-wal"); } catch {}
  try { await unlink(TEST_DB + "-shm"); } catch {}
  initDatabase(TEST_DB);

  // Import
  let imported: unknown = null;
  console.log = (msg: string) => { imported = JSON.parse(msg); };
  try {
    await execute(["import", "--file", exportPath], "json");
  } finally {
    console.log = origLog;
  }

  // Verify
  const collections = getAllCollections();
  expect(collections.length).toBe(1);
  expect(collections[0].name).toBe("tasks");

  const fields = getFields("tasks");
  expect(fields.length).toBe(2);

  const result = imported as any;
  expect(result.created).toEqual(["tasks"]);

  await unlink(exportPath);
});

test("schema import with --merge skips existing", async () => {
  createCollection("existing", [
    { name: "val", type: "text", required: false, options: null },
  ]);

  const schema = JSON.stringify([
    { name: "existing", fields: [{ name: "val", type: "text", required: false, options: null }] },
    { name: "new_one", fields: [{ name: "val", type: "text", required: false, options: null }] },
  ]);

  const filePath = "/tmp/bunbase-schema-merge.json";
  await Bun.write(filePath, schema);

  const { execute } = await import("./schema");

  let captured: unknown = null;
  const origLog = console.log;
  console.log = (msg: string) => { captured = JSON.parse(msg); };
  try {
    await execute(["import", "--file", filePath, "--merge"], "json");
  } finally {
    console.log = origLog;
  }

  const result = captured as any;
  expect(result.skipped).toEqual(["existing"]);
  expect(result.created).toEqual(["new_one"]);

  expect(getAllCollections().length).toBe(2);

  await unlink(filePath);
});

test("schema import with --force replaces existing", async () => {
  createCollection("existing", [
    { name: "old_field", type: "text", required: false, options: null },
  ]);

  const schema = JSON.stringify([
    { name: "existing", fields: [{ name: "new_field", type: "number", required: true, options: null }] },
  ]);

  const filePath = "/tmp/bunbase-schema-force.json";
  await Bun.write(filePath, schema);

  const { execute } = await import("./schema");

  let captured: unknown = null;
  const origLog = console.log;
  console.log = (msg: string) => { captured = JSON.parse(msg); };
  try {
    await execute(["import", "--file", filePath, "--force"], "json");
  } finally {
    console.log = origLog;
  }

  const result = captured as any;
  expect(result.replaced).toEqual(["existing"]);

  const fields = getFields("existing");
  expect(fields.length).toBe(1);
  expect(fields[0].name).toBe("new_field");
  expect(fields[0].type).toBe("number");

  await unlink(filePath);
});
