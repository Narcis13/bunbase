# Phase 11: File Uploads - Research

**Researched:** 2026-01-27
**Domain:** File uploads, multipart form data, file storage, file serving
**Confidence:** HIGH

## Summary

This phase implements file upload functionality for BunBase, allowing users to attach files to records. The implementation leverages Bun's native APIs for multipart form data parsing (`Request.formData()`), file writing (`Bun.write()`), and file serving (`Bun.file()` + `Response`). The existing codebase provides patterns for field types, validation, hooks, and authentication that this phase will extend.

Key architectural decisions:

1. **File field type** - A new field type in the schema with options for allowed MIME types, size limits, and max file count
2. **Multipart form data parsing** - Use Bun's native `Request.formData()` to extract files from uploads
3. **Local filesystem storage** - Store files at `{data_dir}/storage/{collection}/{record}/{filename}` following PocketBase conventions
4. **File serving** - New endpoint `GET /api/files/{collection}/{record}/{filename}` with automatic Content-Type detection
5. **Filename sanitization** - Remove dangerous characters and add random suffix (10 chars via nanoid) to prevent collisions and attacks

**Primary recommendation:** Use Bun's native APIs exclusively (no third-party libraries needed). Files are stored with sanitized names plus random suffixes. Validation happens server-side for both MIME type (from Blob.type) and file size. File cleanup on record deletion uses the existing afterDelete hook pattern.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Bun.formData() | Built-in | Parse multipart/form-data | Native API, auto-extracts File objects |
| Bun.write() | Built-in | Write files to disk | Zero-copy when possible, supports Blob |
| Bun.file() | Built-in | Read files for serving | Auto Content-Type, sendfile optimization |
| node:fs/promises | Built-in | mkdir, readdir, rm | Directory operations not in Bun.file |
| nanoid | ^5.0.9 | Random filename suffix | Already in use, URL-safe output |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | ^3.24.0 | File field options validation | Already available |
| path | Built-in | Path manipulation | basename, extname, join |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Bun native | multer | Bun's formData() is native, multer adds complexity |
| Local storage | S3 | Local is simpler, S3 can be added later |
| file-type lib | Blob.type | Blob.type from browser, file-type adds magic byte detection |

**Installation:**
```bash
# No new dependencies required - all functionality is built into Bun
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── storage/
│   ├── files.ts           # NEW: File storage operations
│   ├── files.test.ts
│   ├── sanitize.ts        # NEW: Filename sanitization
│   └── sanitize.test.ts
├── types/
│   └── collection.ts      # Extend with 'file' field type
├── core/
│   ├── validation.ts      # Extend for file field validation
│   └── records.ts         # Extend for file handling in CRUD
└── api/
    └── server.ts          # Add file serving endpoint
```

### Pattern 1: File Field Type Definition
**What:** Schema field type for file attachments with configurable options
**When to use:** Any collection needing file uploads
**Example:**
```typescript
// Source: Existing FieldType pattern extended
export type FieldType =
  | "text"
  | "number"
  | "boolean"
  | "datetime"
  | "json"
  | "relation"
  | "file";  // NEW

export interface FileFieldOptions {
  /** Maximum number of files (1 = single file, >1 = multiple) */
  maxFiles?: number;
  /** Maximum file size in bytes (default: 10MB = 10485760) */
  maxSize?: number;
  /** Allowed MIME types (e.g., ["image/jpeg", "image/png"]) */
  allowedTypes?: string[];
}

// In FieldOptions:
export interface FieldOptions {
  // ... existing options ...
  /** For file fields: upload constraints */
  maxFiles?: number;
  maxSize?: number;
  allowedTypes?: string[];
}
```

### Pattern 2: Multipart Form Data Parsing
**What:** Extract files and JSON data from multipart requests
**When to use:** Record create/update with file uploads
**Example:**
```typescript
// Source: Bun documentation - https://bun.com/docs/guides/http/file-uploads
async function parseMultipartRequest(req: Request): Promise<{
  data: Record<string, unknown>;
  files: Map<string, File | File[]>;
}> {
  const formData = await req.formData();
  const data: Record<string, unknown> = {};
  const files = new Map<string, File | File[]>();

  for (const [key, value] of formData.entries()) {
    if (value instanceof File) {
      // File field - accumulate multiple files per field
      const existing = files.get(key);
      if (existing) {
        if (Array.isArray(existing)) {
          existing.push(value);
        } else {
          files.set(key, [existing, value]);
        }
      } else {
        files.set(key, value);
      }
    } else {
      // Regular field - parse JSON if needed
      try {
        data[key] = JSON.parse(value);
      } catch {
        data[key] = value;
      }
    }
  }

  return { data, files };
}
```

