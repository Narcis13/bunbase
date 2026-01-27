/**
 * Event broadcasting with permission filtering for realtime subscriptions.
 * Broadcasts create/update/delete events to subscribed clients with proper access control.
 *
 * @module realtime/broadcast
 */

import type { RealtimeManager, RealtimeClient } from "./manager";
import { matchesSubscription } from "./topics";
import { evaluateRule, type RuleContext } from "../auth/rules";
import { getCollection } from "../core/schema";

/**
 * Record action types for realtime events.
 */
export type RecordAction = "create" | "update" | "delete";

/**
 * Broadcast a record event to all authorized subscribers.
 * Fire-and-forget - errors are logged but don't propagate.
 *
 * For each subscriber:
 * 1. Matches subscription to collection/record
 * 2. Evaluates collection rules (listRule for wildcard, viewRule for specific)
 * 3. Sends event only if authorized
 *
 * @param manager - RealtimeManager instance
 * @param action - The action type (create, update, delete)
 * @param collection - Collection name
 * @param record - The record data (for create/update) or { id } for delete
 */
export async function broadcastRecordEvent(
  manager: RealtimeManager,
  action: RecordAction,
  collection: string,
  record: Record<string, unknown>
): Promise<void> {
  const recordId = record.id as string;
  const subscribers = manager.getSubscribersForRecord(collection, recordId);

  if (subscribers.length === 0) return;

  // Get collection for rule evaluation
  const collectionDef = getCollection(collection);
  if (!collectionDef) return;

  for (const client of subscribers) {
    // Determine which rule to check based on subscription type
    const sub = client.subscriptions.find((s) =>
      matchesSubscription(s, collection, recordId)
    );
    if (!sub) continue;

    // Collection-wide subscription uses listRule, specific record uses viewRule
    const rule =
      sub.recordId === "*"
        ? collectionDef.rules?.listRule ?? null
        : collectionDef.rules?.viewRule ?? null;

    // Build auth context for rule evaluation
    const authContext: RuleContext = {
      isAdmin: false, // SSE clients are never admin
      auth: client.user,
      record,
    };

    // Check access permission
    const hasAccess = evaluateRule(rule, authContext);
    if (!hasAccess) continue;

    // Send event - event name is the collection name (PocketBase convention)
    // Data includes action and record
    const eventData = { action, record };

    try {
      await manager.sendEvent(client.id, collection, eventData);
    } catch (error) {
      // Client likely disconnected, remove from manager
      console.error(`Broadcast error for client ${client.id}:`, error);
      manager.removeClient(client.id);
    }
  }
}
