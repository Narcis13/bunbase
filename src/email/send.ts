/**
 * Email Send Function
 *
 * Provides the sendEmail function for sending emails with template support.
 * Handles placeholder replacement and structured error responses.
 */

import { isEmailConfigured, getTransport, getConfig } from "./transport";
import { replacePlaceholders } from "./templates";

/**
 * Options for sending an email.
 */
export interface EmailOptions {
  /** Recipient email address */
  to: string;
  /** Email subject line */
  subject: string;
  /** Plain text body (required) */
  text: string;
  /** HTML body (optional, for rich emails) */
  html?: string;
  /** Placeholder values to substitute in text/html */
  placeholders?: Record<string, string>;
}

/**
 * Result of a send email operation.
 */
export interface EmailResult {
  /** Whether the email was sent successfully */
  success: boolean;
  /** Message ID from SMTP server (on success) */
  messageId?: string;
  /** Error message (on failure) */
  error?: string;
}

/**
 * Send an email using the configured SMTP transport.
 *
 * Requires initEmailService() to be called first. If not configured,
 * returns an error result (does not throw).
 *
 * Placeholders in text and html bodies are replaced using {{key}} syntax
 * if the placeholders option is provided.
 *
 * @param options - Email options including recipient, subject, body
 * @returns Result indicating success/failure with messageId or error
 *
 * @example
 * // Basic email
 * const result = await sendEmail({
 *   to: 'user@example.com',
 *   subject: 'Welcome!',
 *   text: 'Thanks for signing up.'
 * });
 *
 * @example
 * // With placeholders
 * const result = await sendEmail({
 *   to: 'user@example.com',
 *   subject: 'Verify your email',
 *   text: 'Click here: {{link}}',
 *   html: '<a href="{{link}}">Verify</a>',
 *   placeholders: { link: 'https://example.com/verify?token=abc123' }
 * });
 *
 * if (result.success) {
 *   console.log('Sent:', result.messageId);
 * } else {
 *   console.error('Failed:', result.error);
 * }
 */
export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  // Check if email service is configured
  if (!isEmailConfigured()) {
    return {
      success: false,
      error: "Email service not configured",
    };
  }

  const transporter = getTransport();
  const config = getConfig();

  // These should never be null after isEmailConfigured() returns true,
  // but TypeScript doesn't know that
  if (!transporter || !config) {
    return {
      success: false,
      error: "Email service not configured",
    };
  }

  // Apply placeholder replacements if provided
  let textContent = options.text;
  let htmlContent = options.html;

  if (options.placeholders) {
    textContent = replacePlaceholders(options.text, options.placeholders);
    if (options.html) {
      htmlContent = replacePlaceholders(options.html, options.placeholders);
    }
  }

  try {
    const info = await transporter.sendMail({
      from: config.from,
      to: options.to,
      subject: options.subject,
      text: textContent,
      html: htmlContent,
    });

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (err) {
    // Extract error message safely - do NOT log the full error object
    // as it may contain credentials in connection details
    const errorMessage =
      err instanceof Error ? err.message : "Unknown error occurred";

    return {
      success: false,
      error: `Failed to send email: ${errorMessage}`,
    };
  }
}
