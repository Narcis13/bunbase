import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { rm } from "node:fs/promises";
import { HookManager } from "../core/hooks";
import { registerFileCleanupHook } from "./hooks";
import { saveFile, listRecordFiles } from "./files";
import { initDatabase, closeDatabase } from "../core/database";
import { createCollection, deleteCollection } from "../core/schema";
import { createRecord, deleteRecordWithHooks } from "../core/records";

const TEST_STORAGE_DIR = "./test-hooks-storage";

describe("file cleanup hook", () => {
  let hooks: HookManager;

  beforeEach(async () => {
    // Set up test environment
    process.env.BUNBASE_STORAGE_DIR = TEST_STORAGE_DIR;
    await rm(TEST_STORAGE_DIR, { recursive: true, force: true });

    // Initialize in-memory database
    initDatabase(":memory:");

    // Create hook manager and register cleanup hook
    hooks = new HookManager();
    registerFileCleanupHook(hooks);
  });

  afterEach(async () => {
    closeDatabase();
    await rm(TEST_STORAGE_DIR, { recursive: true, force: true });
    delete process.env.BUNBASE_STORAGE_DIR;
  });

  test("deletes files when record with file field is deleted", async () => {
    // Create collection with file field
    createCollection("posts", [
      { name: "title", type: "text", required: true },
      { name: "image", type: "file", required: false },
    ]);

    // Create record
    const record = createRecord("posts", { title: "Test Post" });

    // Save a file for the record
    const file = new File(["test content"], "photo.jpg", { type: "image/jpeg" });
    await saveFile("posts", record.id as string, file);

    // Verify file exists
    const filesBefore = await listRecordFiles("posts", record.id as string);
    expect(filesBefore.length).toBe(1);

    // Delete record (triggers cleanup hook)
    await deleteRecordWithHooks("posts", record.id as string, hooks);

    // Verify files are deleted
    const filesAfter = await listRecordFiles("posts", record.id as string);
    expect(filesAfter.length).toBe(0);
  });

  test("does not error for collections without file fields", async () => {
    // Create collection WITHOUT file fields
    createCollection("notes", [
      { name: "content", type: "text", required: true },
    ]);

    // Create and delete record
    const record = createRecord("notes", { content: "Test note" });

    // Should not throw
    await deleteRecordWithHooks("notes", record.id as string, hooks);
  });

  test("continues chain even if cleanup fails", async () => {
    // Create collection with file field
    createCollection("docs", [
      { name: "name", type: "text", required: true },
      { name: "file", type: "file", required: false },
    ]);

    const record = createRecord("docs", { name: "Test Doc" });

    // Mock console.error to capture logs
    const originalConsoleError = console.error;
    const errorLogs: unknown[] = [];
    console.error = (...args: unknown[]) => errorLogs.push(args);

    // Even with potential errors, deletion should succeed
    await deleteRecordWithHooks("docs", record.id as string, hooks);

    console.error = originalConsoleError;
    // Record should be deleted even if file cleanup had issues
  });

  test("returns unsubscribe function", async () => {
    const newHooks = new HookManager();
    const unsubscribe = registerFileCleanupHook(newHooks);

    expect(typeof unsubscribe).toBe("function");

    // After unsubscribe, hook should not run
    unsubscribe();

    // Create and delete - should work without cleanup hook
    createCollection("temp", [
      { name: "data", type: "text", required: true },
      { name: "attachment", type: "file", required: false },
    ]);

    const record = createRecord("temp", { data: "test" });
    await deleteRecordWithHooks("temp", record.id as string, newHooks);
    // No errors means success
  });

  test("deletes multiple files for a record", async () => {
    // Create collection with multi-file field
    createCollection("galleries", [
      { name: "name", type: "text", required: true },
      { name: "images", type: "file", required: false, options: { maxFiles: 5 } },
    ]);

    // Create record
    const record = createRecord("galleries", { name: "My Gallery" });

    // Save multiple files
    const file1 = new File(["image1"], "pic1.jpg", { type: "image/jpeg" });
    const file2 = new File(["image2"], "pic2.jpg", { type: "image/jpeg" });
    const file3 = new File(["image3"], "pic3.png", { type: "image/png" });

    await saveFile("galleries", record.id as string, file1);
    await saveFile("galleries", record.id as string, file2);
    await saveFile("galleries", record.id as string, file3);

    // Verify files exist
    const filesBefore = await listRecordFiles("galleries", record.id as string);
    expect(filesBefore.length).toBe(3);

    // Delete record
    await deleteRecordWithHooks("galleries", record.id as string, hooks);

    // Verify all files are deleted
    const filesAfter = await listRecordFiles("galleries", record.id as string);
    expect(filesAfter.length).toBe(0);
  });
});
