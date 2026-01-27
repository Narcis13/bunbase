import { test, expect, describe } from "bun:test";
import { formatSSEMessage, formatSSEComment, type SSEMessage } from "./sse";

describe("SSE Message Formatting", () => {
  describe("formatSSEMessage", () => {
    test("formats basic message with only data", () => {
      const message: SSEMessage = { data: { hello: "world" } };
      const result = formatSSEMessage(message);

      expect(result).toBe('data: {"hello":"world"}\n\n');
    });

    test("formats message with event name", () => {
      const message: SSEMessage = {
        event: "update",
        data: { id: 1, name: "test" },
      };
      const result = formatSSEMessage(message);

      expect(result).toBe('event: update\ndata: {"id":1,"name":"test"}\n\n');
    });

    test("formats message with id", () => {
      const message: SSEMessage = {
        id: "abc123",
        data: { value: 42 },
      };
      const result = formatSSEMessage(message);

      expect(result).toBe('id: abc123\ndata: {"value":42}\n\n');
    });

    test("formats message with retry", () => {
      const message: SSEMessage = {
        retry: 5000,
        data: { status: "connected" },
      };
      const result = formatSSEMessage(message);

      expect(result).toBe('retry: 5000\ndata: {"status":"connected"}\n\n');
    });

    test("formats message with all fields", () => {
      const message: SSEMessage = {
        event: "create",
        id: "evt_xyz789",
        retry: 3000,
        data: { type: "record", created: true },
      };
      const result = formatSSEMessage(message);

      expect(result).toBe(
        'event: create\nid: evt_xyz789\nretry: 3000\ndata: {"type":"record","created":true}\n\n'
      );
    });

    test("formats message with empty data object", () => {
      const message: SSEMessage = { data: {} };
      const result = formatSSEMessage(message);

      expect(result).toBe("data: {}\n\n");
    });

    test("formats message with array data", () => {
      const message: SSEMessage = { data: [1, 2, 3] };
      const result = formatSSEMessage(message);

      expect(result).toBe("data: [1,2,3]\n\n");
    });

    test("formats message with string data", () => {
      const message: SSEMessage = { data: "simple string" };
      const result = formatSSEMessage(message);

      expect(result).toBe('data: "simple string"\n\n');
    });

    test("formats message with null data", () => {
      const message: SSEMessage = { data: null };
      const result = formatSSEMessage(message);

      expect(result).toBe("data: null\n\n");
    });

    test("formats message with numeric data", () => {
      const message: SSEMessage = { data: 12345 };
      const result = formatSSEMessage(message);

      expect(result).toBe("data: 12345\n\n");
    });

    test("formats message with nested object data", () => {
      const message: SSEMessage = {
        event: "nested",
        data: {
          user: { id: "u1", profile: { name: "Test", age: 25 } },
          metadata: { timestamp: 1234567890 },
        },
      };
      const result = formatSSEMessage(message);

      expect(result).toBe(
        'event: nested\ndata: {"user":{"id":"u1","profile":{"name":"Test","age":25}},"metadata":{"timestamp":1234567890}}\n\n'
      );
    });

    test("message always ends with double newline", () => {
      const message: SSEMessage = { data: "test" };
      const result = formatSSEMessage(message);

      expect(result.endsWith("\n\n")).toBe(true);
    });

    test("fields are in correct order: event, id, retry, data", () => {
      const message: SSEMessage = {
        event: "test",
        id: "123",
        retry: 1000,
        data: "value",
      };
      const result = formatSSEMessage(message);
      const lines = result.split("\n");

      expect(lines[0]).toStartWith("event:");
      expect(lines[1]).toStartWith("id:");
      expect(lines[2]).toStartWith("retry:");
      expect(lines[3]).toStartWith("data:");
    });
  });

  describe("formatSSEComment", () => {
    test("formats keep-alive comment", () => {
      const result = formatSSEComment("keep-alive");

      expect(result).toBe(": keep-alive\n\n");
    });

    test("formats empty comment", () => {
      const result = formatSSEComment("");

      expect(result).toBe(": \n\n");
    });

    test("formats comment with special characters", () => {
      const result = formatSSEComment("ping @ 2024-01-01T12:00:00Z");

      expect(result).toBe(": ping @ 2024-01-01T12:00:00Z\n\n");
    });

    test("comment always ends with double newline", () => {
      const result = formatSSEComment("test");

      expect(result.endsWith("\n\n")).toBe(true);
    });

    test("comment starts with colon and space", () => {
      const result = formatSSEComment("my-comment");

      expect(result.startsWith(": ")).toBe(true);
    });
  });
});
