/**
 * RouteContext module for BunBase custom routes.
 * Provides type-safe access to all BunBase capabilities through a single context object.
 *
 * @module api/context
 */

import type { Database } from 'bun:sqlite';
import { getDatabase } from '../core/database';
import {
  getRecord,
  listRecordsWithQuery,
  createRecordWithHooks,
  updateRecordWithHooks,
  deleteRecordWithHooks,
} from '../core/records';
import { HookManager } from '../core/hooks';
import { RealtimeManager } from '../realtime/manager';
import {
  saveFile,
  getFilePath,
  fileExists,
  deleteFile,
} from '../storage/files';
import {
  optionalUser,
  requireAdmin as authRequireAdmin,
  extractBearerToken,
  type AuthenticatedUser,
} from '../auth/middleware';
import { verifyAdminToken } from '../auth/jwt';
import type { QueryOptions, PaginatedResponse } from '../types/query';
import { UnauthorizedError } from './errors';

/**
 * Dependencies needed to create a RouteContext.
 * These are the manager instances that must be provided by the server.
 */
export interface ContextDependencies {
  /** HookManager instance for lifecycle hook execution */
  hooks: HookManager;
  /** RealtimeManager instance for SSE subscriptions */
  realtime: RealtimeManager;
}

/**
 * Records API interface for CRUD operations with hooks.
 * All mutating operations (create, update, delete) go through the hook system.
 */
export interface RecordsAPI {
  /**
   * Get a single record by ID.
   *
   * @param collection - Collection name
   * @param id - Record ID
   * @returns The record or null if not found
   */
  get(collection: string, id: string): Record<string, unknown> | null;

  /**
   * List records with optional filtering, sorting, and pagination.
   *
   * @param collection - Collection name
   * @param options - Query options (filter, sort, page, perPage, expand)
   * @returns Paginated response with items and metadata
   */
  list(collection: string, options?: QueryOptions): PaginatedResponse<Record<string, unknown>>;

  /**
   * Create a new record. Triggers beforeCreate/afterCreate hooks.
   *
   * @param collection - Collection name
   * @param data - Record data (without system fields)
   * @returns The created record with system fields
   */
  create(collection: string, data: Record<string, unknown>): Promise<Record<string, unknown>>;

  /**
   * Update an existing record. Triggers beforeUpdate/afterUpdate hooks.
   *
   * @param collection - Collection name
   * @param id - Record ID
   * @param data - Partial record data to update
   * @returns The updated record
   */
  update(collection: string, id: string, data: Record<string, unknown>): Promise<Record<string, unknown>>;

  /**
   * Delete a record. Triggers beforeDelete/afterDelete hooks.
   *
   * @param collection - Collection name
   * @param id - Record ID
   */
  delete(collection: string, id: string): Promise<void>;
}

/**
 * Auth API interface for authentication helpers in custom routes.
 */
export interface AuthAPI {
  /**
   * Build authentication context from a request.
   * Checks for admin token first, then user token.
   *
   * @param req - HTTP Request
   * @returns Object with isAdmin flag and optional user
   */
  buildContext(req: Request): Promise<{ isAdmin: boolean; user: AuthenticatedUser | null }>;

  /**
   * Get the authenticated user from a request, or null if not authenticated.
   * Does not throw - use for optional authentication.
   *
   * @param req - HTTP Request
   * @returns Authenticated user or null
   */
  optionalUser(req: Request): Promise<AuthenticatedUser | null>;

  /**
   * Require admin authentication. Throws UnauthorizedError if not admin.
   *
   * @param req - HTTP Request
   * @throws UnauthorizedError if request is not from an admin
   */
  requireAdmin(req: Request): Promise<void>;
}

/**
 * Files API interface for file storage operations.
 * Wraps the storage module functions with a consistent interface.
 */
export interface FilesAPI {
  /**
   * Save a file to storage.
   *
   * @param collection - Collection name
   * @param recordId - Record ID
   * @param file - File to save
   * @returns The stored filename
   */
  save(collection: string, recordId: string, file: File): Promise<string>;

  /**
   * Get the full path to a file.
   *
   * @param collection - Collection name
   * @param recordId - Record ID
   * @param filename - File name
   * @returns Full file path
   */
  getPath(collection: string, recordId: string, filename: string): string;

