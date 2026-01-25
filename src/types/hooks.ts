/**
 * Hook type definitions for BunBase lifecycle hooks.
 * Provides type-safe event registration and middleware chain execution.
 */

/**
 * The next function in the middleware chain.
 * Call this to continue to the next handler.
 * Not calling it stops the chain silently.
 */
export type Next = () => Promise<void>;

/**
 * A hook handler function that receives context and can call next() to continue.
 * @template T - The context type for this hook event
 */
export type HookHandler<T> = (context: T, next: Next) => Promise<void> | void;

/**
 * Base context shared by all hook events.
 * Contains the collection name and optional request information.
 */
export interface BaseHookContext {
  /** The collection name this hook is executing for */
  collection: string;
  /** Optional HTTP request context when triggered via API */
  request?: {
    method: string;
    path: string;
    headers: Headers;
  };
}

/**
 * Context for beforeCreate hooks.
 * Called before a new record is inserted into the database.
 * Can modify data or throw to cancel the operation.
 */
export interface BeforeCreateContext extends BaseHookContext {
  /** The data being used to create the new record */
  data: Record<string, unknown>;
}

/**
 * Context for afterCreate hooks.
 * Called after a new record has been successfully created.
 * Record data is finalized and includes system fields.
 */
export interface AfterCreateContext extends BaseHookContext {
  /** The created record with all fields including system fields */
  record: Record<string, unknown>;
}

/**
 * Context for beforeUpdate hooks.
 * Called before an existing record is updated.
 * Can modify data or throw to cancel the operation.
 */
export interface BeforeUpdateContext extends BaseHookContext {
  /** The ID of the record being updated */
  id: string;
  /** The update data being applied */
  data: Record<string, unknown>;
  /** The existing record before the update */
  existing: Record<string, unknown>;
}

/**
 * Context for afterUpdate hooks.
 * Called after a record has been successfully updated.
 * Record data is finalized with all changes applied.
 */
export interface AfterUpdateContext extends BaseHookContext {
  /** The updated record with all fields */
  record: Record<string, unknown>;
}

/**
 * Context for beforeDelete hooks.
 * Called before a record is deleted from the database.
 * Can throw to cancel the deletion.
 */
export interface BeforeDeleteContext extends BaseHookContext {
  /** The ID of the record being deleted */
  id: string;
  /** The existing record before deletion */
  existing: Record<string, unknown>;
}

/**
 * Context for afterDelete hooks.
 * Called after a record has been successfully deleted.
 */
export interface AfterDeleteContext extends BaseHookContext {
  /** The ID of the deleted record */
  id: string;
}

/**
 * Map of hook event names to their context types.
 * Used for type-safe event registration.
 */
export type HookEventMap = {
  beforeCreate: BeforeCreateContext;
  afterCreate: AfterCreateContext;
  beforeUpdate: BeforeUpdateContext;
  afterUpdate: AfterUpdateContext;
  beforeDelete: BeforeDeleteContext;
  afterDelete: AfterDeleteContext;
};

/**
 * All valid hook event names.
 */
export type HookEvent = keyof HookEventMap;
