import { z, type ZodError } from "zod";
import type { Field } from "../types/collection.ts";

/**
 * Build a Zod validator dynamically from field definitions.
 * Does NOT include system fields (id, created_at, updated_at) - those are handled
 * by the records module, not user input.
 *
 * @param fields - Array of field definitions
 * @returns A Zod object schema for validating records
 */
export function buildValidator(fields: Field[]): z.ZodObject<any> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const field of fields) {
    let schema: z.ZodTypeAny;

    switch (field.type) {
      case "text":
        schema = z.string();
        break;
      case "number":
        schema = z.number();
        break;
      case "boolean":
        schema = z.boolean();
        break;
      case "datetime":
        // Accept ISO 8601 strings with or without timezone offset
        schema = z
          .string()
          .datetime({ offset: true })
          .or(z.string().datetime());
        break;
      case "json":
        // Any valid JSON value
        schema = z.unknown();
        break;
      case "relation":
        // ID string of related record
        schema = z.string().min(1, "Relation ID cannot be empty");
        break;
      default:
        schema = z.unknown();
    }

    if (!field.required) {
      schema = schema.optional().nullable();
    }

    shape[field.name] = schema;
  }

  return z.object(shape);
}

/**
 * Validation result type for validateRecord
 */
export type ValidationResult =
  | { success: true; data: Record<string, unknown> }
  | { success: false; errors: ZodError };

/**
 * Validate record data against field definitions.
 *
 * @param fields - Array of field definitions
 * @param data - The data to validate
 * @returns Success with parsed data, or failure with errors
 */
export function validateRecord(
  fields: Field[],
  data: unknown
): ValidationResult {
  const validator = buildValidator(fields);
  const result = validator.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data as Record<string, unknown> };
  } else {
    return { success: false, errors: result.error };
  }
}

/**
 * Format Zod validation errors into human-readable strings.
 *
 * @param errors - ZodError from validation
 * @returns Array of formatted error strings like "{field}: {message}"
 */
export function formatValidationErrors(errors: ZodError): string[] {
  return errors.issues.map((issue) => {
    const path = issue.path.join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}
