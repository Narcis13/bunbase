import { mkdir, rm, readdir } from "node:fs/promises";
import path from "path";
import { sanitizeFilename } from "./sanitize";

/** Default storage directory relative to cwd */
const DEFAULT_STORAGE_DIR = "./data/storage";

/**
 * Get the base storage directory.
 * Can be overridden via BUNBASE_STORAGE_DIR environment variable.
 */
export function getStorageDir(): string {
  return process.env.BUNBASE_STORAGE_DIR ?? DEFAULT_STORAGE_DIR;
}

/**
 * Get path to a record's file storage directory.
 * Structure: {storageDir}/{collectionName}/{recordId}/
 */
export function getRecordStoragePath(
  collectionName: string,
  recordId: string
): string {
  return path.join(getStorageDir(), collectionName, recordId);
}

/**
 * Get path to a specific file.
 */
export function getFilePath(
  collectionName: string,
  recordId: string,
  filename: string
): string {
  return path.join(getRecordStoragePath(collectionName, recordId), filename);
}

/**
 * Ensure the storage directory exists for a record.
 * Creates parent directories recursively if needed.
 *
 * @returns The created directory path
 */
export async function ensureRecordStorageDir(
  collectionName: string,
  recordId: string
): Promise<string> {
  const dir = getRecordStoragePath(collectionName, recordId);
  await mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Save a file to storage and return the stored filename.
 * The filename is sanitized and given a unique suffix.
 *
 * @param collectionName - Collection the record belongs to
 * @param recordId - ID of the record
 * @param file - File object from FormData
 * @returns The sanitized filename used for storage
 */
export async function saveFile(
  collectionName: string,
  recordId: string,
  file: File
): Promise<string> {
  const dir = await ensureRecordStorageDir(collectionName, recordId);
  const filename = sanitizeFilename(file.name);
  const filePath = path.join(dir, filename);

  // Bun.write handles File/Blob directly with zero-copy optimization
  await Bun.write(filePath, file);

  return filename;
}

/**
 * Delete a specific file from storage.
 * Does not throw if file doesn't exist (idempotent).
 */
export async function deleteFile(
  collectionName: string,
  recordId: string,
  filename: string
): Promise<void> {
  const filePath = getFilePath(collectionName, recordId, filename);
  await rm(filePath, { force: true });
}

/**
 * Delete all files for a record (removes the entire record directory).
 * Does not throw if directory doesn't exist (idempotent).
 */
export async function deleteRecordFiles(
  collectionName: string,
  recordId: string
): Promise<void> {
  const dir = getRecordStoragePath(collectionName, recordId);
  await rm(dir, { recursive: true, force: true });
}

/**
 * List all files stored for a record.
 * Returns empty array if directory doesn't exist.
 */
export async function listRecordFiles(
  collectionName: string,
  recordId: string
): Promise<string[]> {
  const dir = getRecordStoragePath(collectionName, recordId);
  try {
    return await readdir(dir);
  } catch {
    // Directory doesn't exist - return empty array
    return [];
  }
}

/**
 * Check if a file exists in storage.
 */
export async function fileExists(
  collectionName: string,
  recordId: string,
  filename: string
): Promise<boolean> {
  const filePath = getFilePath(collectionName, recordId, filename);
  const file = Bun.file(filePath);
  return file.exists();
}
