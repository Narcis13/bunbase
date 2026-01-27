/**
 * Topic parsing and subscription matching utilities for realtime subscriptions.
 * Follows PocketBase protocol for topic format: "collection/*" or "collection/recordId"
 */

/**
 * Represents a parsed subscription with collection and recordId.
 * Note: This interface will be shared with manager.ts when that module is created.
 */
export interface Subscription {
  collection: string;
  recordId: string | "*";
}

/**
 * Regex pattern for valid topic formats.
 * - Collection: starts with letter, followed by alphanumeric or underscore
 * - RecordId: either "*" for wildcard or alphanumeric nanoid
 */
const TOPIC_REGEX = /^([a-zA-Z][a-zA-Z0-9_]*)\/(\*|[a-zA-Z0-9]+)$/;

/**
 * Parse a topic string into a Subscription object.
 *
 * Valid formats:
 * - "collection/*" - wildcard subscription for all records in collection
 * - "collection/recordId" - specific record subscription
 *
 * @param topic - The topic string to parse
 * @returns Subscription object if valid, null if invalid
 *
 * @example
 * parseTopic("posts/*") // { collection: "posts", recordId: "*" }
 * parseTopic("posts/abc123") // { collection: "posts", recordId: "abc123" }
 * parseTopic("invalid") // null
 */
export function parseTopic(topic: string): Subscription | null {
  const match = topic.match(TOPIC_REGEX);
  if (!match) {
    return null;
  }

  return {
    collection: match[1],
    recordId: match[2],
  };
}

/**
 * Check if a subscription matches a given collection and recordId.
 *
 * Matching rules:
 * - Collection must match exactly
 * - If subscription has wildcard recordId ("*"), matches any record in collection
 * - Otherwise, recordId must match exactly
 *
 * @param sub - The subscription to check
 * @param collection - The collection name to match against
 * @param recordId - The record ID to match against
 * @returns true if subscription matches, false otherwise
 *
 * @example
 * matchesSubscription({ collection: "posts", recordId: "*" }, "posts", "abc") // true
 * matchesSubscription({ collection: "posts", recordId: "abc" }, "posts", "abc") // true
 * matchesSubscription({ collection: "posts", recordId: "abc" }, "posts", "xyz") // false
 */
export function matchesSubscription(
  sub: Subscription,
  collection: string,
  recordId: string
): boolean {
  // Collection must match
  if (sub.collection !== collection) {
    return false;
  }

  // Wildcard matches all records
  if (sub.recordId === "*") {
    return true;
  }

  // Specific recordId must match exactly
  return sub.recordId === recordId;
}

/**
 * Format a collection and recordId into a topic string.
 *
 * @param collection - The collection name
 * @param recordId - The record ID or "*" for wildcard
 * @returns Formatted topic string in "collection/recordId" format
 *
 * @example
 * formatTopic("posts", "*") // "posts/*"
 * formatTopic("posts", "abc123") // "posts/abc123"
 */
export function formatTopic(collection: string, recordId: string | "*"): string {
  return `${collection}/${recordId}`;
}
