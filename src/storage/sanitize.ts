import { nanoid } from "nanoid";
import path from "path";

/**
 * Sanitize a filename for safe storage.
 * - Removes path components (prevents traversal attacks)
 * - Removes dangerous characters
 * - Adds random suffix for uniqueness
 * - Preserves original extension (lowercase)
 *
 * @param originalName - The original filename from upload
 * @returns Sanitized filename with random suffix
 */
export function sanitizeFilename(originalName: string): string {
  // Normalize Windows backslashes to forward slashes for cross-platform path handling
  const normalized = originalName.replace(/\\/g, "/");

  // Get extension (lowercase)
  const ext = path.extname(normalized).toLowerCase();

  // Get base name only (removes any directory path - prevents traversal)
  let baseName = path.basename(normalized, path.extname(normalized));

  // Remove/replace dangerous characters
  // Keep: letters, numbers, underscore, hyphen
  baseName = baseName
    .replace(/[^a-zA-Z0-9_-]/g, "_") // Replace dangerous chars with underscore
    .replace(/_+/g, "_") // Collapse multiple underscores
    .replace(/^_+|_+$/g, "") // Trim leading/trailing underscores
    .substring(0, 100); // Limit base name length

  // Ensure we have a base name
  if (!baseName) {
    baseName = "file";
  }

  // Add random suffix (10 chars like PocketBase)
  const suffix = nanoid(10);

  return `${baseName}_${suffix}${ext}`;
}
