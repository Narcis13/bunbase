/**
 * HTTP Server for BunBase REST API
 *
 * Exposes CRUD operations for collection records via HTTP endpoints.
 * Uses Bun.serve() with route definitions following PocketBase conventions.
 * Serves admin UI at /_/ routes via Bun HTML imports.
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
import {
  createAdmin,
  verifyAdminPassword,
  getAdminByEmail,
  updateAdminPassword,
} from "../auth/admin";
import { createAdminToken } from "../auth/jwt";
import { requireAdmin } from "../auth/middleware";

// Admin UI HTML import - Bun bundles React, Tailwind, and components automatically
import adminHtml from "../admin/index.html";

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
  // Default to 400 for application errors (including hook cancellations)
  // 500 is reserved for unexpected system errors
  return 400;
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

      // Admin authentication routes
      "/_/api/auth/login": {
        /**
         * POST /_/api/auth/login
         * Authenticate admin with email/password and return JWT token
         */
        POST: async (req) => {
          try {
            const { email, password } = await req.json();
            if (!email || !password) {
              return errorResponse("Email and password required", 400);
            }
            const admin = await verifyAdminPassword(email, password);
            if (!admin) {
              return errorResponse("Invalid credentials", 401);
            }
            const token = await createAdminToken(admin.id);
            return Response.json({ token, admin });
          } catch (error) {
            const err = error as Error;
            return errorResponse(err.message, 400);
          }
        },
      },

      "/_/api/auth/password": {
        /**
         * POST /_/api/auth/password
         * Change admin password (requires valid JWT)
         */
        POST: async (req) => {
          const adminOrError = await requireAdmin(req);
          if (adminOrError instanceof Response) return adminOrError;
          const admin = adminOrError;
          try {
            const { newPassword } = await req.json();
            if (!newPassword || newPassword.length < 8) {
              return errorResponse(
                "Password must be at least 8 characters",
                400
              );
            }
            await updateAdminPassword(admin.id, newPassword);
            return Response.json({ message: "Password updated" });
          } catch (error) {
            const err = error as Error;
            return errorResponse(err.message, 400);
          }
        },
      },

      "/_/api/auth/me": {
        /**
         * GET /_/api/auth/me
         * Get current admin info (requires valid JWT)
         */
        GET: async (req) => {
          const adminOrError = await requireAdmin(req);
          if (adminOrError instanceof Response) return adminOrError;
          return Response.json(adminOrError);
        },
      },

      // Admin UI routes - Bun serves the React SPA
      "/_/": adminHtml,
      "/_/*": adminHtml, // Catch-all for SPA client-side routing
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
 * Generate a random password for initial admin.
 * Uses alphanumeric characters (excluding ambiguous ones like 0, O, l, 1)
 *
 * @returns A 16-character random password
 */
function generateRandomPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let result = "";
  for (let i = 0; i < 16; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/**
 * Start the server with database initialization.
 * Creates initial admin account if none exists.
 *
 * @param port - Port to listen on (default: 8090)
 * @param dbPath - Database file path (default: "bunbase.db")
 * @param hooks - Optional HookManager instance for lifecycle hooks
 * @returns The Bun.Server instance
 */
export async function startServer(
  port: number = 8090,
  dbPath: string = "bunbase.db",
  hooks?: HookManager
) {
  initDatabase(dbPath);

  // Create initial admin if none exists
  const existingAdmin = getAdminByEmail("admin@bunbase.local");
  if (!existingAdmin) {
    const password = Bun.env.BUNBASE_ADMIN_PASSWORD || generateRandomPassword();
    await createAdmin("admin@bunbase.local", password);
    if (!Bun.env.BUNBASE_ADMIN_PASSWORD) {
      console.log(`Initial admin created: admin@bunbase.local`);
      console.log(`Generated password: ${password}`);
      console.log(
        `Set BUNBASE_ADMIN_PASSWORD env var to use a specific password.`
      );
    }
  }

  const server = createServer(port, hooks);
  console.log(`BunBase running at http://localhost:${port}`);
  return server;
}
