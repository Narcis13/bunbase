/**
 * Tests for event broadcasting with permission filtering.
 */

import { describe, test, expect, beforeEach, mock, spyOn } from "bun:test";
import { broadcastRecordEvent, type RecordAction } from "./broadcast";
import type { RealtimeManager, RealtimeClient } from "./manager";
import type { Subscription } from "./topics";
import * as schema from "../core/schema";

// Mock the getCollection function
const mockGetCollection = spyOn(schema, "getCollection");

// Create a mock RealtimeManager
function createMockManager(clients: RealtimeClient[] = []) {
  const removedClients: string[] = [];
  const sentEvents: Array<{ clientId: string; event: string; data: unknown }> =
    [];

  return {
    getSubscribersForRecord: mock(
      (_collection: string, _recordId: string): RealtimeClient[] => {
        // Return clients that have matching subscriptions
        return clients.filter((client) =>
          client.subscriptions.some(
            (sub) =>
              sub.collection === _collection &&
              (sub.recordId === "*" || sub.recordId === _recordId)
          )
        );
      }
    ),
    sendEvent: mock(
      async (clientId: string, event: string, data: unknown): Promise<boolean> => {
        sentEvents.push({ clientId, event, data });
        return true;
      }
    ),
    removeClient: mock((clientId: string) => {
      removedClients.push(clientId);
    }),
    // Test helpers
    getSentEvents: () => sentEvents,
    getRemovedClients: () => removedClients,
  } as unknown as RealtimeManager & {
    getSentEvents: () => Array<{ clientId: string; event: string; data: unknown }>;
    getRemovedClients: () => string[];
  };
}

// Create a mock client
function createMockClient(
  id: string,
  subscriptions: Subscription[],
  user: RealtimeClient["user"] = null
): RealtimeClient {
  return {
    id,
    controller: {} as ReadableStreamDirectController,
    subscriptions,
    user,
    lastActivity: Date.now(),
  };
}

