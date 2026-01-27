/**
 * SMTP Configuration Types and Loader
 *
 * Provides configuration types and loading utilities for the email service.
 * Supports CLI flags with env var fallback, enabling graceful degradation
 * when SMTP is not configured.
 */

/**
 * Complete SMTP configuration with all required fields.
 */
export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  secure: boolean; // true for port 465, false for 587
  from: string; // Default sender address
}

/**
 * Partial SMTP values from CLI parsing.
 * All fields optional since CLI args are optional.
 */
export interface SmtpCliValues {
  host?: string;
  port?: string;
  user?: string;
  pass?: string;
  from?: string;
}

/**
 * Load SMTP configuration from CLI values and environment variables.
 *
 * CLI flags take precedence over environment variables.
 * Returns null if required fields (host, user, pass) are missing,
 * indicating email service should be disabled.
 *
 * @param cliValues - Partial configuration from CLI arguments
 * @returns Complete SmtpConfig or null if email should be disabled
 *
 * @example
 * // From CLI values
 * const config = loadSmtpConfig({ host: 'smtp.example.com', port: '587' });
 *
 * @example
 * // From environment variables only
 * const config = loadSmtpConfig({});
 */
export function loadSmtpConfig(cliValues: SmtpCliValues): SmtpConfig | null {
  // CLI values take precedence over env vars
  const host = cliValues.host || Bun.env.SMTP_HOST;
  const portStr = cliValues.port || Bun.env.SMTP_PORT;
  const user = cliValues.user || Bun.env.SMTP_USER;
  const pass = cliValues.pass || Bun.env.SMTP_PASS;
  const from = cliValues.from || Bun.env.SMTP_FROM;

  // Return null if required fields are missing (email is optional)
  if (!host || !user || !pass) {
    return null;
  }

  // Parse port with default of 587 (STARTTLS)
  const port = portStr ? parseInt(portStr, 10) : 587;

  // Auto-detect secure mode based on port
  // Port 465 uses implicit TLS, other ports use STARTTLS
  const secure = port === 465;

  // Default from address to user if not provided
  const fromAddress = from || user;

  return {
    host,
    port,
    user,
    pass,
    secure,
    from: fromAddress,
  };
}
