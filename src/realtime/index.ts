/**
 * Realtime module for Server-Sent Events (SSE) subscriptions.
 *
 * Provides:
 * - SSE message formatting
 * - Topic parsing and subscription matching
 * - Client connection management
 * - Event broadcasting with permission filtering
 * - Hook integration for automatic broadcasts
 *
 * @module realtime
 */

export {
  RealtimeManager,
  type RealtimeClient,
} from "./manager";

export {
  formatSSEMessage,
  formatSSEComment,
  type SSEMessage,
} from "./sse";

export {
  parseTopic,
  matchesSubscription,
  formatTopic,
  type Subscription,
} from "./topics";

export {
  broadcastRecordEvent,
  type RecordAction,
} from "./broadcast";

export { registerRealtimeHooks } from "./hooks";
