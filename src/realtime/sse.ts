/**
 * SSE (Server-Sent Events) message formatting utilities.
 *
 * Follows the SSE specification for message formatting:
 * - event: {event_name}\n (optional)
 * - id: {event_id}\n (optional)
 * - retry: {milliseconds}\n (optional)
 * - data: {data}\n (required)
 * - Final newline to complete message: \n
 *
 * @module realtime/sse
 */

/**
 * SSE message structure.
 */
export interface SSEMessage {
  /** Event type name (optional) */
  event?: string;
  /** Message data - will be JSON stringified */
  data: unknown;
  /** Event ID for client reconnection (optional) */
  id?: string;
  /** Retry interval in milliseconds (optional) */
  retry?: number;
}

/**
 * Format an SSE message according to the specification.
 *
 * @param message - The message to format
 * @returns Formatted SSE message string ending with \n\n
 *
 * @example
 * // Basic message
 * formatSSEMessage({ data: { hello: "world" } })
 * // Returns: "data: {\"hello\":\"world\"}\n\n"
 *
 * @example
 * // Message with event name
 * formatSSEMessage({ event: "update", data: { id: 1 } })
 * // Returns: "event: update\ndata: {\"id\":1}\n\n"
 *
 * @example
 * // Full message
 * formatSSEMessage({ event: "create", id: "abc123", retry: 5000, data: { created: true } })
 * // Returns: "event: create\nid: abc123\nretry: 5000\ndata: {\"created\":true}\n\n"
 */
export function formatSSEMessage(message: SSEMessage): string {
  const lines: string[] = [];

  // Event field (optional)
  if (message.event !== undefined) {
    lines.push(`event: ${message.event}`);
  }

  // ID field (optional)
  if (message.id !== undefined) {
    lines.push(`id: ${message.id}`);
  }

  // Retry field (optional)
  if (message.retry !== undefined) {
    lines.push(`retry: ${message.retry}`);
  }

  // Data field (required) - JSON stringify the data
  const dataStr = JSON.stringify(message.data);
  lines.push(`data: ${dataStr}`);

  // Join with newlines and add final double newline
  return lines.join("\n") + "\n\n";
}

/**
 * Format an SSE comment (keep-alive).
 *
 * Comments are lines starting with a colon and are ignored by clients.
 * They're typically used for keep-alive purposes.
 *
 * @param comment - The comment text
 * @returns Formatted SSE comment string ending with \n\n
 *
 * @example
 * formatSSEComment("keep-alive")
 * // Returns: ": keep-alive\n\n"
 */
export function formatSSEComment(comment: string): string {
  return `: ${comment}\n\n`;
}