describe("broadcastRecordEvent", () => {
  beforeEach(() => {
    mockGetCollection.mockReset();
  });

  describe("subscriber filtering", () => {
    test("sends events to subscribers", async () => {
      // Setup collection with public rules
      mockGetCollection.mockReturnValue({
        id: "col1",
        name: "posts",
        type: "base",
        options: null,
        rules: { listRule: "", viewRule: "" }, // Public access
        created_at: "",
        updated_at: "",
      });

      const client = createMockClient("client1", [
        { collection: "posts", recordId: "*" },
      ]);
      const manager = createMockManager([client]);

      const record = { id: "rec1", title: "Hello" };
      await broadcastRecordEvent(manager, "create", "posts", record);

      const events = manager.getSentEvents();
      expect(events).toHaveLength(1);
      expect(events[0].clientId).toBe("client1");
      expect(events[0].event).toBe("posts");
      expect(events[0].data).toEqual({ action: "create", record });
    });

    test("does not send to non-subscribers", async () => {
      mockGetCollection.mockReturnValue({
        id: "col1",
        name: "posts",
        type: "base",
        options: null,
        rules: { listRule: "", viewRule: "" },
        created_at: "",
        updated_at: "",
      });

      // Client subscribed to different collection
      const client = createMockClient("client1", [
        { collection: "users", recordId: "*" },
      ]);
      const manager = createMockManager([client]);

      const record = { id: "rec1", title: "Hello" };
      await broadcastRecordEvent(manager, "create", "posts", record);

      expect(manager.getSentEvents()).toHaveLength(0);
    });

    test("specific record subscription only receives matching records", async () => {
      mockGetCollection.mockReturnValue({
        id: "col1",
        name: "posts",
        type: "base",
        options: null,
        rules: { listRule: "", viewRule: "" },
        created_at: "",
        updated_at: "",
      });

      // Client subscribed to specific record
      const client = createMockClient("client1", [
        { collection: "posts", recordId: "rec1" },
      ]);
      const manager = createMockManager([client]);

      // Event for different record
      const record = { id: "rec2", title: "Other" };
      await broadcastRecordEvent(manager, "update", "posts", record);

      expect(manager.getSentEvents()).toHaveLength(0);
    });

    test("specific record subscription receives matching record", async () => {
      mockGetCollection.mockReturnValue({
        id: "col1",
        name: "posts",
        type: "base",
        options: null,
        rules: { listRule: "", viewRule: "" },
        created_at: "",
        updated_at: "",
      });

      const client = createMockClient("client1", [
        { collection: "posts", recordId: "rec1" },
      ]);
      const manager = createMockManager([client]);

      const record = { id: "rec1", title: "Hello" };
      await broadcastRecordEvent(manager, "update", "posts", record);

      expect(manager.getSentEvents()).toHaveLength(1);
    });

    test("wildcard subscription receives all records in collection", async () => {
      mockGetCollection.mockReturnValue({
        id: "col1",
        name: "posts",
        type: "base",
        options: null,
        rules: { listRule: "", viewRule: "" },
        created_at: "",
        updated_at: "",
      });

      const client = createMockClient("client1", [
        { collection: "posts", recordId: "*" },
      ]);
      const manager = createMockManager([client]);

      // Multiple events
      await broadcastRecordEvent(manager, "create", "posts", {
        id: "rec1",
        title: "First",
      });
      await broadcastRecordEvent(manager, "create", "posts", {
        id: "rec2",
        title: "Second",
      });
      await broadcastRecordEvent(manager, "update", "posts", {
        id: "rec1",
        title: "Updated",
      });

      expect(manager.getSentEvents()).toHaveLength(3);
    });
  });

  describe("permission filtering", () => {
    test("public collection (empty string rule) allows all", async () => {
      mockGetCollection.mockReturnValue({
        id: "col1",
        name: "posts",
        type: "base",
        options: null,
        rules: { listRule: "", viewRule: "" },
        created_at: "",
        updated_at: "",
      });

      // Unauthenticated client
      const client = createMockClient("client1", [
        { collection: "posts", recordId: "*" },
      ]);
      const manager = createMockManager([client]);

      await broadcastRecordEvent(manager, "create", "posts", {
        id: "rec1",
        title: "Hello",
      });

      expect(manager.getSentEvents()).toHaveLength(1);
    });

    test("locked collection (null rule) denies non-admin", async () => {
      mockGetCollection.mockReturnValue({
        id: "col1",
        name: "secrets",
        type: "base",
        options: null,
        rules: { listRule: null, viewRule: null }, // Locked
        created_at: "",
        updated_at: "",
      });

      // Unauthenticated client
      const client = createMockClient("client1", [
        { collection: "secrets", recordId: "*" },
      ]);
      const manager = createMockManager([client]);

      await broadcastRecordEvent(manager, "create", "secrets", {
        id: "rec1",
        data: "secret",
      });

      expect(manager.getSentEvents()).toHaveLength(0);
    });

    test("authenticated client receives events when rule allows", async () => {
      mockGetCollection.mockReturnValue({
        id: "col1",
        name: "posts",
        type: "base",
        options: null,
        rules: {
          listRule: "user_id = @request.auth.id",
          viewRule: "user_id = @request.auth.id",
        },
        created_at: "",
        updated_at: "",
      });

      const client = createMockClient(
        "client1",
        [{ collection: "posts", recordId: "*" }],
        {
          id: "user123",
          email: "test@example.com",
          verified: true,
          collectionId: "users",
          collectionName: "users",
        }
      );
      const manager = createMockManager([client]);

      // Record belongs to authenticated user
      await broadcastRecordEvent(manager, "create", "posts", {
        id: "rec1",
        user_id: "user123",
        title: "My Post",
      });

      expect(manager.getSentEvents()).toHaveLength(1);
    });

    test("authenticated client denied when rule fails", async () => {
      mockGetCollection.mockReturnValue({
        id: "col1",
        name: "posts",
        type: "base",
        options: null,
        rules: {
          listRule: "user_id = @request.auth.id",
          viewRule: "user_id = @request.auth.id",
        },
        created_at: "",
        updated_at: "",
      });

      const client = createMockClient(
        "client1",
        [{ collection: "posts", recordId: "*" }],
        {
          id: "user123",
          email: "test@example.com",
          verified: true,
          collectionId: "users",
          collectionName: "users",
        }
      );
      const manager = createMockManager([client]);

      // Record belongs to different user
      await broadcastRecordEvent(manager, "create", "posts", {
        id: "rec1",
        user_id: "other_user",
        title: "Other User Post",
      });

      expect(manager.getSentEvents()).toHaveLength(0);
    });

    test("uses listRule for wildcard subscription", async () => {
      mockGetCollection.mockReturnValue({
        id: "col1",
        name: "posts",
        type: "base",
        options: null,
        rules: {
          listRule: "", // Public list
          viewRule: null, // Locked view (admin only)
        },
        created_at: "",
        updated_at: "",
      });

      // Wildcard subscription should use listRule
      const client = createMockClient("client1", [
        { collection: "posts", recordId: "*" },
      ]);
      const manager = createMockManager([client]);

      await broadcastRecordEvent(manager, "create", "posts", {
        id: "rec1",
        title: "Hello",
      });

      // Should succeed because listRule is public
      expect(manager.getSentEvents()).toHaveLength(1);
    });

    test("uses viewRule for specific record subscription", async () => {
      mockGetCollection.mockReturnValue({
        id: "col1",
        name: "posts",
        type: "base",
        options: null,
        rules: {
          listRule: null, // Locked list (admin only)
          viewRule: "", // Public view
        },
        created_at: "",
        updated_at: "",
      });

      // Specific record subscription should use viewRule
      const client = createMockClient("client1", [
        { collection: "posts", recordId: "rec1" },
      ]);
      const manager = createMockManager([client]);

      await broadcastRecordEvent(manager, "update", "posts", {
        id: "rec1",
        title: "Hello",
      });

      // Should succeed because viewRule is public
      expect(manager.getSentEvents()).toHaveLength(1);
    });
  });

  describe("action types", () => {
    test("broadcasts create action", async () => {
      mockGetCollection.mockReturnValue({
        id: "col1",
        name: "posts",
        type: "base",
        options: null,
        rules: { listRule: "", viewRule: "" },
        created_at: "",
        updated_at: "",
      });

      const client = createMockClient("client1", [
        { collection: "posts", recordId: "*" },
      ]);
      const manager = createMockManager([client]);

      await broadcastRecordEvent(manager, "create", "posts", {
        id: "rec1",
        title: "New",
      });

      const events = manager.getSentEvents();
      expect(events[0].data).toEqual({
        action: "create",
        record: { id: "rec1", title: "New" },
      });
    });

    test("broadcasts update action", async () => {
      mockGetCollection.mockReturnValue({
        id: "col1",
        name: "posts",
        type: "base",
        options: null,
        rules: { listRule: "", viewRule: "" },
        created_at: "",
        updated_at: "",
      });

      const client = createMockClient("client1", [
        { collection: "posts", recordId: "*" },
      ]);
      const manager = createMockManager([client]);

      await broadcastRecordEvent(manager, "update", "posts", {
        id: "rec1",
        title: "Updated",
      });

      const events = manager.getSentEvents();
      expect(events[0].data).toEqual({
        action: "update",
        record: { id: "rec1", title: "Updated" },
      });
    });

    test("broadcasts delete action", async () => {
      mockGetCollection.mockReturnValue({
        id: "col1",
        name: "posts",
        type: "base",
        options: null,
        rules: { listRule: "", viewRule: "" },
        created_at: "",
        updated_at: "",
      });

      const client = createMockClient("client1", [
        { collection: "posts", recordId: "*" },
      ]);
      const manager = createMockManager([client]);

      await broadcastRecordEvent(manager, "delete", "posts", { id: "rec1" });

      const events = manager.getSentEvents();
      expect(events[0].data).toEqual({
        action: "delete",
        record: { id: "rec1" },
      });
    });
  });

  describe("edge cases", () => {
    test("handles no subscribers gracefully", async () => {
      mockGetCollection.mockReturnValue({
        id: "col1",
        name: "posts",
        type: "base",
        options: null,
        rules: { listRule: "", viewRule: "" },
        created_at: "",
        updated_at: "",
      });

      const manager = createMockManager([]);

      // Should not throw
      await broadcastRecordEvent(manager, "create", "posts", {
        id: "rec1",
        title: "Hello",
      });

      expect(manager.getSentEvents()).toHaveLength(0);
    });

    test("handles unknown collection gracefully", async () => {
      mockGetCollection.mockReturnValue(null);

      const client = createMockClient("client1", [
        { collection: "unknown", recordId: "*" },
      ]);
      const manager = createMockManager([client]);

      // Should not throw
      await broadcastRecordEvent(manager, "create", "unknown", {
        id: "rec1",
      });

      expect(manager.getSentEvents()).toHaveLength(0);
    });

    test("handles collection without rules (null rules)", async () => {
      mockGetCollection.mockReturnValue({
        id: "col1",
        name: "posts",
        type: "base",
        options: null,
        rules: null, // No rules defined
        created_at: "",
        updated_at: "",
      });

      const client = createMockClient("client1", [
        { collection: "posts", recordId: "*" },
      ]);
      const manager = createMockManager([client]);

      await broadcastRecordEvent(manager, "create", "posts", {
        id: "rec1",
        title: "Hello",
      });

      // null rules means null listRule/viewRule which means admin-only
      expect(manager.getSentEvents()).toHaveLength(0);
    });

    test("removes client on send error", async () => {
      mockGetCollection.mockReturnValue({
        id: "col1",
        name: "posts",
        type: "base",
        options: null,
        rules: { listRule: "", viewRule: "" },
        created_at: "",
        updated_at: "",
      });

      const client = createMockClient("client1", [
        { collection: "posts", recordId: "*" },
      ]);

      // Create manager with failing sendEvent
      const manager = {
        getSubscribersForRecord: () => [client],
        sendEvent: mock(async () => {
          throw new Error("Connection closed");
        }),
        removeClient: mock(() => {}),
      } as unknown as RealtimeManager;

      // Suppress console.error for this test
      const originalError = console.error;
      console.error = () => {};

      await broadcastRecordEvent(manager, "create", "posts", {
        id: "rec1",
        title: "Hello",
      });

      console.error = originalError;

      expect(manager.removeClient).toHaveBeenCalledWith("client1");
    });

    test("multiple clients with different permissions", async () => {
      mockGetCollection.mockReturnValue({
        id: "col1",
        name: "posts",
        type: "base",
        options: null,
        rules: {
          listRule: "user_id = @request.auth.id",
          viewRule: "user_id = @request.auth.id",
        },
        created_at: "",
        updated_at: "",
      });

      // Client 1: owner of record
      const client1 = createMockClient(
        "client1",
        [{ collection: "posts", recordId: "*" }],
        {
          id: "user123",
          email: "owner@example.com",
          verified: true,
          collectionId: "users",
          collectionName: "users",
        }
      );

      // Client 2: different user
      const client2 = createMockClient(
        "client2",
        [{ collection: "posts", recordId: "*" }],
        {
          id: "user456",
          email: "other@example.com",
          verified: true,
          collectionId: "users",
          collectionName: "users",
        }
      );

      // Client 3: unauthenticated
      const client3 = createMockClient("client3", [
        { collection: "posts", recordId: "*" },
      ]);

      const manager = createMockManager([client1, client2, client3]);

      await broadcastRecordEvent(manager, "create", "posts", {
        id: "rec1",
        user_id: "user123",
        title: "Owner Post",
      });

      // Only client1 (owner) should receive the event
      const events = manager.getSentEvents();
      expect(events).toHaveLength(1);
      expect(events[0].clientId).toBe("client1");
    });
  });
});