### Pattern 3: File Storage Path Structure
**What:** Consistent path structure for stored files
**When to use:** All file storage operations
**Example:**
```typescript
// Source: PocketBase convention
// Path: {data_dir}/storage/{collection}/{record}/{filename}

function getStoragePath(
  dataDir: string,
  collectionName: string,
  recordId: string
): string {
  return `${dataDir}/storage/${collectionName}/${recordId}`;
}

function getFilePath(
  dataDir: string,
  collectionName: string,
  recordId: string,
  filename: string
): string {
  return `${dataDir}/storage/${collectionName}/${recordId}/${filename}`;
}

// Example paths:
// data/storage/posts/abc123/image_k8f2j9d0l1.png
// data/storage/users/xyz789/avatar_m3n4o5p6q7.jpg
```

### Pattern 4: Filename Sanitization
**What:** Remove dangerous characters and add unique suffix
**When to use:** Before storing any uploaded file
**Example:**
```typescript
// Source: OWASP file upload security guidelines
import { nanoid } from "nanoid";
import path from "path";

function sanitizeFilename(originalName: string): string {
  // Extract extension (lowercase)
  const ext = path.extname(originalName).toLowerCase();

  // Get base name without extension
  let baseName = path.basename(originalName, path.extname(originalName));

  // Remove/replace dangerous characters
  // Keep: letters, numbers, underscore, hyphen, period
  baseName = baseName
    .replace(/[^a-zA-Z0-9_.-]/g, '_')  // Replace dangerous chars
    .replace(/\.+/g, '.')               // Collapse multiple dots
    .replace(/^\.+|\.+$/g, '')          // Trim leading/trailing dots
    .replace(/_+/g, '_')                // Collapse multiple underscores
    .substring(0, 100);                 // Limit length

  // Ensure we have a base name
  if (!baseName) {
    baseName = 'file';
  }

  // Add random suffix (10 chars like PocketBase)
  const suffix = nanoid(10);

  // Combine: {base}_{suffix}{ext}
  return `${baseName}_${suffix}${ext}`;
}

// Examples:
// "My Photo.jpg" -> "My_Photo_k8f2j9d0l1.jpg"
// "../../../etc/passwd" -> "etc_passwd_m3n4o5p6q7"
// "file.name.pdf" -> "file_name_x1y2z3a4b5.pdf"
```

### Pattern 5: File Serving with Access Control
**What:** Serve files with proper Content-Type and optional auth checks
**When to use:** File retrieval endpoint
**Example:**
```typescript
// Source: Bun documentation - https://bun.com/docs/guides/http/stream-file
async function serveFile(
  collectionName: string,
  recordId: string,
  filename: string,
  authContext?: RecordAuthContext
): Promise<Response> {
  // Check record exists and user has view permission
  const record = getRecord(collectionName, recordId, authContext);
  if (!record) {
    return new Response("Not found", { status: 404 });
  }

  // Get file path
  const filePath = getFilePath(DATA_DIR, collectionName, recordId, filename);
  const file = Bun.file(filePath);

  // Check file exists
  if (!(await file.exists())) {
    return new Response("File not found", { status: 404 });
  }

  // Return file with auto-detected Content-Type
  // Bun automatically sets Content-Type based on extension
  return new Response(file);
}

// Route: GET /api/files/:collection/:record/:filename
```

