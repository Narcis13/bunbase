/**
 * RealtimeManager for tracking SSE connections and subscriptions.
 *
 * Manages the lifecycle of SSE client connections, including:
 * - Client registration and removal
 * - Subscription management
 * - Authentication context
 * - Activity tracking for connection health
 *
 * @module realtime/manager
 */

import type { AuthenticatedUser } from "../auth/middleware";
import { formatSSEMessage, formatSSEComment } from "./sse";
import { nanoid } from "nanoid";
import {
  parseTopic,
  matchesSubscription,
  type Subscription,
} from "./topics";

// Re-export Subscription type for backward compatibility
export type { Subscription } from "./topics";

/**
 * A connected SSE client with its state.
 */
export interface RealtimeClient {
  /** Unique client identifier */
  id: string;
  /** Stream controller for sending messages to the client */
  controller: ReadableStreamDirectController;
  /** Active subscriptions for this client */
  subscriptions: Subscription[];
  /** Authenticated user context, null if unauthenticated */
  user: AuthenticatedUser | null;
  /** Whether this client is authenticated as an admin */
  isAdmin: boolean;
  /** Timestamp of last activity (for inactivity tracking) */
  lastActivity: number;
}

/**
 * Manages SSE client connections and their subscriptions.
 *
 * @example
 * const manager = new RealtimeManager();
 *
 * // In SSE endpoint
 * const stream = new ReadableStream({
 *   type: "direct",
 *   pull(controller) {
 *     const client = manager.registerClient(clientId, controller);
 *     // ...
 *   }
 * });
 *
 * // When client disconnects
 * manager.removeClient(clientId);
 */
export class RealtimeManager {
  private clients: Map<string, RealtimeClient> = new Map();
  private inactivityTimeout: number = 5 * 60 * 1000; // 5 minutes
  private cleanupInterval: Timer | null = null;

  /**
   * Register a new client connection.
   *
   * @param clientId - Unique identifier for the client
   * @param controller - Stream controller for sending SSE messages
   * @returns The newly created client
   */
  registerClient(
    clientId: string,
    controller: ReadableStreamDirectController
  ): RealtimeClient {
    const client: RealtimeClient = {
      id: clientId,
      controller,
      subscriptions: [],
      user: null,
      isAdmin: false,
      lastActivity: Date.now(),
    };
    this.clients.set(clientId, client);
    return client;
  }

  /**
   * Remove a client connection.
   *
   * @param clientId - Client ID to remove
   */
  removeClient(clientId: string): void {
    this.clients.delete(clientId);
  }

  /**
   * Get a client by ID.
   *
   * @param clientId - Client ID to look up
   * @returns The client if found, undefined otherwise
   */
  getClient(clientId: string): RealtimeClient | undefined {
    return this.clients.get(clientId);
  }

  /**
   * Set the authentication context for a client.
   *
   * @param clientId - Client ID to update
   * @param user - Authenticated user or null to clear auth
   */
  setClientAuth(clientId: string, user: AuthenticatedUser | null): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.user = user;
      client.lastActivity = Date.now();
    }
  }

  /**
   * Set the admin status for a client.
   *
   * @param clientId - Client ID to update
   * @param isAdmin - Whether the client is an admin
   */
  setClientAdmin(clientId: string, isAdmin: boolean): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.isAdmin = isAdmin;
      client.lastActivity = Date.now();
    }
  }

  /**
   * Set subscriptions for a client from topic strings.
   * Parses topic strings and stores valid subscriptions.
   * Invalid topics are silently filtered out.
   *
   * @param clientId - Client ID to update
   * @param topics - Array of topic strings (e.g., "posts/*", "users/abc123")
   */
  setSubscriptions(clientId: string, topics: string[]): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Parse topics into subscriptions, filter out invalid ones
    client.subscriptions = topics
      .map((topic) => parseTopic(topic))
      .filter((s): s is Subscription => s !== null);

    client.lastActivity = Date.now();
  }

  /**
   * Update the last activity timestamp for a client.
   *
   * @param clientId - Client ID to update
   */
  updateActivity(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.lastActivity = Date.now();
    }
  }

  /**
   * Get the total number of connected clients.
   *
   * @returns Number of connected clients
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get all client IDs.
   *
   * @returns Array of all connected client IDs
   */
  getAllClientIds(): string[] {
    return Array.from(this.clients.keys());
  }

  /**
   * Send an SSE event to a specific client.
   *
   * @param clientId - Client ID to send to
   * @param event - Event type name
   * @param data - Event data (will be JSON stringified)
   * @returns true if sent successfully, false if client not found or error
   */
  async sendEvent(
    clientId: string,
    event: string,
    data: unknown
  ): Promise<boolean> {
    const client = this.clients.get(clientId);
    if (!client) {
      return false;
    }

    try {
      const message = formatSSEMessage({ event, data, id: nanoid() });
      await client.controller.write(message);
      await client.controller.flush();
      return true;
    } catch {
      // Client likely disconnected
      return false;
    }
  }

  /**
   * Send an SSE comment (keep-alive) to a specific client.
   *
   * @param clientId - Client ID to send to
   * @param comment - Comment text
   * @returns true if sent successfully, false if client not found or error
   */
  async sendComment(clientId: string, comment: string): Promise<boolean> {
    const client = this.clients.get(clientId);
    if (!client) {
      return false;
    }

    try {
      const formatted = formatSSEComment(comment);
      await client.controller.write(formatted);
      await client.controller.flush();
      return true;
    } catch {
      // Client likely disconnected
      return false;
    }
  }

  /**
   * Get all clients subscribed to a specific record.
   * Matches both wildcard subscriptions (collection/*) and specific record subscriptions.
   *
   * @param collection - Collection name
   * @param recordId - Record ID
   * @returns Array of clients subscribed to the record
   */
  getSubscribersForRecord(
    collection: string,
    recordId: string
  ): RealtimeClient[] {
    const subscribers: RealtimeClient[] = [];

    for (const client of this.clients.values()) {
      for (const sub of client.subscriptions) {
        if (matchesSubscription(sub, collection, recordId)) {
          subscribers.push(client);
          break; // Don't add same client twice
        }
      }
    }

    return subscribers;
  }

  /**
   * Clean up inactive client connections.
   * Removes clients that haven't had activity within the inactivity timeout.
   *
   * @returns Number of clients cleaned up
   */
  cleanupInactive(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [clientId, client] of this.clients) {
      if (now - client.lastActivity > this.inactivityTimeout) {
        try {
          client.controller.close();
        } catch {
          // Controller may already be closed
        }
        this.clients.delete(clientId);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Start periodic inactivity cleanup.
   * Runs cleanup at the specified interval.
   *
   * @param intervalMs - Cleanup interval in milliseconds (default: 60000 = 1 minute)
   */
  startInactivityCleanup(intervalMs: number = 60000): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(() => {
      const cleaned = this.cleanupInactive();
      if (cleaned > 0) {
        console.log(`Realtime: cleaned up ${cleaned} inactive connection(s)`);
      }
    }, intervalMs);
  }

  /**
   * Stop periodic inactivity cleanup.
   */
  stopInactivityCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Set the inactivity timeout duration.
   * Useful for testing with shorter timeouts.
   *
   * @param ms - Timeout in milliseconds
   */
  setInactivityTimeout(ms: number): void {
    this.inactivityTimeout = ms;
  }
}
