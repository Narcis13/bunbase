/**
 * Custom error for password validation failures
 */
export class PasswordValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PasswordValidationError";
  }
}

/**
 * Validate password against rules.
 *
 * Rules:
 * - Must be at least minLength characters (default: 8)
 * - Must contain at least one letter (a-z or A-Z)
 * - Must contain at least one number (0-9)
 *
 * @param password - Password to validate
 * @param minLength - Minimum password length (default: 8)
 * @throws PasswordValidationError if password doesn't meet requirements
 */
export function validatePassword(password: string, minLength: number = 8): void {
  if (!password || typeof password !== "string") {
    throw new PasswordValidationError("Password is required");
  }

  if (password.length < minLength) {
    throw new PasswordValidationError(
      `Password must be at least ${minLength} characters`
    );
  }

  // Basic complexity: at least one letter and one number
  if (!/[a-zA-Z]/.test(password)) {
    throw new PasswordValidationError(
      "Password must contain at least one letter"
    );
  }

  if (!/[0-9]/.test(password)) {
    throw new PasswordValidationError(
      "Password must contain at least one number"
    );
  }
}
