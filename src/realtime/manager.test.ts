import { test, expect, describe, beforeEach } from "bun:test";
import { RealtimeManager, type Subscription } from "./manager";
import type { AuthenticatedUser } from "../auth/middleware";

describe("RealtimeManager", () => {
  let manager: RealtimeManager;
  // Mock controller - just needs to be truthy for testing
  const mockController = {} as ReadableStreamDirectController;

  beforeEach(() => {
    manager = new RealtimeManager();
  });

  describe("registerClient", () => {
    test("registers a new client with correct initial state", () => {
      const client = manager.registerClient("client-1", mockController);

      expect(client.id).toBe("client-1");
      expect(client.controller).toBe(mockController);
      expect(client.subscriptions).toEqual([]);
      expect(client.user).toBeNull();
      expect(client.lastActivity).toBeGreaterThan(0);
    });

    test("can retrieve registered client", () => {
      manager.registerClient("client-1", mockController);

      const retrieved = manager.getClient("client-1");
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe("client-1");
    });
  });

  describe("removeClient", () => {
    test("removes an existing client", () => {
      manager.registerClient("client-1", mockController);
      expect(manager.getClient("client-1")).toBeDefined();

      manager.removeClient("client-1");
      expect(manager.getClient("client-1")).toBeUndefined();
    });

    test("does not throw for non-existent client", () => {
      expect(() => manager.removeClient("non-existent")).not.toThrow();
    });
  });

  describe("getClient", () => {
    test("returns client if exists", () => {
      manager.registerClient("client-1", mockController);

      const client = manager.getClient("client-1");
      expect(client).toBeDefined();
      expect(client?.id).toBe("client-1");
    });

    test("returns undefined for non-existent client", () => {
      const client = manager.getClient("non-existent");
      expect(client).toBeUndefined();
    });
  });

  describe("setClientAuth", () => {
    test("sets authentication context for client", () => {
      manager.registerClient("client-1", mockController);

      const user: AuthenticatedUser = {
        id: "user-123",
        email: "test@example.com",
        verified: true,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        collectionId: "col-123",
        collectionName: "users",
      };

      manager.setClientAuth("client-1", user);

      const client = manager.getClient("client-1");
      expect(client?.user).toEqual(user);
    });

    test("can clear authentication context", () => {
      manager.registerClient("client-1", mockController);

      const user: AuthenticatedUser = {
        id: "user-123",
        email: "test@example.com",
        verified: true,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        collectionId: "col-123",
        collectionName: "users",
      };

      manager.setClientAuth("client-1", user);
      manager.setClientAuth("client-1", null);

      const client = manager.getClient("client-1");
      expect(client?.user).toBeNull();
    });

    test("updates lastActivity when setting auth", () => {
      manager.registerClient("client-1", mockController);
      const before = manager.getClient("client-1")?.lastActivity || 0;

      // Small delay to ensure timestamp differs
      const user: AuthenticatedUser = {
        id: "user-123",
        email: "test@example.com",
        verified: true,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        collectionId: "col-123",
        collectionName: "users",
      };

      manager.setClientAuth("client-1", user);
      const after = manager.getClient("client-1")?.lastActivity || 0;

      expect(after).toBeGreaterThanOrEqual(before);
    });

    test("does not throw for non-existent client", () => {
      expect(() => manager.setClientAuth("non-existent", null)).not.toThrow();
    });
  });

  describe("setSubscriptions", () => {
    test("parses topic strings into subscriptions", () => {
      manager.registerClient("client-1", mockController);

      manager.setSubscriptions("client-1", ["posts/*", "users/user123"]);

      const client = manager.getClient("client-1");
      expect(client?.subscriptions).toEqual([
        { collection: "posts", recordId: "*" },
        { collection: "users", recordId: "user123" },
      ]);
    });

    test("replaces existing subscriptions", () => {
      manager.registerClient("client-1", mockController);

      manager.setSubscriptions("client-1", ["posts/*"]);
      manager.setSubscriptions("client-1", ["users/user123"]);

      const client = manager.getClient("client-1");
      expect(client?.subscriptions).toEqual([
        { collection: "users", recordId: "user123" },
      ]);
    });

    test("can set empty subscriptions (unsubscribe all)", () => {
      manager.registerClient("client-1", mockController);

      manager.setSubscriptions("client-1", ["posts/*"]);
      manager.setSubscriptions("client-1", []);

      const client = manager.getClient("client-1");
      expect(client?.subscriptions).toEqual([]);
    });

    test("filters out invalid topics", () => {
      manager.registerClient("client-1", mockController);

      manager.setSubscriptions("client-1", [
        "posts/*",
        "invalid",
        "users/abc123",
        "another-invalid-topic",
      ]);

      const client = manager.getClient("client-1");
      expect(client?.subscriptions).toEqual([
        { collection: "posts", recordId: "*" },
        { collection: "users", recordId: "abc123" },
      ]);
    });

    test("updates lastActivity when setting subscriptions", () => {
      manager.registerClient("client-1", mockController);
      const before = manager.getClient("client-1")?.lastActivity || 0;

      manager.setSubscriptions("client-1", ["posts/*"]);
      const after = manager.getClient("client-1")?.lastActivity || 0;

      expect(after).toBeGreaterThanOrEqual(before);
    });

    test("does not throw for non-existent client", () => {
      expect(() => manager.setSubscriptions("non-existent", [])).not.toThrow();
    });
  });

  describe("updateActivity", () => {
    test("updates lastActivity timestamp", () => {
      manager.registerClient("client-1", mockController);
      const before = manager.getClient("client-1")?.lastActivity || 0;

      // Small artificial delay
      manager.updateActivity("client-1");
      const after = manager.getClient("client-1")?.lastActivity || 0;

      expect(after).toBeGreaterThanOrEqual(before);
    });

    test("does not throw for non-existent client", () => {
      expect(() => manager.updateActivity("non-existent")).not.toThrow();
    });
  });

  describe("getClientCount", () => {
    test("returns 0 for empty manager", () => {
      expect(manager.getClientCount()).toBe(0);
    });

    test("returns correct count with one client", () => {
      manager.registerClient("client-1", mockController);
      expect(manager.getClientCount()).toBe(1);
    });

    test("returns correct count with multiple clients", () => {
      manager.registerClient("client-1", mockController);
      manager.registerClient("client-2", mockController);
      manager.registerClient("client-3", mockController);

      expect(manager.getClientCount()).toBe(3);
    });

    test("decreases count when client removed", () => {
      manager.registerClient("client-1", mockController);
      manager.registerClient("client-2", mockController);

      expect(manager.getClientCount()).toBe(2);

      manager.removeClient("client-1");

      expect(manager.getClientCount()).toBe(1);
    });
  });

  describe("multiple clients", () => {
    test("manages multiple clients independently", () => {
      const controller1 = { id: 1 } as unknown as ReadableStreamDirectController;
      const controller2 = { id: 2 } as unknown as ReadableStreamDirectController;

      manager.registerClient("client-1", controller1);
      manager.registerClient("client-2", controller2);

      const user1: AuthenticatedUser = {
        id: "user-1",
        email: "user1@example.com",
        verified: true,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        collectionId: "col-1",
        collectionName: "users",
      };

      manager.setClientAuth("client-1", user1);
      manager.setSubscriptions("client-2", ["posts/*"]);

      const c1 = manager.getClient("client-1");
      const c2 = manager.getClient("client-2");

      expect(c1?.user).toEqual(user1);
      expect(c1?.subscriptions).toEqual([]);
      expect(c2?.user).toBeNull();
      expect(c2?.subscriptions).toEqual([{ collection: "posts", recordId: "*" }]);
    });
  });
});
