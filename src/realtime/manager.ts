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

/**
 * A subscription to a collection's realtime updates.
 */
export interface Subscription {
  /** Collection name to subscribe to */
  collection: string;
  /** Specific record ID or "*" for all records in collection */
  recordId: string | "*";
}

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
   * Set subscriptions for a client.
   *
   * @param clientId - Client ID to update
   * @param subscriptions - New subscription list (replaces existing)
   */
  setSubscriptions(clientId: string, subscriptions: Subscription[]): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.subscriptions = subscriptions;
      client.lastActivity = Date.now();
    }
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
}
