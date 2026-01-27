/**
 * Email Service Public API
 *
 * Re-exports the public API for the email service.
 * Internal functions (getTransport, getConfig, replacePlaceholders)
 * are intentionally not exported.
 *
 * @example
 * import {
 *   initEmailService,
 *   isEmailConfigured,
 *   sendEmail,
 *   loadSmtpConfig
 * } from './email';
 *
 * // Load config from env/CLI
 * const config = loadSmtpConfig({ host: 'smtp.example.com' });
 *
 * // Initialize if configured
 * if (config) {
 *   initEmailService(config);
 * }
 *
 * // Send emails when ready
 * if (isEmailConfigured()) {
 *   const result = await sendEmail({
 *     to: 'user@example.com',
 *     subject: 'Hello',
 *     text: 'Welcome {{name}}!',
 *     placeholders: { name: 'World' }
 *   });
 * }
 */

// Configuration types and loader
export type { SmtpConfig, SmtpCliValues } from "./config";
export { loadSmtpConfig } from "./config";

// Transport management
export { initEmailService, isEmailConfigured } from "./transport";

// Send function and types
export type { EmailOptions, EmailResult } from "./send";
export { sendEmail } from "./send";
