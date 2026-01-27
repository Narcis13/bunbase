/**
 * Email Transport Management
 *
 * Provides nodemailer transport initialization and state management.
 * Transport is created lazily on initialization and verified on first send.
 */

import nodemailer, { Transporter } from "nodemailer";
import type { SmtpConfig } from "./config";

/**
 * Module state - holds the transport and configuration
 * These are private to this module and only accessible via exported functions
 */
let transporter: Transporter | null = null;
let config: SmtpConfig | null = null;

/**
 * Initialize the email service with SMTP configuration.
 *
 * Creates a nodemailer transporter with the provided configuration.
 * Does NOT verify the connection immediately - verification happens
 * lazily on first send (per research recommendation).
 *
 * @param smtpConfig - Complete SMTP configuration
 *
 * @example
 * initEmailService({
 *   host: 'smtp.example.com',
 *   port: 587,
 *   user: 'user@example.com',
 *   pass: 'password',
 *   secure: false,
 *   from: 'noreply@example.com'
 * });
 */
export function initEmailService(smtpConfig: SmtpConfig): void {
  // Store configuration for later use (e.g., from address)
  config = smtpConfig;

  // Create nodemailer transporter
  transporter = nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    auth: {
      user: smtpConfig.user,
      pass: smtpConfig.pass,
    },
  });
}

/**
 * Check if the email service has been configured.
 *
 * @returns true if initEmailService() has been called successfully
 *
 * @example
 * if (isEmailConfigured()) {
 *   await sendEmail({ to: '...', subject: '...', text: '...' });
 * } else {
 *   console.log('Email not configured - skipping notification');
 * }
 */
export function isEmailConfigured(): boolean {
  return config !== null && transporter !== null;
}

/**
 * Get the nodemailer transporter (internal use only).
 *
 * Used by send.ts to send emails. Not exported in public API.
 *
 * @returns The nodemailer transporter or null if not initialized
 */
export function getTransport(): Transporter | null {
  return transporter;
}

/**
 * Get the stored SMTP configuration (internal use only).
 *
 * Used by send.ts to get the from address. Not exported in public API.
 *
 * @returns The SMTP configuration or null if not initialized
 */
export function getConfig(): SmtpConfig | null {
  return config;
}
