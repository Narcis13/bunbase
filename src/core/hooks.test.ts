import { test, expect, describe, beforeEach } from "bun:test";
import { HookManager } from "./hooks";
import type {
  BeforeCreateContext,
  AfterCreateContext,
  BeforeUpdateContext,
  AfterUpdateContext,
  BeforeDeleteContext,
  AfterDeleteContext,
} from "../types/hooks";

describe("HookManager", () => {
  let hooks: HookManager;

  beforeEach(() => {
    hooks = new HookManager();
  });

  describe("Registration", () => {
    test("can register handler for beforeCreate event", async () => {
      let called = false;
      hooks.on("beforeCreate", async (ctx, next) => {
        called = true;
        await next();
      });

      await hooks.trigger("beforeCreate", {
        collection: "users",
        data: { name: "test" },
      });

      expect(called).toBe(true);
    });

    test("can register handler for afterCreate event", async () => {
      let called = false;
      hooks.on("afterCreate", async (ctx, next) => {
        called = true;
        await next();
      });

      await hooks.trigger("afterCreate", {
        collection: "users",
        record: { id: "1", name: "test" },
      });

      expect(called).toBe(true);
    });

    test("can register handler for beforeUpdate event", async () => {
      let called = false;
      hooks.on("beforeUpdate", async (ctx, next) => {
        called = true;
        await next();
      });

      await hooks.trigger("beforeUpdate", {
        collection: "users",
        id: "1",
        data: { name: "updated" },
        existing: { id: "1", name: "test" },
      });

      expect(called).toBe(true);
    });

    test("can register handler for afterUpdate event", async () => {
      let called = false;
      hooks.on("afterUpdate", async (ctx, next) => {
        called = true;
        await next();
      });

      await hooks.trigger("afterUpdate", {
        collection: "users",
        record: { id: "1", name: "updated" },
      });

      expect(called).toBe(true);
    });

    test("can register handler for beforeDelete event", async () => {
      let called = false;
      hooks.on("beforeDelete", async (ctx, next) => {
        called = true;
        await next();
      });

      await hooks.trigger("beforeDelete", {
        collection: "users",
        id: "1",
        existing: { id: "1", name: "test" },
      });

      expect(called).toBe(true);
    });

    test("can register handler for afterDelete event", async () => {
      let called = false;
      hooks.on("afterDelete", async (ctx, next) => {
        called = true;
        await next();
      });

      await hooks.trigger("afterDelete", {
        collection: "users",
        id: "1",
      });

      expect(called).toBe(true);
    });

    test("returns unsubscribe function that removes handler", async () => {
      let callCount = 0;
      const unsub = hooks.on("beforeCreate", async (ctx, next) => {
        callCount++;
        await next();
      });

      await hooks.trigger("beforeCreate", {
        collection: "users",
        data: {},
      });
      expect(callCount).toBe(1);

      unsub();

      await hooks.trigger("beforeCreate", {
        collection: "users",
        data: {},
      });
      expect(callCount).toBe(1); // Still 1, handler was removed
    });

    test("multiple handlers can be registered for same event", async () => {
      const order: number[] = [];

      hooks.on("beforeCreate", async (ctx, next) => {
        order.push(1);
        await next();
      });
      hooks.on("beforeCreate", async (ctx, next) => {
        order.push(2);
        await next();
      });
      hooks.on("beforeCreate", async (ctx, next) => {
        order.push(3);
        await next();
      });

      await hooks.trigger("beforeCreate", {
        collection: "users",
        data: {},
      });

      expect(order).toEqual([1, 2, 3]);
    });
  });

  describe("Execution Order", () => {
    test("handlers execute in registration order (FIFO)", async () => {
      const order: string[] = [];

      hooks.on("beforeCreate", async (ctx, next) => {
        order.push("first");
        await next();
      });
      hooks.on("beforeCreate", async (ctx, next) => {
        order.push("second");
        await next();
      });
      hooks.on("beforeCreate", async (ctx, next) => {
        order.push("third");
        await next();
      });

      await hooks.trigger("beforeCreate", {
        collection: "users",
        data: {},
      });

      expect(order).toEqual(["first", "second", "third"]);
    });

    test("global and collection handlers interleave by registration order", async () => {
      const order: string[] = [];

      hooks.on("beforeCreate", async (ctx, next) => {
        order.push("global-1");
        await next();
      });
      hooks.on("beforeCreate", "users", async (ctx, next) => {
        order.push("users-1");
        await next();
      });
      hooks.on("beforeCreate", async (ctx, next) => {
        order.push("global-2");
        await next();
      });
      hooks.on("beforeCreate", "users", async (ctx, next) => {
        order.push("users-2");
        await next();
      });

      await hooks.trigger("beforeCreate", {
        collection: "users",
        data: {},
      });

      expect(order).toEqual(["global-1", "users-1", "global-2", "users-2"]);
    });

    test("later registered handlers execute after earlier ones", async () => {
      const order: number[] = [];

      // Register in reverse order to confirm FIFO
      for (let i = 1; i <= 5; i++) {
        const num = i;
        hooks.on("afterCreate", async (ctx, next) => {
          order.push(num);
          await next();
        });
      }

      await hooks.trigger("afterCreate", {
        collection: "users",
        record: {},
      });

      expect(order).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe("Collection Scoping", () => {
    test("global handler runs for any collection", async () => {
      const collections: string[] = [];

      hooks.on("beforeCreate", async (ctx, next) => {
        collections.push(ctx.collection);
        await next();
      });

      await hooks.trigger("beforeCreate", { collection: "users", data: {} });
      await hooks.trigger("beforeCreate", { collection: "posts", data: {} });
      await hooks.trigger("beforeCreate", { collection: "comments", data: {} });

      expect(collections).toEqual(["users", "posts", "comments"]);
    });

    test("collection-specific handler only runs for matching collection", async () => {
      let usersCallCount = 0;
      let postsCallCount = 0;

      hooks.on("beforeCreate", "users", async (ctx, next) => {
        usersCallCount++;
        await next();
      });
      hooks.on("beforeCreate", "posts", async (ctx, next) => {
        postsCallCount++;
        await next();
      });

      await hooks.trigger("beforeCreate", { collection: "users", data: {} });
      await hooks.trigger("beforeCreate", { collection: "users", data: {} });
      await hooks.trigger("beforeCreate", { collection: "posts", data: {} });

      expect(usersCallCount).toBe(2);
      expect(postsCallCount).toBe(1);
    });

    test("collection-specific handler skipped for non-matching collection", async () => {
      let called = false;

      hooks.on("beforeCreate", "users", async (ctx, next) => {
        called = true;
        await next();
      });

      await hooks.trigger("beforeCreate", { collection: "posts", data: {} });

      expect(called).toBe(false);
    });

    test("mix of global and collection handlers filters correctly", async () => {
      const executed: string[] = [];

      hooks.on("beforeCreate", async (ctx, next) => {
        executed.push("global");
        await next();
      });
      hooks.on("beforeCreate", "users", async (ctx, next) => {
        executed.push("users-only");
        await next();
      });
      hooks.on("beforeCreate", "posts", async (ctx, next) => {
        executed.push("posts-only");
        await next();
      });

      await hooks.trigger("beforeCreate", { collection: "users", data: {} });

      expect(executed).toEqual(["global", "users-only"]);
      expect(executed).not.toContain("posts-only");
    });
  });

  describe("Middleware Chain", () => {
    test("handler receives context and next function", async () => {
      let receivedContext: BeforeCreateContext | null = null;
      let receivedNext: (() => Promise<void>) | null = null;

      hooks.on("beforeCreate", async (ctx, next) => {
        receivedContext = ctx;
        receivedNext = next;
        await next();
      });

      const context: BeforeCreateContext = {
        collection: "users",
        data: { name: "test" },
      };

      await hooks.trigger("beforeCreate", context);

      expect(receivedContext).toBe(context);
      expect(typeof receivedNext).toBe("function");
    });

    test("calling next() continues to next handler", async () => {
      const order: number[] = [];

      hooks.on("beforeCreate", async (ctx, next) => {
        order.push(1);
        await next();
        order.push(4); // After next returns
      });
      hooks.on("beforeCreate", async (ctx, next) => {
        order.push(2);
        await next();
        order.push(3); // After next returns
      });

      await hooks.trigger("beforeCreate", { collection: "users", data: {} });

      expect(order).toEqual([1, 2, 3, 4]);
    });

    test("NOT calling next() stops chain silently", async () => {
      const order: string[] = [];

      hooks.on("beforeCreate", async (ctx, next) => {
        order.push("first");
        // Intentionally not calling next()
      });
      hooks.on("beforeCreate", async (ctx, next) => {
        order.push("second");
        await next();
      });

      await hooks.trigger("beforeCreate", { collection: "users", data: {} });

      expect(order).toEqual(["first"]);
      expect(order).not.toContain("second");
    });

    test("throwing error stops chain with error", async () => {
      const order: string[] = [];

      hooks.on("beforeCreate", async (ctx, next) => {
        order.push("first");
        throw new Error("Validation failed");
      });
      hooks.on("beforeCreate", async (ctx, next) => {
        order.push("second");
        await next();
      });

      await expect(
        hooks.trigger("beforeCreate", { collection: "users", data: {} })
      ).rejects.toThrow("Validation failed");

      expect(order).toEqual(["first"]);
    });

    test("context modifications persist through chain", async () => {
      hooks.on("beforeCreate", async (ctx, next) => {
        ctx.data.addedByFirst = true;
        await next();
      });
      hooks.on("beforeCreate", async (ctx, next) => {
        ctx.data.addedBySecond = true;
        ctx.data.sawFirst = ctx.data.addedByFirst;
        await next();
      });

      const context: BeforeCreateContext = {
        collection: "users",
        data: { original: true },
      };

      await hooks.trigger("beforeCreate", context);

      expect(context.data).toEqual({
        original: true,
        addedByFirst: true,
        addedBySecond: true,
        sawFirst: true,
      });
    });
  });

  describe("Cancellation", () => {
    test("throwing in before hook propagates error", async () => {
      hooks.on("beforeCreate", async (ctx, next) => {
        throw new Error("Cannot create this record");
      });

      await expect(
        hooks.trigger("beforeCreate", { collection: "users", data: {} })
      ).rejects.toThrow("Cannot create this record");
    });

    test("not calling next() silently stops (no error thrown)", async () => {
      hooks.on("beforeDelete", async (ctx, next) => {
        // Silent cancellation - don't call next()
        if (ctx.existing.protected) {
          return;
        }
        await next();
      });

      // Should complete without error even though next() wasn't called
      await expect(
        hooks.trigger("beforeDelete", {
          collection: "users",
          id: "1",
          existing: { protected: true },
        })
      ).resolves.toBeUndefined();
    });

    test("chain stops at first throw", async () => {
      const order: number[] = [];

      hooks.on("beforeUpdate", async (ctx, next) => {
        order.push(1);
        await next();
      });
      hooks.on("beforeUpdate", async (ctx, next) => {
        order.push(2);
        throw new Error("Stop here");
      });
      hooks.on("beforeUpdate", async (ctx, next) => {
        order.push(3);
        await next();
      });

      await expect(
        hooks.trigger("beforeUpdate", {
          collection: "users",
          id: "1",
          data: {},
          existing: {},
        })
      ).rejects.toThrow("Stop here");

      expect(order).toEqual([1, 2]);
    });

    test("after-throw handlers do not execute", async () => {
      let afterThrowCalled = false;

      hooks.on("beforeCreate", async (ctx, next) => {
        throw new Error("Early exit");
      });
      hooks.on("beforeCreate", async (ctx, next) => {
        afterThrowCalled = true;
        await next();
      });

      try {
        await hooks.trigger("beforeCreate", { collection: "users", data: {} });
      } catch {
        // Expected
      }

      expect(afterThrowCalled).toBe(false);
    });
  });

  describe("Context Types", () => {
    test("BeforeCreate context has collection and data", async () => {
      let receivedCtx: BeforeCreateContext | null = null;

      hooks.on("beforeCreate", async (ctx, next) => {
        receivedCtx = ctx;
        await next();
      });

      await hooks.trigger("beforeCreate", {
        collection: "users",
        data: { name: "John", email: "john@example.com" },
      });

      expect(receivedCtx!.collection).toBe("users");
      expect(receivedCtx!.data).toEqual({ name: "John", email: "john@example.com" });
    });

    test("AfterCreate context has collection and record", async () => {
      let receivedCtx: AfterCreateContext | null = null;

      hooks.on("afterCreate", async (ctx, next) => {
        receivedCtx = ctx;
        await next();
      });

      await hooks.trigger("afterCreate", {
        collection: "users",
        record: { id: "abc123", name: "John", created_at: "2024-01-01" },
      });

      expect(receivedCtx!.collection).toBe("users");
      expect(receivedCtx!.record).toEqual({
        id: "abc123",
        name: "John",
        created_at: "2024-01-01",
      });
    });

    test("BeforeUpdate context has collection, id, data, existing", async () => {
      let receivedCtx: BeforeUpdateContext | null = null;

      hooks.on("beforeUpdate", async (ctx, next) => {
        receivedCtx = ctx;
        await next();
      });

      await hooks.trigger("beforeUpdate", {
        collection: "users",
        id: "abc123",
        data: { name: "Jane" },
        existing: { id: "abc123", name: "John" },
      });

      expect(receivedCtx!.collection).toBe("users");
      expect(receivedCtx!.id).toBe("abc123");
      expect(receivedCtx!.data).toEqual({ name: "Jane" });
      expect(receivedCtx!.existing).toEqual({ id: "abc123", name: "John" });
    });

    test("AfterUpdate context has collection and record", async () => {
      let receivedCtx: AfterUpdateContext | null = null;

      hooks.on("afterUpdate", async (ctx, next) => {
        receivedCtx = ctx;
        await next();
      });

      await hooks.trigger("afterUpdate", {
        collection: "users",
        record: { id: "abc123", name: "Jane", updated_at: "2024-01-02" },
      });

      expect(receivedCtx!.collection).toBe("users");
      expect(receivedCtx!.record).toEqual({
        id: "abc123",
        name: "Jane",
        updated_at: "2024-01-02",
      });
    });

    test("BeforeDelete context has collection, id, existing", async () => {
      let receivedCtx: BeforeDeleteContext | null = null;

      hooks.on("beforeDelete", async (ctx, next) => {
        receivedCtx = ctx;
        await next();
      });

      await hooks.trigger("beforeDelete", {
        collection: "users",
        id: "abc123",
        existing: { id: "abc123", name: "John" },
      });

      expect(receivedCtx!.collection).toBe("users");
      expect(receivedCtx!.id).toBe("abc123");
      expect(receivedCtx!.existing).toEqual({ id: "abc123", name: "John" });
    });

    test("AfterDelete context has collection and id", async () => {
      let receivedCtx: AfterDeleteContext | null = null;

      hooks.on("afterDelete", async (ctx, next) => {
        receivedCtx = ctx;
        await next();
      });

      await hooks.trigger("afterDelete", {
        collection: "users",
        id: "abc123",
      });

      expect(receivedCtx!.collection).toBe("users");
      expect(receivedCtx!.id).toBe("abc123");
    });

    test("request context is optional and passes through", async () => {
      let receivedRequest: BeforeCreateContext["request"] | undefined;

      hooks.on("beforeCreate", async (ctx, next) => {
        receivedRequest = ctx.request;
        await next();
      });

      const headers = new Headers({ "Content-Type": "application/json" });

      await hooks.trigger("beforeCreate", {
        collection: "users",
        data: {},
        request: {
          method: "POST",
          path: "/api/collections/users/records",
          headers,
        },
      });

      expect(receivedRequest).toEqual({
        method: "POST",
        path: "/api/collections/users/records",
        headers,
      });
    });
  });

  describe("Edge Cases", () => {
    test("trigger with no handlers completes successfully", async () => {
      await expect(
        hooks.trigger("beforeCreate", { collection: "users", data: {} })
      ).resolves.toBeUndefined();
    });

    test("trigger with no matching collection handlers completes", async () => {
      hooks.on("beforeCreate", "posts", async (ctx, next) => {
        await next();
      });

      await expect(
        hooks.trigger("beforeCreate", { collection: "users", data: {} })
      ).resolves.toBeUndefined();
    });

    test("unsubscribing non-existent handler is safe", () => {
      const unsub = hooks.on("beforeCreate", async (ctx, next) => {
        await next();
      });

      unsub();
      unsub(); // Double unsubscribe should be safe
      unsub(); // Triple unsubscribe should also be safe
    });

    test("async handlers work correctly", async () => {
      const order: number[] = [];

      hooks.on("beforeCreate", async (ctx, next) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        order.push(1);
        await next();
      });
      hooks.on("beforeCreate", async (ctx, next) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        order.push(2);
        await next();
      });

      await hooks.trigger("beforeCreate", { collection: "users", data: {} });

      expect(order).toEqual([1, 2]);
    });

    test("sync handlers work correctly", async () => {
      const order: number[] = [];

      hooks.on("beforeCreate", (ctx, next) => {
        order.push(1);
        return next();
      });
      hooks.on("beforeCreate", (ctx, next) => {
        order.push(2);
        return next();
      });

      await hooks.trigger("beforeCreate", { collection: "users", data: {} });

      expect(order).toEqual([1, 2]);
    });
  });
});
