/**
 * HTTP Server for BunBase REST API
 *
 * Exposes CRUD operations for collection records via HTTP endpoints.
 * Uses Bun.serve() with route definitions following PocketBase conventions.
 */

import { initDatabase } from "../core/database";
import {
  getRecord,
  listRecordsWithQuery,
  createRecordWithHooks,
  updateRecordWithHooks,
  deleteRecordWithHooks,
} from "../core/records";
import { parseQueryOptions } from "../core/query";
import { HookManager } from "../core/hooks";

// Re-export HookManager for external registration
export { HookManager } from "../core/hooks";

/**
 * Create an error response with consistent format.
 *
 * @param message - Error message
 * @param status - HTTP status code
 * @returns Response with JSON error body
 */
function errorResponse(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

/**
 * Map error messages to HTTP status codes.
 *
 * @param error - Error thrown by Phase 1 operations
 * @returns Appropriate HTTP status code
 */
function mapErrorToStatus(error: Error): number {
  const msg = error.message.toLowerCase();
  if (msg.includes("not found")) return 404;
  if (msg.includes("validation failed")) return 400;
  if (msg.includes("invalid filter field")) return 400;
  if (msg.includes("invalid sort field")) return 400;
  if (msg.includes("already exists")) return 409;
  return 500;
}

/**
 * Create the HTTP server with all CRUD routes.
 *
 * @param port - Port to listen on (default: 8090)
 * @param hooks - Optional HookManager instance for lifecycle hooks
 * @returns The Bun.Server instance
 */
export function createServer(port: number = 8090, hooks?: HookManager) {
  // Create default hooks instance if not provided
  const hookManager = hooks ?? new HookManager();

  return Bun.serve({
    port,
    routes: {
      // List records and create record
      "/api/collections/:name/records": {
        /**
         * GET /api/collections/:name/records
         * List records with query support (filter, sort, pagination, expand)
         */
        GET: (req) => {
          try {
            const { name } = req.params;
            const url = new URL(req.url);
            const options = parseQueryOptions(url);
            const result = listRecordsWithQuery(name, options);
            return Response.json(result);
          } catch (error) {
            const err = error as Error;
            return errorResponse(err.message, mapErrorToStatus(err));
          }
        },

        /**
         * POST /api/collections/:name/records
         * Create a new record in a collection (with lifecycle hooks)
         */
        POST: async (req) => {
          try {
            const { name } = req.params;
            const body = await req.json();
            const record = await createRecordWithHooks(name, body, hookManager, req);
            return Response.json(record, { status: 201 });
          } catch (error) {
            const err = error as Error;
            return errorResponse(err.message, mapErrorToStatus(err));
          }
        },
      },

      // Single record operations
      "/api/collections/:name/records/:id": {
        /**
         * GET /api/collections/:name/records/:id
         * Get a single record by ID
         */
        GET: (req) => {
          try {
            const { name, id } = req.params;
            const record = getRecord(name, id);
            if (!record) {
              return errorResponse(
                `Record "${id}" not found in collection "${name}"`,
                404
              );
            }
            return Response.json(record);
          } catch (error) {
            const err = error as Error;
            return errorResponse(err.message, mapErrorToStatus(err));
          }
        },

        /**
         * PATCH /api/collections/:name/records/:id
         * Update a record by ID (with lifecycle hooks)
         */
        PATCH: async (req) => {
          try {
            const { name, id } = req.params;
            const body = await req.json();
            const record = await updateRecordWithHooks(name, id, body, hookManager, req);
            return Response.json(record);
          } catch (error) {
            const err = error as Error;
            return errorResponse(err.message, mapErrorToStatus(err));
          }
        },

        /**
         * DELETE /api/collections/:name/records/:id
         * Delete a record by ID (with lifecycle hooks)
         */
        DELETE: async (req) => {
          try {
            const { name, id } = req.params;
            await deleteRecordWithHooks(name, id, hookManager, req);
            return new Response(null, { status: 204 });
          } catch (error) {
            const err = error as Error;
            return errorResponse(err.message, mapErrorToStatus(err));
          }
        },
      },
    },

    /**
     * Fallback for unmatched routes
     */
    fetch(req) {
      return errorResponse("Not found", 404);
    },
  });
}

/**
 * Start the server with database initialization.
 * Convenience function for main entry point.
 *
 * @param port - Port to listen on (default: 8090)
 * @param dbPath - Database file path (default: "bunbase.db")
 * @param hooks - Optional HookManager instance for lifecycle hooks
 * @returns The Bun.Server instance
 */
export function startServer(
  port: number = 8090,
  dbPath: string = "bunbase.db",
  hooks?: HookManager
) {
  initDatabase(dbPath);
  const server = createServer(port, hooks);
  console.log(`BunBase running at http://localhost:${port}`);
  return server;
}
