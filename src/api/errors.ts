/**
 * Field-level validation error matching PocketBase format.
 */
export interface ValidationError {
  code: string;
  message: string;
}

/**
 * Base API error class producing PocketBase-compatible JSON responses.
 * All API errors thrown from route handlers should extend this class.
 *
 * @example
 * throw new ApiError(400, 'Invalid input', { email: { code: 'invalid', message: 'Email is invalid' } });
 */
export class ApiError extends Error {
  /**
   * HTTP status code for this error.
   */
  public readonly code: number;

  /**
   * Field-level validation errors, keyed by field name.
   */
  public readonly data: Record<string, ValidationError>;

  constructor(
    code: number,
    message: string,
    data: Record<string, ValidationError> = {}
  ) {
    super(message);
    this.code = code;
    this.data = data;
    this.name = 'ApiError';
    // Ensure prototype chain is correct for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Convert to JSON response format matching PocketBase API.
   * Returns { code, message, data } structure.
   */
  toJSON(): { code: number; message: string; data: Record<string, ValidationError> } {
    return {
      code: this.code,
      message: this.message,
      data: this.data,
    };
  }

  /**
   * Convert to Response object with correct HTTP status.
   */
  toResponse(): Response {
    return Response.json(this.toJSON(), { status: this.code });
  }
}

/**
 * 400 Bad Request - invalid input, malformed JSON, missing required fields.
 */
export class BadRequestError extends ApiError {
  constructor(message = 'Bad request', data?: Record<string, ValidationError>) {
    super(400, message, data);
    this.name = 'BadRequestError';
  }
}

/**
 * 401 Unauthorized - missing or invalid authentication.
 */
export class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized') {
    super(401, message);
    this.name = 'UnauthorizedError';
  }
}

/**
 * 403 Forbidden - authenticated but insufficient permissions.
 */
export class ForbiddenError extends ApiError {
  constructor(message = 'Forbidden') {
    super(403, message);
    this.name = 'ForbiddenError';
  }
}

/**
 * 404 Not Found - resource doesn't exist.
 */
export class NotFoundError extends ApiError {
  constructor(message = 'Not found') {
    super(404, message);
    this.name = 'NotFoundError';
  }
}

/**
 * 409 Conflict - resource already exists (duplicate).
 */
export class ConflictError extends ApiError {
  constructor(message = 'Conflict') {
    super(409, message);
    this.name = 'ConflictError';
  }
}

/**
 * 422 Validation Failed - request understood but validation failed.
 * Use data parameter to provide field-level error details.
 */
export class ValidationFailedError extends ApiError {
  constructor(message = 'Validation failed', data: Record<string, ValidationError> = {}) {
    super(422, message, data);
    this.name = 'ValidationFailedError';
  }
}

/**
 * Check if running in development mode.
 * Returns true if NODE_ENV is 'development' or BUNBASE_DEV is 'true'.
 */
function isDevelopment(): boolean {
  return Bun.env.NODE_ENV === 'development' || Bun.env.BUNBASE_DEV === 'true';
}

/**
 * Convert any error to an API response.
 * ApiError instances are converted directly; other errors become 500s.
 *
 * In production, internal error details are hidden.
 * In development, error.message is included for debugging.
 *
 * @param error - The error to convert
 * @returns Response with appropriate status and JSON body
 */
export function handleApiError(error: unknown): Response {
  // Known ApiError - return as-is
  if (error instanceof ApiError) {
    return error.toResponse();
  }

  // Log unexpected errors
  console.error('Unhandled error:', error);

  // Return generic 500 (hide details in production)
  const message = isDevelopment() && error instanceof Error
    ? error.message
    : 'Internal server error';

  return Response.json({
    code: 500,
    message,
    data: {},
  }, { status: 500 });
}
