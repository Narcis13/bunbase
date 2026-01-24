import { nanoid } from "nanoid";

/**
 * Generate a unique ID for records.
 * Uses nanoid which produces 21-character URL-safe strings by default.
 * Same collision resistance as UUID but 40% shorter.
 */
export function generateId(): string {
  return nanoid();
}
