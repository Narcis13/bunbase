import type { FieldOptions } from "../types/collection";

/** Default maximum file size: 10MB */
const DEFAULT_MAX_SIZE = 10 * 1024 * 1024;

/** Default maximum files per field */
const DEFAULT_MAX_FILES = 1;

/**
 * Error information for a file validation failure.
 */
export interface FileValidationError {
  /** Field name where the error occurred */
  field: string;
  /** Original filename (empty string for field-level errors) */
  file: string;
  /** Human-readable error message */
  message: string;
}

/**
 * Format bytes to human-readable string.
 *
 * @param bytes - Number of bytes
 * @returns Formatted string (e.g., "10.5 MB")
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Check if a MIME type matches an allowed type pattern.
 * Supports exact matches and wildcards (e.g., "image/*").
 *
 * @param fileType - The file's MIME type
 * @param allowedType - The allowed type pattern
 * @returns True if the type matches
 */
function matchesMimeType(fileType: string, allowedType: string): boolean {
  if (allowedType.endsWith("/*")) {
    // Wildcard match (e.g., "image/*" matches "image/jpeg")
    const prefix = allowedType.slice(0, -1); // "image/"
    return fileType.startsWith(prefix);
  }
  return fileType === allowedType;
}

/**
 * Validate a single file against field options.
 *
 * @param fieldName - Name of the field for error messages
 * @param file - File object to validate
 * @param options - Field options with validation constraints
 * @returns Error object if validation fails, null if valid
 */
export function validateFile(
  fieldName: string,
  file: File,
  options: FieldOptions = {}
): FileValidationError | null {
  // Check file size
  const maxSize = options.maxSize ?? DEFAULT_MAX_SIZE;
  if (file.size > maxSize) {
    return {
      field: fieldName,
      file: file.name,
      message: `File "${file.name}" exceeds maximum size of ${formatBytes(maxSize)}`,
    };
  }

  // Check MIME type if restrictions defined
  if (options.allowedTypes && options.allowedTypes.length > 0) {
    const isAllowed = options.allowedTypes.some((type) =>
      matchesMimeType(file.type, type)
    );

    if (!isAllowed) {
      return {
        field: fieldName,
        file: file.name,
        message: `File "${file.name}" type "${file.type}" is not allowed. Allowed: ${options.allowedTypes.join(", ")}`,
      };
    }
  }

  return null;
}

/**
 * Validate all files for a field.
 * Checks file count limit, then validates each individual file.
 *
 * @param fieldName - Name of the field for error messages
 * @param files - Array of File objects to validate
 * @param options - Field options with validation constraints
 * @returns Array of error objects (empty if all valid)
 */
export function validateFieldFiles(
  fieldName: string,
  files: File[],
  options: FieldOptions = {}
): FileValidationError[] {
  const errors: FileValidationError[] = [];

  // Check max files count
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  if (files.length > maxFiles) {
    errors.push({
      field: fieldName,
      file: "",
      message: `Field "${fieldName}" allows maximum ${maxFiles} file(s), received ${files.length}`,
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

/**
 * Format file validation errors into a single error message.
 *
 * @param errors - Array of validation errors
 * @returns Combined error message
 */
export function formatFileErrors(errors: FileValidationError[]): string {
  return errors.map((e) => e.message).join("; ");
}
