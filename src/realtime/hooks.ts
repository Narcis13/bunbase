/**
 * Hook registration for realtime event broadcasting.
 * Integrates with HookManager to broadcast record changes to SSE subscribers.
 *
 * @module realtime/hooks
 */

import type { HookManager } from "../core/hooks";
import type { RealtimeManager } from "./manager";
import { broadcastRecordEvent } from "./broadcast";

/**
 * Register realtime hooks for broadcasting record events.
 * Hooks are fire-and-forget - they don't block the API response.
 *
 * Registers:
 * - afterCreate: Broadcasts to collection/* subscribers
 * - afterUpdate: Broadcasts to collection/* and collection/recordId subscribers
 * - afterDelete: Broadcasts to collection/* and collection/recordId subscribers
 *
 * @param hooks - HookManager instance to register handlers with
 * @param realtimeManager - RealtimeManager instance for broadcasting
 */
export function registerRealtimeHooks(
  hooks: HookManager,
  realtimeManager: RealtimeManager
): void {
  // afterCreate - broadcast to collection subscribers
  hooks.on("afterCreate", async (ctx, next) => {
    await next();

    // Fire and forget - don't block response
    broadcastRecordEvent(
      realtimeManager,
      "create",
      ctx.collection,
      ctx.record
    ).catch((err) => console.error("Realtime broadcast error:", err));
  });

  // afterUpdate - broadcast to collection and record subscribers
  hooks.on("afterUpdate", async (ctx, next) => {
    await next();

    broadcastRecordEvent(
      realtimeManager,
      "update",
      ctx.collection,
      ctx.record
    ).catch((err) => console.error("Realtime broadcast error:", err));
  });

  // afterDelete - broadcast to collection and record subscribers
  hooks.on("afterDelete", async (ctx, next) => {
    await next();

    // For delete, we only have the ID, not the full record
    // Create minimal record object for broadcasting
    const record = { id: ctx.id };

    broadcastRecordEvent(realtimeManager, "delete", ctx.collection, record).catch(
      (err) => console.error("Realtime broadcast error:", err)
    );
  });
}
