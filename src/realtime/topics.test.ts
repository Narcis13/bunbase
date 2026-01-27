import { describe, test, expect } from "bun:test";
import { parseTopic, matchesSubscription, formatTopic } from "./topics";

describe("parseTopic", () => {
  describe("valid topics", () => {
    test("parses wildcard topic", () => {
      const result = parseTopic("posts/*");
      expect(result).toEqual({ collection: "posts", recordId: "*" });
    });

    test("parses specific record topic", () => {
      const result = parseTopic("posts/abc123");
      expect(result).toEqual({ collection: "posts", recordId: "abc123" });
    });

    test("parses collection with underscore", () => {
      const result = parseTopic("my_collection/xyz");
      expect(result).toEqual({ collection: "my_collection", recordId: "xyz" });
    });

    test("parses collection starting with uppercase", () => {
      const result = parseTopic("Posts/abc");
      expect(result).toEqual({ collection: "Posts", recordId: "abc" });
    });

    test("parses collection with numbers after first char", () => {
      const result = parseTopic("posts2024/abc");
      expect(result).toEqual({ collection: "posts2024", recordId: "abc" });
    });

    test("parses alphanumeric recordId", () => {
      const result = parseTopic("posts/ABC123xyz");
      expect(result).toEqual({ collection: "posts", recordId: "ABC123xyz" });
    });
  });

  describe("invalid topics", () => {
    test("returns null for empty string", () => {
      expect(parseTopic("")).toBeNull();
    });

    test("returns null for topic without slash", () => {
      expect(parseTopic("posts")).toBeNull();
    });

    test("returns null for topic starting with slash", () => {
      expect(parseTopic("/posts")).toBeNull();
    });

    test("returns null for collection starting with number", () => {
      expect(parseTopic("123collection/*")).toBeNull();
    });

    test("returns null for topic without recordId", () => {
      expect(parseTopic("posts/")).toBeNull();
    });

    test("returns null for topic with too many slashes", () => {
      expect(parseTopic("posts/abc/123")).toBeNull();
    });

    test("returns null for collection with hyphen", () => {
      expect(parseTopic("my-collection/*")).toBeNull();
    });

    test("returns null for collection starting with underscore", () => {
      expect(parseTopic("_collection/*")).toBeNull();
    });

    test("returns null for recordId with special characters", () => {
      expect(parseTopic("posts/abc-123")).toBeNull();
    });

    test("returns null for recordId with underscore", () => {
      expect(parseTopic("posts/abc_123")).toBeNull();
    });

    test("returns null for whitespace in topic", () => {
      expect(parseTopic("posts/ abc")).toBeNull();
      expect(parseTopic(" posts/abc")).toBeNull();
    });
  });
});

describe("matchesSubscription", () => {
  describe("wildcard subscriptions", () => {
    test("wildcard matches any record in collection", () => {
      const sub = { collection: "posts", recordId: "*" as const };
      expect(matchesSubscription(sub, "posts", "abc123")).toBe(true);
      expect(matchesSubscription(sub, "posts", "xyz789")).toBe(true);
      expect(matchesSubscription(sub, "posts", "any")).toBe(true);
    });

    test("wildcard does not match different collection", () => {
      const sub = { collection: "posts", recordId: "*" as const };
      expect(matchesSubscription(sub, "comments", "abc123")).toBe(false);
    });
  });

  describe("specific record subscriptions", () => {
    test("specific recordId matches only that record", () => {
      const sub = { collection: "posts", recordId: "abc123" };
      expect(matchesSubscription(sub, "posts", "abc123")).toBe(true);
    });

    test("specific recordId does not match different record", () => {
      const sub = { collection: "posts", recordId: "abc123" };
      expect(matchesSubscription(sub, "posts", "xyz789")).toBe(false);
    });

    test("specific recordId does not match different collection", () => {
      const sub = { collection: "posts", recordId: "abc123" };
      expect(matchesSubscription(sub, "comments", "abc123")).toBe(false);
    });
  });

  describe("collection matching", () => {
    test("collection matching is case-sensitive", () => {
      const sub = { collection: "Posts", recordId: "*" as const };
      expect(matchesSubscription(sub, "posts", "abc")).toBe(false);
      expect(matchesSubscription(sub, "Posts", "abc")).toBe(true);
    });

    test("collection must match exactly", () => {
      const sub = { collection: "posts", recordId: "*" as const };
      expect(matchesSubscription(sub, "post", "abc")).toBe(false);
      expect(matchesSubscription(sub, "posts2", "abc")).toBe(false);
    });
  });
});

describe("formatTopic", () => {
  test("formats wildcard topic", () => {
    expect(formatTopic("posts", "*")).toBe("posts/*");
  });

  test("formats specific record topic", () => {
    expect(formatTopic("posts", "abc123")).toBe("posts/abc123");
  });

  test("formats collection with underscore", () => {
    expect(formatTopic("my_collection", "xyz")).toBe("my_collection/xyz");
  });

  test("roundtrip with parseTopic", () => {
    const original = { collection: "posts", recordId: "abc123" };
    const formatted = formatTopic(original.collection, original.recordId);
    const parsed = parseTopic(formatted);
    expect(parsed).toEqual(original);
  });

  test("roundtrip with wildcard", () => {
    const original = { collection: "posts", recordId: "*" as const };
    const formatted = formatTopic(original.collection, original.recordId);
    const parsed = parseTopic(formatted);
    expect(parsed).toEqual(original);
  });
});
