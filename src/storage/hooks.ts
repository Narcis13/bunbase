/**
 * File storage hooks for automatic cleanup.
 */

import { deleteRecordFiles } from "./files";
import { getFields } from "../core/schema";
import type { HookManager } from "../core/hooks";

/**
 * Check if a collection has any file fields.
 */
function hasFileFields(collectionName: string): boolean {
  try {
    const fields = getFields(collectionName);
    return fields.some((f) => f.type === "file");
  } catch {
    // Collection might not exist, no file fields
    return false;
  }
}

/**
 * Register the file cleanup hook that deletes files when records are deleted.
 *
 * This is a global afterDelete hook that:
 * 1. Checks if the collection has file fields
 * 2. If so, deletes the record's storage directory
 * 3. Logs errors but doesn't throw (cleanup failures shouldn't block deletion)
 *
 * @param hooks - HookManager instance to register with
 * @returns Unsubscribe function
 */
export function registerFileCleanupHook(hooks: HookManager): () => void {
  return hooks.on("afterDelete", async (ctx, next) => {
    // Only attempt cleanup for collections with file fields
    if (hasFileFields(ctx.collection)) {
      try {
        await deleteRecordFiles(ctx.collection, ctx.id);
      } catch (error) {
        // Log but don't throw - record is already deleted
        // Cleanup failure shouldn't cause an error response
        console.error(
          `Failed to delete files for record ${ctx.collection}/${ctx.id}:`,
          error
        );
      }
    }

    // Continue to next handler
    await next();
  });
}