### Pattern 6: File Validation
**What:** Validate file size and MIME type against field options
**When to use:** Before accepting file uploads
**Example:**
```typescript
// Source: OWASP file upload security
interface FileValidationResult {
  valid: boolean;
  error?: string;
}

function validateFile(
  file: File,
  options: FileFieldOptions
): FileValidationResult {
  // Check file size
  const maxSize = options.maxSize ?? 10 * 1024 * 1024; // 10MB default
  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File exceeds maximum size of ${formatBytes(maxSize)}`,
    };
  }

  // Check MIME type if restrictions defined
  if (options.allowedTypes && options.allowedTypes.length > 0) {
    const isAllowed = options.allowedTypes.some(type => {
      if (type.endsWith('/*')) {
        // Wildcard match (e.g., "image/*")
        return file.type.startsWith(type.slice(0, -1));
      }
      return file.type === type;
    });

    if (!isAllowed) {
      return {
        valid: false,
        error: `File type "${file.type}" not allowed`,
      };
    }
  }

  return { valid: true };
}
```

### Pattern 7: File Cleanup Hook
**What:** Delete files when record is deleted
**When to use:** afterDelete hook registration
**Example:**
```typescript
// Source: Existing hook pattern from hooks.ts
import { rm } from "node:fs/promises";

// Register cleanup hook
hooks.on("afterDelete", async (ctx, next) => {
  // Check if collection has file fields
  const fields = getFields(ctx.collection);
  const fileFields = fields.filter(f => f.type === "file");

  if (fileFields.length > 0) {
    // Delete the record's storage directory
    const storagePath = getStoragePath(DATA_DIR, ctx.collection, ctx.id);
    try {
      await rm(storagePath, { recursive: true, force: true });
    } catch (err) {
      console.error(`Failed to delete files for record ${ctx.id}:`, err);
    }
  }

  await next();
});
```

### Anti-Patterns to Avoid
- **Trusting client-provided MIME type:** The `file.type` from FormData comes from the browser's Content-Type header; for high-security scenarios, consider magic byte validation
- **Storing files by original name:** Always sanitize and add unique suffix to prevent collisions and path traversal
- **Serving files without access checks:** If collection has view rules, enforce them for file access
- **Not limiting file size:** Always enforce server-side size limits to prevent DoS
- **Storing files in web-accessible directory:** Use dedicated storage directory outside web root

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Multipart parsing | Manual boundary parsing | req.formData() | Edge cases, encoding, streaming |
| File writing | Manual fs.write | Bun.write() | Zero-copy optimization, handles Blob |
| Content-Type detection | Extension mapping | Bun.file().type | Comprehensive, maintained |
| Path sanitization | Simple regex | Proper basename + sanitize | Path traversal attacks, null bytes |
| Unique filenames | Timestamp | nanoid suffix | Collision resistance |

**Key insight:** Bun provides excellent native APIs for file handling. The main work is integrating with the existing schema/validation/hooks system, not building file handling primitives.

## Common Pitfalls

### Pitfall 1: Path Traversal in Filenames
**What goes wrong:** Attacker uploads file named `../../../etc/cron.d/malicious` and overwrites system files
**Why it happens:** Using original filename without sanitization
**How to avoid:** Extract only basename, remove special characters, add random suffix
**Warning signs:** Filenames containing `..`, `/`, `\`, or null bytes

### Pitfall 2: MIME Type Spoofing
**What goes wrong:** Attacker uploads executable renamed as .jpg
**Why it happens:** Trusting file extension or client-provided Content-Type
**How to avoid:** For sensitive contexts, validate magic bytes; for most cases, extension + Content-Type is sufficient
**Warning signs:** Mismatch between extension and content type

### Pitfall 3: File Size DoS
**What goes wrong:** Attacker uploads extremely large file, fills disk or exhausts memory
**Why it happens:** No server-side size validation
**How to avoid:** Check file.size before writing, enforce per-field and global limits
**Warning signs:** Disk full errors, OOM crashes

### Pitfall 4: Orphaned Files
**What goes wrong:** Files remain on disk after record deletion
**Why it happens:** Missing or failed cleanup hook
**How to avoid:** Use afterDelete hook, handle errors gracefully
**Warning signs:** Storage directory grows but record count doesn't

### Pitfall 5: Race Conditions in Multi-File Upload
**What goes wrong:** Partial upload state - some files saved, record creation fails
**Why it happens:** Not handling errors atomically
**How to avoid:** Save files to temp location first, move on success, cleanup on failure
**Warning signs:** Files exist without corresponding record

### Pitfall 6: File Enumeration
**What goes wrong:** Attacker can guess filenames and access other users' files
**Why it happens:** Predictable filenames, no access control
**How to avoid:** Random suffix in filename, check record view permissions before serving
**Warning signs:** Sequential or guessable file paths

## Code Examples

Verified patterns from official sources and existing codebase:

### File Storage Module
```typescript
// src/storage/files.ts
import { mkdir, rm, readdir } from "node:fs/promises";
import { nanoid } from "nanoid";
import path from "path";

