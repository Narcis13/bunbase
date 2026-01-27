/**
 * Multipart form data parsing utilities.
 * Uses Bun's native Request.formData() for parsing.
 */

/**
 * Result of parsing a multipart request.
 */
export interface MultipartParseResult {
  /** Regular field data (non-file fields) */
  data: Record<string, unknown>;
  /** File fields mapped to arrays of File objects */
  files: Map<string, File[]>;
}

/**
 * Check if a request contains multipart form data.
 *
 * @param req - The incoming request
 * @returns True if the request is multipart/form-data
 */
export function isMultipartRequest(req: Request): boolean {
  const contentType = req.headers.get("content-type") ?? "";
  return contentType.includes("multipart/form-data");
}

/**
 * Parse multipart form data from a request.
 * Separates regular fields from file fields.
 *
 * File fields are collected into arrays to support multiple files per field.
 * Regular fields are parsed as JSON if possible, otherwise kept as strings.
 *
 * @param req - The incoming request with multipart/form-data
 * @returns Parsed data and files
 */
export async function parseMultipartRequest(
  req: Request
): Promise<MultipartParseResult> {
  const formData = await req.formData();
  const data: Record<string, unknown> = {};
  const files = new Map<string, File[]>();

  for (const [key, value] of formData.entries()) {
    if (value instanceof File) {
      // Skip empty file inputs (browser sends File with size=0 and no name)
      if (value.size === 0 && !value.name) {
        continue;
      }

      // Accumulate files for this field
      const existing = files.get(key) ?? [];
      existing.push(value);
      files.set(key, existing);
    } else {
      // Regular field - try to parse as JSON for complex values
      try {
        data[key] = JSON.parse(value);
      } catch {
        // Not JSON, keep as string
        data[key] = value;
      }
    }
  }

  return { data, files };
}
