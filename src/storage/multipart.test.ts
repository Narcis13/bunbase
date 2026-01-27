import { test, expect, describe } from "bun:test";
import { isMultipartRequest, parseMultipartRequest } from "./multipart";

describe("isMultipartRequest", () => {
  test("returns true for multipart/form-data content type", () => {
    const req = new Request("http://localhost/", {
      method: "POST",
      headers: { "Content-Type": "multipart/form-data; boundary=----WebKitFormBoundary" },
    });
    expect(isMultipartRequest(req)).toBe(true);
  });

  test("returns false for application/json content type", () => {
    const req = new Request("http://localhost/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(isMultipartRequest(req)).toBe(false);
  });

  test("returns false for missing content type", () => {
    const req = new Request("http://localhost/", { method: "POST" });
    expect(isMultipartRequest(req)).toBe(false);
  });
});

describe("parseMultipartRequest", () => {
  test("parses string fields from form data", async () => {
    const formData = new FormData();
    formData.append("title", "My Post");
    formData.append("description", "A description");

    const req = new Request("http://localhost/", {
      method: "POST",
      body: formData,
    });

    const result = await parseMultipartRequest(req);

    expect(result.data.title).toBe("My Post");
    expect(result.data.description).toBe("A description");
    expect(result.files.size).toBe(0);
  });

  test("parses JSON fields from form data", async () => {
    const formData = new FormData();
    formData.append("count", "42");
    formData.append("enabled", "true");
    formData.append("tags", JSON.stringify(["a", "b"]));

    const req = new Request("http://localhost/", {
      method: "POST",
      body: formData,
    });

    const result = await parseMultipartRequest(req);

    expect(result.data.count).toBe(42);
    expect(result.data.enabled).toBe(true);
    expect(result.data.tags).toEqual(["a", "b"]);
  });

  test("separates files from data fields", async () => {
    const formData = new FormData();
    formData.append("title", "My Post");
    formData.append("image", new File(["content"], "photo.jpg", { type: "image/jpeg" }));

    const req = new Request("http://localhost/", {
      method: "POST",
      body: formData,
    });

    const result = await parseMultipartRequest(req);

    expect(result.data.title).toBe("My Post");
    expect(result.files.size).toBe(1);
    expect(result.files.has("image")).toBe(true);
    expect(result.files.get("image")![0].name).toBe("photo.jpg");
  });

  test("skips empty file inputs (size=0, no name)", async () => {
    const formData = new FormData();
    formData.append("title", "Test");
    // Simulate browser empty file input
    formData.append("image", new File([], "", { type: "application/octet-stream" }));

    const req = new Request("http://localhost/", {
      method: "POST",
      body: formData,
    });

    const result = await parseMultipartRequest(req);

    expect(result.data.title).toBe("Test");
    expect(result.files.size).toBe(0);
  });

  test("accumulates multiple files per field", async () => {
    const formData = new FormData();
    formData.append("images", new File(["a"], "a.jpg", { type: "image/jpeg" }));
    formData.append("images", new File(["b"], "b.jpg", { type: "image/jpeg" }));
    formData.append("images", new File(["c"], "c.jpg", { type: "image/jpeg" }));

    const req = new Request("http://localhost/", {
      method: "POST",
      body: formData,
    });

    const result = await parseMultipartRequest(req);

    expect(result.files.size).toBe(1);
    expect(result.files.get("images")!.length).toBe(3);
    expect(result.files.get("images")![0].name).toBe("a.jpg");
    expect(result.files.get("images")![1].name).toBe("b.jpg");
    expect(result.files.get("images")![2].name).toBe("c.jpg");
  });

  test("handles File objects with content correctly", async () => {
    const content = "Hello, World!";
    const formData = new FormData();
    formData.append("doc", new File([content], "hello.txt", { type: "text/plain" }));

    const req = new Request("http://localhost/", {
      method: "POST",
      body: formData,
    });

    const result = await parseMultipartRequest(req);
    const file = result.files.get("doc")![0];

    expect(file.name).toBe("hello.txt");
    expect(file.size).toBe(content.length);
    expect(file.type.startsWith("text/plain")).toBe(true);
    expect(await file.text()).toBe(content);
  });

  test("keeps non-JSON strings as strings", async () => {
    const formData = new FormData();
    formData.append("name", "John Doe");
    formData.append("note", "This is not {valid json}");

    const req = new Request("http://localhost/", {
      method: "POST",
      body: formData,
    });

    const result = await parseMultipartRequest(req);

    expect(result.data.name).toBe("John Doe");
    expect(result.data.note).toBe("This is not {valid json}");
  });

  test("handles empty form data", async () => {
    const formData = new FormData();

    const req = new Request("http://localhost/", {
      method: "POST",
      body: formData,
    });

    const result = await parseMultipartRequest(req);

    expect(Object.keys(result.data).length).toBe(0);
    expect(result.files.size).toBe(0);
  });
});