  /**
   * Check if a file exists.
   *
   * @param collection - Collection name
   * @param recordId - Record ID
   * @param filename - File name
   * @returns true if file exists
   */
  exists(collection: string, recordId: string, filename: string): Promise<boolean>;

  /**
   * Delete a file from storage.
   *
   * @param collection - Collection name
   * @param recordId - Record ID
   * @param filename - File name
   */
  delete(collection: string, recordId: string, filename: string): Promise<void>;
}

/**
 * Full context available to custom route handlers.
 * Provides access to all BunBase capabilities through a single object.
 *
 * @example
 * ```ts
 * export const GET = async (req: Request, ctx: RouteContext) => {
 *   // Access database directly
 *   const stats = ctx.db.query('SELECT COUNT(*) FROM users').get();
 *
 *   // Use records API with hooks
 *   const posts = ctx.records.list('posts', { page: 1, perPage: 10 });
 *
 *   // Check authentication
 *   const { isAdmin, user } = await ctx.auth.buildContext(req);
 *
 *   return Response.json({ stats, posts, isAdmin });
 * };
 * ```
 */
export interface RouteContext {
  /** The original HTTP request */
  request: Request;
  /** Route parameters extracted from the URL path */
  params: Record<string, string>;
  /** Direct SQLite database access */
  db: Database;
  /** Records API with hook-aware CRUD operations */
  records: RecordsAPI;
  /** Authentication helpers */
  auth: AuthAPI;
  /** Realtime manager for SSE events */
  realtime: RealtimeManager;
  /** File storage operations */
  files: FilesAPI;
  /** Hook manager for custom hook registration */
  hooks: HookManager;
}

/**
 * Create Records API that uses hooks for all mutating operations.
 *
 * @param hooks - HookManager instance
 * @returns RecordsAPI implementation
 */
function createRecordsAPI(hooks: HookManager): RecordsAPI {
  return {
    get: (collection, id) => getRecord(collection, id),
    list: (collection, options = {}) => listRecordsWithQuery(collection, options),
    create: (collection, data) => createRecordWithHooks(collection, data, hooks),
    update: (collection, id, data) => updateRecordWithHooks(collection, id, data, hooks),
    delete: (collection, id) => deleteRecordWithHooks(collection, id, hooks),
  };
}

/**
 * Create Auth API wrapping existing middleware functions.
 *
 * @returns AuthAPI implementation
 */
function createAuthAPI(): AuthAPI {
  return {
    buildContext: async (req) => {
      const token = extractBearerToken(req);
      if (!token) {
        return { isAdmin: false, user: null };
      }

      // Check for admin token first
      const adminPayload = await verifyAdminToken(token);
      if (adminPayload) {
        return { isAdmin: true, user: null };
      }

      // Fall back to user token
      const user = await optionalUser(req);
      return { isAdmin: false, user };
    },
    optionalUser: (req) => optionalUser(req),
    requireAdmin: async (req) => {
      const result = await authRequireAdmin(req);
      if (result instanceof Response) {
        throw new UnauthorizedError('Admin authentication required');
      }
    },
  };
}

/**
 * Create Files API wrapping existing storage functions.
 *
 * @returns FilesAPI implementation
 */
function createFilesAPI(): FilesAPI {
  return {
    save: saveFile,
    getPath: getFilePath,
    exists: fileExists,
    delete: deleteFile,
  };
}

/**
 * Create RouteContext for a custom route handler.
 * Called once per request by the server integration layer.
 *
 * @param req - HTTP Request
 * @param params - Route parameters from URL pattern matching
 * @param deps - Context dependencies (hooks, realtime managers)
 * @returns Complete RouteContext for the handler
 *
 * @example
 * ```ts
 * // In server integration
 * const ctx = createRouteContext(req, { id: '123' }, { hooks, realtime });
 * const response = await handler(req, ctx);
 * ```
 */
export function createRouteContext(
  req: Request,
  params: Record<string, string>,
  deps: ContextDependencies
): RouteContext {
  return {
    request: req,
    params,
    db: getDatabase(),
    records: createRecordsAPI(deps.hooks),
    auth: createAuthAPI(),
    realtime: deps.realtime,
    files: createFilesAPI(),
    hooks: deps.hooks,
  };
}
