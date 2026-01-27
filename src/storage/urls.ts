import type { Field } from "../types/collection";

/**
 * Generate the URL for accessing a file.
 *
 * @param baseUrl - Base URL of the server (e.g., "http://localhost:8090")
 * @param collectionName - Name of the collection
 * @param recordId - ID of the record
 * @param filename - Stored filename
 * @returns Full URL to access the file
 */
export function getFileUrl(
  baseUrl: string,
  collectionName: string,
  recordId: string,
  filename: string
): string {
  return `${baseUrl}/api/files/${collectionName}/${recordId}/${encodeURIComponent(filename)}`;
}

/**
 * Add file URLs to a record response.
 * Transforms file field values from filenames to full URLs.
 *
 * For single-file fields, transforms "filename.jpg" to "http://host/api/files/..."
 * For multi-file fields, transforms ["a.jpg", "b.jpg"] to ["http://...", "http://..."]
 *
 * @param record - The record object
 * @param fields - Field definitions for the collection
 * @param baseUrl - Base URL of the server
 * @param collectionName - Name of the collection
 * @returns Record with file fields transformed to URLs
 */
export function addFileUrls(
  record: Record<string, unknown>,
  fields: Field[],
  baseUrl: string,
  collectionName: string
): Record<string, unknown> {
  const result = { ...record };
  const recordId = result.id as string;

  for (const field of fields) {
    if (field.type !== "file") continue;

    const value = result[field.name];
    if (!value) continue;

    if (Array.isArray(value)) {
      // Multiple files - transform each to URL
      result[field.name] = value.map((filename) =>
        typeof filename === "string"
          ? getFileUrl(baseUrl, collectionName, recordId, filename)
          : filename
      );
    } else if (typeof value === "string") {
      // Single file - transform to URL
      result[field.name] = getFileUrl(baseUrl, collectionName, recordId, value);
    }
  }

  return result;
}

/**
 * Transform multiple records to include file URLs.
 *
 * @param records - Array of records
 * @param fields - Field definitions for the collection
 * @param baseUrl - Base URL of the server
 * @param collectionName - Name of the collection
 * @returns Records with file fields transformed to URLs
 */
export function addFileUrlsToList(
  records: Record<string, unknown>[],
  fields: Field[],
  baseUrl: string,
  collectionName: string
): Record<string, unknown>[] {
  return records.map((record) =>
    addFileUrls(record, fields, baseUrl, collectionName)
  );
}
