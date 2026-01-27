import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { rm, mkdir, readdir } from "node:fs/promises";
import path from "path";
import {
  getStorageDir,
  getRecordStoragePath,
  getFilePath,
  ensureRecordStorageDir,
  saveFile,
  deleteFile,
  deleteRecordFiles,
  listRecordFiles,
  fileExists,
} from "./files";

// Use a test-specific storage directory
const TEST_STORAGE_DIR = "./test-storage";

describe("file storage", () => {
  beforeEach(async () => {
    // Set test storage directory
    process.env.BUNBASE_STORAGE_DIR = TEST_STORAGE_DIR;
    // Clean up before each test
    await rm(TEST_STORAGE_DIR, { recursive: true, force: true });
  });

  afterEach(async () => {
    // Clean up after each test
    await rm(TEST_STORAGE_DIR, { recursive: true, force: true });
    delete process.env.BUNBASE_STORAGE_DIR;
  });

  describe("getStorageDir", () => {
    test("returns env var when set", () => {
      process.env.BUNBASE_STORAGE_DIR = "/custom/path";
      expect(getStorageDir()).toBe("/custom/path");
      process.env.BUNBASE_STORAGE_DIR = TEST_STORAGE_DIR;
    });

    test("returns default when env var not set", () => {
      delete process.env.BUNBASE_STORAGE_DIR;
      expect(getStorageDir()).toBe("./data/storage");
      process.env.BUNBASE_STORAGE_DIR = TEST_STORAGE_DIR;
    });
  });

  describe("getRecordStoragePath", () => {
    test("builds correct path structure", () => {
      const result = getRecordStoragePath("posts", "abc123");
      expect(result).toBe(path.join(TEST_STORAGE_DIR, "posts", "abc123"));
    });
  });

  describe("getFilePath", () => {
    test("builds correct file path", () => {
      const result = getFilePath("posts", "abc123", "image.jpg");
      expect(result).toBe(path.join(TEST_STORAGE_DIR, "posts", "abc123", "image.jpg"));
    });
  });

  describe("ensureRecordStorageDir", () => {
    test("creates directory structure", async () => {
      const dir = await ensureRecordStorageDir("posts", "rec123");
      expect(dir).toBe(path.join(TEST_STORAGE_DIR, "posts", "rec123"));

      // Verify directory exists
      const entries = await readdir(path.join(TEST_STORAGE_DIR, "posts"));
      expect(entries).toContain("rec123");
    });

    test("is idempotent (calling twice doesn't error)", async () => {
      await ensureRecordStorageDir("posts", "rec123");
      await ensureRecordStorageDir("posts", "rec123"); // Should not throw
    });
  });

  describe("saveFile", () => {
    test("saves file and returns sanitized filename", async () => {
      const file = new File(["test content"], "My Photo.jpg", { type: "image/jpeg" });
      const filename = await saveFile("posts", "rec123", file);

      // Filename should be sanitized with random suffix
      expect(filename).toMatch(/^My_Photo_[a-zA-Z0-9_-]{10}\.jpg$/);

      // File should exist on disk
      const exists = await fileExists("posts", "rec123", filename);
      expect(exists).toBe(true);

      // File content should match
      const filePath = getFilePath("posts", "rec123", filename);
      const content = await Bun.file(filePath).text();
      expect(content).toBe("test content");
    });

    test("saves binary files correctly", async () => {
      const bytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47]); // PNG magic bytes
      const file = new File([bytes], "image.png", { type: "image/png" });
      const filename = await saveFile("posts", "rec123", file);

      const filePath = getFilePath("posts", "rec123", filename);
      const savedBytes = new Uint8Array(await Bun.file(filePath).arrayBuffer());
      expect(savedBytes).toEqual(bytes);
    });
  });

  describe("deleteFile", () => {
    test("deletes existing file", async () => {
      const file = new File(["content"], "test.txt");
      const filename = await saveFile("posts", "rec123", file);

      expect(await fileExists("posts", "rec123", filename)).toBe(true);

      await deleteFile("posts", "rec123", filename);

      expect(await fileExists("posts", "rec123", filename)).toBe(false);
    });

    test("is idempotent (doesn't error on missing file)", async () => {
      await deleteFile("posts", "rec123", "nonexistent.txt"); // Should not throw
    });
  });

  describe("deleteRecordFiles", () => {
    test("deletes entire record directory", async () => {
      // Save multiple files
      const file1 = new File(["content1"], "file1.txt");
      const file2 = new File(["content2"], "file2.txt");
      await saveFile("posts", "rec123", file1);
      await saveFile("posts", "rec123", file2);

      // Verify files exist
      const filesBefore = await listRecordFiles("posts", "rec123");
      expect(filesBefore.length).toBe(2);

      // Delete all
      await deleteRecordFiles("posts", "rec123");

      // Verify directory is gone
      const filesAfter = await listRecordFiles("posts", "rec123");
      expect(filesAfter.length).toBe(0);
    });

    test("is idempotent (doesn't error on missing directory)", async () => {
      await deleteRecordFiles("posts", "nonexistent"); // Should not throw
    });
  });

  describe("listRecordFiles", () => {
    test("lists all files in record directory", async () => {
      const file1 = new File(["content1"], "a.txt");
      const file2 = new File(["content2"], "b.txt");
      const name1 = await saveFile("posts", "rec123", file1);
      const name2 = await saveFile("posts", "rec123", file2);

      const files = await listRecordFiles("posts", "rec123");
      expect(files).toContain(name1);
      expect(files).toContain(name2);
      expect(files.length).toBe(2);
    });

    test("returns empty array for non-existent directory", async () => {
      const files = await listRecordFiles("posts", "nonexistent");
      expect(files).toEqual([]);
    });
  });

  describe("fileExists", () => {
    test("returns true for existing file", async () => {
      const file = new File(["content"], "test.txt");
      const filename = await saveFile("posts", "rec123", file);

      expect(await fileExists("posts", "rec123", filename)).toBe(true);
    });

    test("returns false for non-existent file", async () => {
      expect(await fileExists("posts", "rec123", "nope.txt")).toBe(false);
    });
  });
});
