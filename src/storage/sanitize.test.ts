import { test, expect, describe } from "bun:test";
import { sanitizeFilename } from "./sanitize";

describe("sanitizeFilename", () => {
  test("preserves extension in lowercase", () => {
    const result = sanitizeFilename("Photo.JPG");
    expect(result).toMatch(/^Photo_[a-zA-Z0-9_-]{10}\.jpg$/);
  });

  test("adds random suffix", () => {
    const result1 = sanitizeFilename("test.txt");
    const result2 = sanitizeFilename("test.txt");
    expect(result1).not.toBe(result2); // Random suffix makes them different
    expect(result1).toMatch(/_[a-zA-Z0-9_-]{10}\.txt$/);
  });

  test("removes path traversal attempts", () => {
    const result = sanitizeFilename("../../../etc/passwd");
    expect(result).not.toContain("..");
    expect(result).not.toContain("/");
    expect(result).toMatch(/^passwd_[a-zA-Z0-9_-]{10}$/);
  });

  test("removes dangerous characters", () => {
    const result = sanitizeFilename("my file<script>.pdf");
    expect(result).not.toContain("<");
    expect(result).not.toContain(">");
    expect(result).not.toContain(" ");
    expect(result).toMatch(/^my_file_script_[a-zA-Z0-9_-]{10}\.pdf$/);
  });

  test("handles files with multiple dots", () => {
    const result = sanitizeFilename("archive.tar.gz");
    expect(result).toMatch(/^archive_tar_[a-zA-Z0-9_-]{10}\.gz$/);
  });

  test("handles dotfiles (removes leading dot)", () => {
    const result = sanitizeFilename(".gitignore");
    // Leading dot is sanitized out, leaving "gitignore" as base
    expect(result).toMatch(/^gitignore_[a-zA-Z0-9_-]{10}$/);
  });

  test("handles files with only special chars", () => {
    const result = sanitizeFilename("...///...txt");
    expect(result).toMatch(/^file_[a-zA-Z0-9_-]{10}\.txt$/);
  });

  test("truncates very long filenames", () => {
    const longName = "a".repeat(200) + ".pdf";
    const result = sanitizeFilename(longName);
    // Base should be max 100 chars, plus _suffix(10) plus .pdf(4)
    expect(result.length).toBeLessThanOrEqual(100 + 1 + 10 + 4);
  });

  test("handles Windows path separators", () => {
    const result = sanitizeFilename("C:\\Users\\test\\file.doc");
    // Backslashes are normalized to forward slashes, so path.basename extracts "file"
    expect(result).not.toContain("\\");
    expect(result).toMatch(/^file_[a-zA-Z0-9_-]{10}\.doc$/);
  });

  test("preserves hyphens and underscores", () => {
    const result = sanitizeFilename("my-file_name.txt");
    expect(result).toMatch(/^my-file_name_[a-zA-Z0-9_-]{10}\.txt$/);
  });
});
