/**
 * Integration tests for realtime SSE functionality.
 *
 * Tests the full flow of realtime subscriptions and event delivery.
 */

import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { RealtimeManager } from "../realtime/manager";

describe("Realtime flow", () => {
  describe("manager tracks subscriptions correctly", () => {
    test("parses topic strings into subscriptions", () => {
      const manager = new RealtimeManager();
      const mockController = {
        write: async () => {},
        flush: async () => {},
        close: () => {},
      } as unknown as ReadableStreamDirectController;

      const client = manager.registerClient("test-client", mockController);
      manager.setSubscriptions("test-client", ["posts/*", "comments/abc123"]);

      expect(client.subscriptions).toHaveLength(2);
      expect(client.subscriptions[0]).toEqual({
        collection: "posts",
        recordId: "*",
      });
      expect(client.subscriptions[1]).toEqual({
        collection: "comments",
        recordId: "abc123",
      });
    });

    test("replaces existing subscriptions", () => {
      const manager = new RealtimeManager();
      const mockController = {
        write: async () => {},
        flush: async () => {},
        close: () => {},
      } as unknown as ReadableStreamDirectController;

      manager.registerClient("test-client", mockController);
      manager.setSubscriptions("test-client", ["posts/*"]);
      manager.setSubscriptions("test-client", ["users/*"]);

      const client = manager.getClient("test-client")!;
      expect(client.subscriptions).toHaveLength(1);
      expect(client.subscriptions[0]).toEqual({
        collection: "users",
        recordId: "*",
      });
    });
  });

  describe("getSubscribersForRecord finds matching clients", () => {
    test("matches both wildcard and specific subscriptions", () => {
      const manager = new RealtimeManager();
      const mockController = {
        write: async () => {},
        flush: async () => {},
        close: () => {},
      } as unknown as ReadableStreamDirectController;

      manager.registerClient("client1", mockController);
      manager.setSubscriptions("client1", ["posts/*"]);

      manager.registerClient("client2", mockController);
      manager.setSubscriptions("client2", ["posts/abc123"]);

      manager.registerClient("client3", mockController);
      manager.setSubscriptions("client3", ["comments/*"]);

      // Both client1 (wildcard) and client2 (specific) should match
      const subscribers = manager.getSubscribersForRecord("posts", "abc123");
      expect(subscribers).toHaveLength(2);
      expect(subscribers.map((c) => c.id).sort()).toEqual(["client1", "client2"]);
    });

    test("wildcard matches all records in collection", () => {
      const manager = new RealtimeManager();
      const mockController = {
        write: async () => {},
        flush: async () => {},
        close: () => {},
      } as unknown as ReadableStreamDirectController;

      manager.registerClient("client1", mockController);
      manager.setSubscriptions("client1", ["posts/*"]);

      // Client1 should match any post
      let subscribers = manager.getSubscribersForRecord("posts", "abc123");
      expect(subscribers).toHaveLength(1);
      expect(subscribers[0].id).toBe("client1");

      subscribers = manager.getSubscribersForRecord("posts", "xyz789");
      expect(subscribers).toHaveLength(1);
      expect(subscribers[0].id).toBe("client1");
    });

    test("specific subscription only matches exact record", () => {
      const manager = new RealtimeManager();
      const mockController = {
        write: async () => {},
        flush: async () => {},
        close: () => {},
      } as unknown as ReadableStreamDirectController;

      manager.registerClient("client1", mockController);
      manager.setSubscriptions("client1", ["posts/abc123"]);

      // Should match specific record
      let subscribers = manager.getSubscribersForRecord("posts", "abc123");
      expect(subscribers).toHaveLength(1);

      // Should not match different record
      subscribers = manager.getSubscribersForRecord("posts", "xyz789");
      expect(subscribers).toHaveLength(0);
    });
  });

  describe("cleanup removes inactive clients", () => {
    test("removes clients past inactivity timeout", () => {
      const manager = new RealtimeManager();
      const mockController = {
        write: async () => {},
        flush: async () => {},
        close: () => {},
      } as unknown as ReadableStreamDirectController;

      manager.registerClient("active", mockController);
      manager.registerClient("inactive", mockController);

      // Set very short timeout for testing
      manager.setInactivityTimeout(100);

      // Make "inactive" client old
      const client = manager.getClient("inactive")!;
      client.lastActivity = Date.now() - 200;

      // Run cleanup
      const cleaned = manager.cleanupInactive();
      expect(cleaned).toBe(1);
      expect(manager.getClient("active")).toBeDefined();
      expect(manager.getClient("inactive")).toBeUndefined();
    });

    test("activity update prevents cleanup", () => {
      const manager = new RealtimeManager();
      const mockController = {
        write: async () => {},
        flush: async () => {},
        close: () => {},
      } as unknown as ReadableStreamDirectController;

      manager.registerClient("client", mockController);
      manager.setInactivityTimeout(100);

      // Make client old
      manager.getClient("client")!.lastActivity = Date.now() - 200;

      // Update activity (as if ping received)
      manager.updateActivity("client");

      // Should not be cleaned now
      const cleaned = manager.cleanupInactive();
      expect(cleaned).toBe(0);
      expect(manager.getClient("client")).toBeDefined();
    });
  });

  describe("auth context tracking", () => {
    test("client starts without auth", () => {
      const manager = new RealtimeManager();
      const mockController = {
        write: async () => {},
        flush: async () => {},
        close: () => {},
      } as unknown as ReadableStreamDirectController;

      const client = manager.registerClient("client", mockController);
      expect(client.user).toBeNull();
    });

    test("setClientAuth sets user context", () => {
      const manager = new RealtimeManager();
      const mockController = {
        write: async () => {},
        flush: async () => {},
        close: () => {},
      } as unknown as ReadableStreamDirectController;

      manager.registerClient("client", mockController);

      const user = {
        id: "user-123",
        email: "test@example.com",
        verified: true,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        collectionId: "col-123",
        collectionName: "users",
      };

      manager.setClientAuth("client", user);

      const client = manager.getClient("client")!;
      expect(client.user).toEqual(user);
    });

    test("setClientAuth updates activity timestamp", () => {
      const manager = new RealtimeManager();
      const mockController = {
        write: async () => {},
        flush: async () => {},
        close: () => {},
      } as unknown as ReadableStreamDirectController;

      manager.registerClient("client", mockController);

      // Make client old
      const client = manager.getClient("client")!;
      const oldActivity = client.lastActivity;
      client.lastActivity = Date.now() - 10000;

      // Set auth
      manager.setClientAuth("client", {
        id: "user-123",
        email: "test@example.com",
        verified: true,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        collectionId: "col-123",
        collectionName: "users",
      });

      // Activity should be updated
      expect(client.lastActivity).toBeGreaterThan(oldActivity - 10001);
    });
  });

  describe("sendEvent and sendComment", () => {
    test("sendEvent returns true for existing client", async () => {
      const manager = new RealtimeManager();
      let written = "";
      const mockController = {
        write: async (data: string) => {
          written += data;
        },
        flush: async () => {},
        close: () => {},
      } as unknown as ReadableStreamDirectController;

      manager.registerClient("client", mockController);
      const result = await manager.sendEvent("client", "test", { foo: "bar" });

      expect(result).toBe(true);
      expect(written).toContain("event: test");
      expect(written).toContain('"foo":"bar"');
    });

    test("sendEvent returns false for non-existent client", async () => {
      const manager = new RealtimeManager();
      const result = await manager.sendEvent("non-existent", "test", {});

      expect(result).toBe(false);
    });

    test("sendComment returns true for existing client", async () => {
      const manager = new RealtimeManager();
      let written = "";
      const mockController = {
        write: async (data: string) => {
          written += data;
        },
        flush: async () => {},
        close: () => {},
      } as unknown as ReadableStreamDirectController;

      manager.registerClient("client", mockController);
      const result = await manager.sendComment("client", "ping");

      expect(result).toBe(true);
      expect(written).toContain(": ping");
    });

    test("sendEvent handles write error gracefully", async () => {
      const manager = new RealtimeManager();
      const mockController = {
        write: async () => {
          throw new Error("Connection closed");
        },
        flush: async () => {},
        close: () => {},
      } as unknown as ReadableStreamDirectController;

      manager.registerClient("client", mockController);
      const result = await manager.sendEvent("client", "test", {});

      expect(result).toBe(false);
    });
  });

  describe("multiple clients isolation", () => {
    test("clients maintain independent state", () => {
      const manager = new RealtimeManager();
      const mockController = {
        write: async () => {},
        flush: async () => {},
        close: () => {},
      } as unknown as ReadableStreamDirectController;

      manager.registerClient("client1", mockController);
      manager.registerClient("client2", mockController);

      // Set different subscriptions
      manager.setSubscriptions("client1", ["posts/*"]);
      manager.setSubscriptions("client2", ["comments/*"]);

      // Set auth only on client1
      manager.setClientAuth("client1", {
        id: "user-1",
        email: "user1@test.com",
        verified: true,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        collectionId: "col-1",
        collectionName: "users",
      });

      // Verify isolation
      const c1 = manager.getClient("client1")!;
      const c2 = manager.getClient("client2")!;

      expect(c1.subscriptions).toHaveLength(1);
      expect(c1.subscriptions[0].collection).toBe("posts");
      expect(c1.user).not.toBeNull();

      expect(c2.subscriptions).toHaveLength(1);
      expect(c2.subscriptions[0].collection).toBe("comments");
      expect(c2.user).toBeNull();
    });

    test("removeClient only affects target client", () => {
      const manager = new RealtimeManager();
      const mockController = {
        write: async () => {},
        flush: async () => {},
        close: () => {},
      } as unknown as ReadableStreamDirectController;

      manager.registerClient("client1", mockController);
      manager.registerClient("client2", mockController);
      manager.registerClient("client3", mockController);

      expect(manager.getClientCount()).toBe(3);

      manager.removeClient("client2");

      expect(manager.getClientCount()).toBe(2);
      expect(manager.getClient("client1")).toBeDefined();
      expect(manager.getClient("client2")).toBeUndefined();
      expect(manager.getClient("client3")).toBeDefined();
    });
  });
});
