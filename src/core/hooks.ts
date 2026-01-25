/**
 * HookManager for lifecycle hook registration and execution.
 * Follows a middleware pattern where handlers execute sequentially
 * and can control flow via the next() function.
 */

import type {
  HookEventMap,
  HookHandler,
  Next,
} from "../types/hooks.ts";

/**
 * Internal entry for a registered handler.
 * @template T - The context type for the handler
 */
interface HandlerEntry<T> {
  handler: HookHandler<T>;
  /** Collection name for scoped handlers, undefined for global handlers */
  collection?: string;
}

/**
 * HookManager provides lifecycle hook registration and execution.
 *
 * Handlers execute in registration order (FIFO) and follow a middleware
 * pattern where each handler can call next() to continue the chain.
 *
 * @example
 * ```ts
 * const hooks = new HookManager();
 *
 * // Global handler for all collections
 * hooks.on('beforeCreate', async (ctx, next) => {
 *   console.log(`Creating in ${ctx.collection}`);
 *   await next();
 * });
 *
 * // Collection-specific handler
 * hooks.on('beforeCreate', 'users', async (ctx, next) => {
 *   ctx.data.createdBy = 'system';
 *   await next();
 * });
 * ```
 */
export class HookManager {
  private handlers: {
    [K in keyof HookEventMap]?: HandlerEntry<HookEventMap[K]>[];
  } = {};

  /**
   * Register a handler for a hook event.
   *
   * @param event - The hook event to listen for
   * @param handlerOrCollection - Either a handler function (global) or collection name
   * @param handler - Handler function when collection name is provided
   * @returns Unsubscribe function to remove the handler
   *
   * @example
   * // Global handler
   * const unsub = hooks.on('beforeCreate', handler);
   *
   * // Collection-specific handler
   * const unsub = hooks.on('beforeCreate', 'users', handler);
   */
  on<K extends keyof HookEventMap>(
    event: K,
    handlerOrCollection: HookHandler<HookEventMap[K]> | string,
    handler?: HookHandler<HookEventMap[K]>
  ): () => void {
    // Determine if this is a scoped or global registration
    let entry: HandlerEntry<HookEventMap[K]>;

    if (typeof handlerOrCollection === 'string') {
      // on('event', 'collection', handler)
      if (!handler) {
        throw new Error('Handler is required when collection is specified');
      }
      entry = {
        handler,
        collection: handlerOrCollection,
      };
    } else {
      // on('event', handler)
      entry = {
        handler: handlerOrCollection,
      };
    }

    // Initialize array for this event if needed
    if (!this.handlers[event]) {
      this.handlers[event] = [];
    }

    // Add handler to the array
    this.handlers[event]!.push(entry);

    // Return unsubscribe function
    return () => {
      const eventHandlers = this.handlers[event];
      if (eventHandlers) {
        const index = eventHandlers.indexOf(entry);
        if (index !== -1) {
          eventHandlers.splice(index, 1);
        }
      }
    };
  }

  /**
   * Clear all registered handlers.
   * Useful for testing to reset state between tests.
   */
  clear(): void {
    this.handlers = {};
  }

  /**
   * Trigger a hook event, executing all matching handlers.
   *
   * Handlers are filtered to include:
   * - All global handlers (no collection specified)
   * - Collection-specific handlers matching ctx.collection
   *
   * Handlers execute in registration order. If a handler throws,
   * the chain stops and the error propagates. If a handler doesn't
   * call next(), the chain stops silently.
   *
   * @param event - The hook event to trigger
   * @param context - The context object for this event
   * @throws Rethrows any error from handlers
   */
  async trigger<K extends keyof HookEventMap>(
    event: K,
    context: HookEventMap[K]
  ): Promise<void> {
    const eventHandlers = this.handlers[event];
    if (!eventHandlers || eventHandlers.length === 0) {
      return;
    }

    // Filter handlers to those matching the collection or global
    const matchingHandlers = eventHandlers.filter(
      (entry) =>
        entry.collection === undefined ||
        entry.collection === context.collection
    );

    if (matchingHandlers.length === 0) {
      return;
    }

    // Execute the middleware chain
    await this.executeChain(context, matchingHandlers);
  }

  /**
   * Execute handlers as a middleware chain.
   * Each handler receives a next() function that calls the remaining handlers.
   */
  private async executeChain<T>(
    context: T,
    handlers: HandlerEntry<T>[]
  ): Promise<void> {
    if (handlers.length === 0) {
      return;
    }

    let index = 0;

    const next: Next = async () => {
      index++;
      if (index < handlers.length) {
        const entry = handlers[index];
        await entry.handler(context, next);
      }
    };

    // Start the chain with the first handler
    const firstEntry = handlers[0];
    await firstEntry.handler(context, next);
  }
}

/**
 * Default HookManager instance for the application.
 */
export const hooks = new HookManager();