const DEFAULT_MAX_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Get the base storage directory.
 * Defaults to ./data/storage relative to cwd.
 */
export function getStorageDir(): string {
  return process.env.BUNBASE_STORAGE_DIR ?? "./data/storage";
}

/**
 * Get path to a record's file storage directory.
 */
export function getRecordStoragePath(
  collectionName: string,
  recordId: string
): string {
  return path.join(getStorageDir(), collectionName, recordId);
}

/**
 * Ensure the storage directory exists for a record.
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
 * Sanitize a filename for safe storage.
 * - Removes path components (prevents traversal)
 * - Removes dangerous characters
 * - Adds random suffix for uniqueness
 * - Preserves original extension
 */
export function sanitizeFilename(originalName: string): string {
  // Get extension (lowercase)
  const ext = path.extname(originalName).toLowerCase();

  // Get base name only (removes any directory path)
  let baseName = path.basename(originalName, path.extname(originalName));

  // Remove/replace dangerous characters
  baseName = baseName
    .replace(/[^a-zA-Z0-9_.-]/g, '_')
    .replace(/\.+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .replace(/_+/g, '_')
    .substring(0, 100);

  if (!baseName) {
    baseName = 'file';
  }

  // Add random suffix (10 chars like PocketBase)
  const suffix = nanoid(10);

  return `${baseName}_${suffix}${ext}`;
}

/**
 * Save a file to storage and return the stored filename.
 */
export async function saveFile(
  collectionName: string,
  recordId: string,
  file: File
): Promise<string> {
  const dir = await ensureRecordStorageDir(collectionName, recordId);
  const filename = sanitizeFilename(file.name);
  const filePath = path.join(dir, filename);

  await Bun.write(filePath, file);

  return filename;
}

/**
 * Delete a specific file from storage.
 */
export async function deleteFile(
  collectionName: string,
  recordId: string,
  filename: string
): Promise<void> {
  const filePath = path.join(
    getRecordStoragePath(collectionName, recordId),
    filename
  );
  await rm(filePath, { force: true });
}

/**
 * Delete all files for a record.
 */
export async function deleteRecordFiles(
  collectionName: string,
  recordId: string
): Promise<void> {
  const dir = getRecordStoragePath(collectionName, recordId);
  await rm(dir, { recursive: true, force: true });
}

/**
 * List all files for a record.
 */
export async function listRecordFiles(
  collectionName: string,
  recordId: string
): Promise<string[]> {
  const dir = getRecordStoragePath(collectionName, recordId);
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}
```

### File Validation
```typescript
// src/storage/validation.ts
import type { FileFieldOptions } from "../types/collection";

export interface FileValidationError {
  field: string;
  file: string;
  message: string;
}

export interface FileValidationResult {
  valid: boolean;
  errors: FileValidationError[];
}

const DEFAULT_MAX_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Format bytes to human readable string.
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Validate a single file against field options.
 */
export function validateFile(
  fieldName: string,
  file: File,
  options: FileFieldOptions = {}
): FileValidationError | null {
  // Check size
  const maxSize = options.maxSize ?? DEFAULT_MAX_SIZE;
  if (file.size > maxSize) {
    return {
      field: fieldName,
      file: file.name,
      message: `File "${file.name}" exceeds maximum size of ${formatBytes(maxSize)}`,
    };
  }

  // Check MIME type
  if (options.allowedTypes && options.allowedTypes.length > 0) {
    const isAllowed = options.allowedTypes.some(type => {
      if (type.endsWith('/*')) {
        return file.type.startsWith(type.slice(0, -1));
      }
      return file.type === type;
    });

    if (!isAllowed) {
      return {
        field: fieldName,
        file: file.name,
        message: `File "${file.name}" type "${file.type}" is not allowed. Allowed: ${options.allowedTypes.join(', ')}`,
      };
    }
  }

  return null;
}

/**
 * Validate all files for a field.
 */
export function validateFieldFiles(
  fieldName: string,
  files: File[],
  options: FileFieldOptions = {}
): FileValidationError[] {
  const errors: FileValidationError[] = [];

  // Check max files count
  const maxFiles = options.maxFiles ?? 1;
  if (files.length > maxFiles) {
    errors.push({
      field: fieldName,
      file: '',
      message: `Field "${fieldName}" allows maximum ${maxFiles} file(s), got ${files.length}`,
    });
  }

  // Validate each file
  for (const file of files) {
    const error = validateFile(fieldName, file, options);
    if (error) {
      errors.push(error);
    }
  }

  return errors;
}
```

### File URL Generation Helper
```typescript
// src/storage/urls.ts

/**
 * Generate the URL for accessing a file.
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
 */
export function addFileUrls(
  record: Record<string, unknown>,
  fields: Field[],
  baseUrl: string,
  collectionName: string
): Record<string, unknown> {
  const result = { ...record };

  for (const field of fields) {
    if (field.type !== 'file') continue;

    const value = result[field.name];
    if (!value) continue;

    const recordId = result.id as string;

    if (Array.isArray(value)) {
      // Multiple files - generate URLs for each
      result[field.name] = value.map(filename =>
        getFileUrl(baseUrl, collectionName, recordId, filename)
      );
    } else if (typeof value === 'string') {
      // Single file
      result[field.name] = getFileUrl(baseUrl, collectionName, recordId, value);
    }
  }

  return result;
}
```

### Multipart Request Handling
```typescript
// In src/api/server.ts

/**
 * Parse multipart form data from request.
 * Separates regular fields from file fields.
 */
async function parseMultipartRequest(req: Request): Promise<{
  data: Record<string, unknown>;
  files: Map<string, File[]>;
}> {
  const formData = await req.formData();
  const data: Record<string, unknown> = {};
  const files = new Map<string, File[]>();

  for (const [key, value] of formData.entries()) {
    if (value instanceof File) {
      // Skip empty file inputs
      if (value.size === 0 && !value.name) continue;

      const existing = files.get(key) ?? [];
      existing.push(value);
      files.set(key, existing);
    } else {
      // Try to parse as JSON for complex values
      try {
        data[key] = JSON.parse(value);
      } catch {
        data[key] = value;
      }
    }
  }

  return { data, files };
}

/**
 * Check if request is multipart.
 */
function isMultipartRequest(req: Request): boolean {
  const contentType = req.headers.get('content-type') ?? '';
  return contentType.includes('multipart/form-data');
}
```

### File Serving Endpoint
```typescript
// In src/api/server.ts route definitions

"/api/files/:collection/:record/:filename": {
  GET: async (req) => {
    try {
      const { collection, record, filename } = req.params;

      // Optional: Check view permissions if collection has rules
      const user = await optionalUser(req);
      const authContext = { isAdmin: false, user };

      // Verify record exists and user can view it
      const recordData = getRecord(collection, record, authContext);
      if (!recordData) {
        return errorResponse("Not found", 404);
      }

      // Get file path
      const filePath = path.join(
        getStorageDir(),
        collection,
        record,
        filename
      );

      const file = Bun.file(filePath);

      // Check file exists
      if (!(await file.exists())) {
        return errorResponse("File not found", 404);
      }

      // Return file - Bun auto-sets Content-Type from extension
      return new Response(file, {
        headers: {
          // Optional: Add Content-Disposition for download
          // 'Content-Disposition': `inline; filename="${filename}"`
        }
      });
    } catch (error) {
      const err = error as Error;
      if (err.message === 'Access denied') {
        return errorResponse(err.message, 403);
      }
      return errorResponse(err.message, mapErrorToStatus(err));
    }
  },
},
```

### File Field in Record Create/Update
```typescript
// Extend createRecordWithHooks to handle files

export async function createRecordWithFiles(
  collectionName: string,
  data: Record<string, unknown>,
  files: Map<string, File[]>,
  hooks: HookManager,
  request?: Request,
  authContext?: RecordAuthContext
): Promise<Record<string, unknown>> {
  // Get file fields
  const fields = getFields(collectionName);
  const fileFields = fields.filter(f => f.type === 'file');

  // Validate files
  const validationErrors: FileValidationError[] = [];
  for (const field of fileFields) {
    const fieldFiles = files.get(field.name) ?? [];
    const options = field.options as FileFieldOptions;
    const errors = validateFieldFiles(field.name, fieldFiles, options);
    validationErrors.push(...errors);
  }

  if (validationErrors.length > 0) {
    throw new Error(`File validation failed: ${validationErrors.map(e => e.message).join(', ')}`);
  }

  // Create the record first (to get ID)
  const record = await createRecordWithHooks(
    collectionName,
    data,
    hooks,
    request,
    authContext
  );

  // Save files and update record with filenames
  const fileUpdates: Record<string, string | string[]> = {};

  for (const field of fileFields) {
    const fieldFiles = files.get(field.name) ?? [];
    if (fieldFiles.length === 0) continue;

    const savedFilenames: string[] = [];
    for (const file of fieldFiles) {
      const filename = await saveFile(collectionName, record.id as string, file);
      savedFilenames.push(filename);
    }

    // Store as array if maxFiles > 1, else single string
    const options = field.options as FileFieldOptions;
    const maxFiles = options?.maxFiles ?? 1;
    fileUpdates[field.name] = maxFiles > 1 ? savedFilenames : savedFilenames[0];
  }

  // Update record with file references
  if (Object.keys(fileUpdates).length > 0) {
    return updateRecord(collectionName, record.id as string, fileUpdates);
  }

  return record;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| multer/formidable | Native formData() | Bun 1.0+ | Zero dependencies, native streaming |
| fs.writeFile | Bun.write() | Bun 1.0+ | Zero-copy optimization |
| mime package | Bun.file().type | Bun 1.0+ | Auto Content-Type detection |
| express.static | Bun.file() + Response | Bun 1.0+ | sendfile() optimization |

**Deprecated/outdated:**
- Third-party multipart parsers (multer, formidable, busboy) - Bun has native support
- Manual MIME type lookup tables - Bun.file() handles this
- Manual Content-Length/Content-Type headers - Bun auto-sets

## Open Questions

Things that couldn't be fully resolved:

1. **S3-compatible storage?**
   - What we know: PocketBase supports S3 backends
   - What's unclear: Not in v0.2 requirements
   - Recommendation: Design abstraction layer, implement local first, S3 later

2. **Image thumbnails/processing?**
   - What we know: PocketBase supports thumb query parameter
   - What's unclear: Not in current requirements (FILE-01 to FILE-10)
   - Recommendation: Defer to future phase, note in extensibility design

3. **Protected files with token auth?**
   - What we know: PocketBase has short-lived file tokens for protected files
   - What's unclear: Current requirements use record view rules
   - Recommendation: Use existing record view rule check for now

4. **Max total storage per record/collection?**
   - What we know: Per-file size limit is specified (FILE-06)
   - What's unclear: Total storage quota not mentioned
   - Recommendation: Implement per-file limit first, quota system later

## Sources

### Primary (HIGH confidence)
- Bun FormData: https://bun.com/docs/guides/http/file-uploads - Native file upload handling
- Bun File I/O: https://bun.com/docs/runtime/file-io - Bun.file(), Bun.write() APIs
- Bun File Streaming: https://bun.com/docs/guides/http/stream-file - Response with Bun.file()
- Existing codebase: src/types/collection.ts, src/core/validation.ts - Field type patterns

### Secondary (MEDIUM confidence)
- PocketBase Files: https://pocketbase.io/docs/files-handling/ - Storage structure, filename format
- PocketBase API Files: https://pocketbase.io/docs/api-files/ - File serving endpoint pattern
- OWASP File Upload: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html - Security practices
- MDN MIME Types: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/MIME_types/Common_types - MIME type reference

### Tertiary (LOW confidence)
- WebSearch results for path traversal prevention (multiple sources agree on approach)
- WebSearch results for Bun multipart issues (noted as potential edge cases)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Using Bun native APIs, no new dependencies
- Architecture: HIGH - Extending existing patterns (fields, validation, hooks)
- Security (sanitization, validation): HIGH - OWASP guidance, well-documented
- File serving: HIGH - Bun docs clear on Response + Bun.file()
- Multipart edge cases: MEDIUM - Some reported issues, but core API stable

**Research date:** 2026-01-27
**Valid until:** 2026-02-27 (stable domain, well-established patterns)
