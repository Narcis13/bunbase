import { test, expect, describe } from "bun:test";
import {
  validateFile,
  validateFieldFiles,
  formatBytes,
  formatFileErrors,
  type FileValidationError,
} from "./validation";

describe("formatBytes", () => {
  test("formats bytes", () => {
    expect(formatBytes(500)).toBe("500 B");
  });

  test("formats kilobytes", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  test("formats megabytes", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(10 * 1024 * 1024)).toBe("10.0 MB");
    expect(formatBytes(10.5 * 1024 * 1024)).toBe("10.5 MB");
  });
});

describe("validateFile", () => {
  describe("size validation", () => {
    test("accepts files under size limit", () => {
      const file = new File(["x".repeat(1000)], "test.txt");
      const error = validateFile("doc", file, { maxSize: 5000 });
      expect(error).toBeNull();
    });

    test("accepts files at exact size limit", () => {
      const file = new File(["x".repeat(1000)], "test.txt");
      const error = validateFile("doc", file, { maxSize: 1000 });
      expect(error).toBeNull();
    });

    test("rejects files over size limit", () => {
      const file = new File(["x".repeat(2000)], "big.txt");
      const error = validateFile("doc", file, { maxSize: 1000 });
      expect(error).not.toBeNull();
      expect(error!.field).toBe("doc");
      expect(error!.file).toBe("big.txt");
      expect(error!.message).toContain("exceeds maximum size");
      expect(error!.message).toContain("1000 B");
    });

    test("uses default 10MB limit when not specified", () => {
      // File just under 10MB should pass
      const content = "x".repeat(9 * 1024 * 1024);
      const file = new File([content], "large.bin");
      const error = validateFile("doc", file, {});
      expect(error).toBeNull();
    });

    test("rejects files over default 10MB limit", () => {
      const content = "x".repeat(11 * 1024 * 1024);
      const file = new File([content], "huge.bin");
      const error = validateFile("doc", file, {});
      expect(error).not.toBeNull();
      expect(error!.message).toContain("10.0 MB");
    });
  });

  describe("MIME type validation", () => {
    test("accepts any type when allowedTypes not specified", () => {
      const file = new File(["data"], "test.exe", { type: "application/octet-stream" });
      const error = validateFile("doc", file, {});
      expect(error).toBeNull();
    });

    test("accepts any type when allowedTypes is empty", () => {
      const file = new File(["data"], "test.exe", { type: "application/octet-stream" });
      const error = validateFile("doc", file, { allowedTypes: [] });
      expect(error).toBeNull();
    });

    test("accepts matching exact MIME type", () => {
      const file = new File(["data"], "photo.jpg", { type: "image/jpeg" });
      const error = validateFile("avatar", file, { allowedTypes: ["image/jpeg", "image/png"] });
      expect(error).toBeNull();
    });

    test("accepts matching wildcard MIME type", () => {
      const jpegFile = new File(["data"], "photo.jpg", { type: "image/jpeg" });
      const pngFile = new File(["data"], "photo.png", { type: "image/png" });
      const gifFile = new File(["data"], "animation.gif", { type: "image/gif" });

      const options = { allowedTypes: ["image/*"] };

      expect(validateFile("pic", jpegFile, options)).toBeNull();
      expect(validateFile("pic", pngFile, options)).toBeNull();
      expect(validateFile("pic", gifFile, options)).toBeNull();
    });

    test("rejects non-matching MIME type", () => {
      // Use a MIME type Bun won't normalize (application/pdf is stable)
      const file = new File(["data"], "doc.pdf", { type: "application/pdf" });
      const error = validateFile("avatar", file, { allowedTypes: ["image/jpeg", "image/png"] });

      expect(error).not.toBeNull();
      expect(error!.message).toContain("application/pdf");
      expect(error!.message).toContain("not allowed");
      expect(error!.message).toContain("image/jpeg, image/png");
    });

    test("rejects non-matching wildcard MIME type", () => {
      const file = new File(["data"], "doc.pdf", { type: "application/pdf" });
      const error = validateFile("photo", file, { allowedTypes: ["image/*"] });

      expect(error).not.toBeNull();
      expect(error!.message).toContain("application/pdf");
    });

    test("handles missing file type gracefully", () => {
      const file = new File(["data"], "unknown");
      // file.type defaults to "" for unknown types
      const error = validateFile("doc", file, { allowedTypes: ["text/plain"] });

      expect(error).not.toBeNull();
      expect(error!.message).toContain("not allowed");
    });
  });
});

describe("validateFieldFiles", () => {
  test("accepts valid files within count limit", () => {
    const files = [
      new File(["data"], "file1.txt"),
      new File(["data"], "file2.txt"),
    ];
    const errors = validateFieldFiles("docs", files, { maxFiles: 5 });
    expect(errors).toEqual([]);
  });

  test("accepts files at exact count limit", () => {
    const files = [
      new File(["data"], "file1.txt"),
      new File(["data"], "file2.txt"),
    ];
    const errors = validateFieldFiles("docs", files, { maxFiles: 2 });
    expect(errors).toEqual([]);
  });

  test("rejects files exceeding count limit", () => {
    const files = [
      new File(["data"], "file1.txt"),
      new File(["data"], "file2.txt"),
      new File(["data"], "file3.txt"),
    ];
    const errors = validateFieldFiles("docs", files, { maxFiles: 2 });

    expect(errors.length).toBe(1);
    expect(errors[0].field).toBe("docs");
    expect(errors[0].message).toContain("maximum 2 file(s)");
    expect(errors[0].message).toContain("received 3");
  });

  test("uses default maxFiles of 1", () => {
    const files = [
      new File(["data"], "file1.txt"),
      new File(["data"], "file2.txt"),
    ];
    const errors = validateFieldFiles("avatar", files, {});

    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain("maximum 1 file(s)");
  });

  test("returns multiple errors for multiple issues", () => {
    const files = [
      new File(["x".repeat(2000)], "big1.txt"),  // Too big
      new File(["x".repeat(2000)], "big2.txt"),  // Too big
      new File(["x".repeat(2000)], "big3.txt"),  // Too big (and over count)
    ];
    const errors = validateFieldFiles("docs", files, {
      maxFiles: 2,
      maxSize: 1000,
    });

    // Should have 1 count error + 3 size errors = 4 total
    expect(errors.length).toBe(4);
  });

  test("validates both count and MIME type", () => {
    const files = [
      new File(["data"], "photo.jpg", { type: "image/jpeg" }),
      new File(["data"], "doc.pdf", { type: "application/pdf" }),
    ];
    const errors = validateFieldFiles("images", files, {
      maxFiles: 5,
      allowedTypes: ["image/*"],
    });

    // Should reject the PDF file
    expect(errors.length).toBe(1);
    expect(errors[0].file).toBe("doc.pdf");
  });

  test("handles empty files array", () => {
    const errors = validateFieldFiles("docs", [], { maxFiles: 1 });
    expect(errors).toEqual([]);
  });
});

describe("formatFileErrors", () => {
  test("formats single error", () => {
    const errors: FileValidationError[] = [
      { field: "doc", file: "big.txt", message: "File too large" },
    ];
    expect(formatFileErrors(errors)).toBe("File too large");
  });

  test("formats multiple errors with semicolon separator", () => {
    const errors: FileValidationError[] = [
      { field: "doc", file: "", message: "Too many files" },
      { field: "doc", file: "a.txt", message: "File too large" },
    ];
    expect(formatFileErrors(errors)).toBe("Too many files; File too large");
  });

  test("handles empty errors array", () => {
    expect(formatFileErrors([])).toBe("");
  });
});
