# Phase 9: Email Service - Research

**Researched:** 2026-01-27
**Domain:** SMTP Email Sending / Transactional Email
**Confidence:** HIGH

## Summary

Phase 9 implements a transactional email service that enables BunBase to send emails for authentication flows (verification, password reset) and custom developer-defined hooks. The research focused on identifying the best approach for SMTP email sending in the Bun runtime, configuration patterns consistent with existing BunBase CLI patterns, and simple template placeholder handling.

The recommended approach is to use **Nodemailer** for SMTP transport. Nodemailer is the established, battle-tested solution with zero runtime dependencies that has official Bun compatibility since v0.6.13. While Bun does not have native SMTP support (feature request remains open since 2022), Nodemailer provides a complete, well-maintained solution that handles low-level SMTP protocol details.

For template placeholders, a simple **mustache-style `{{placeholder}}`** replacement is recommended, as this aligns with the requirements (EMAIL-03) and avoids unnecessary complexity. No templating library is needed - a simple string replacement function suffices.

**Primary recommendation:** Use Nodemailer for SMTP transport with CLI flags + env var configuration pattern matching existing `--port`/`--db` conventions. Implement simple `{{key}}` placeholder replacement without external templating dependencies.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| nodemailer | ^7.0.12 | SMTP email transport | Zero dependencies, official Bun support, 9600+ npm dependents, MIT license |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none needed) | - | Template placeholders | Simple regex replacement for `{{token}}` patterns |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| nodemailer | @upyo/smtp | Upyo is newer, cross-runtime focused but less battle-tested |
| nodemailer | Native SMTP | Not available - Bun feature request #1652 still open |
| nodemailer | Email API (Resend, SendGrid) | Adds vendor dependency, requires external accounts |

**Installation:**
```bash
bun install nodemailer
bun install --dev @types/nodemailer
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  email/
    config.ts        # SMTP configuration types and loading
    transport.ts     # Nodemailer transport creation and management
    send.ts          # sendEmail() function with template support
    templates.ts     # Template placeholder replacement utilities
    index.ts         # Re-exports public API
```

### Pattern 1: Configuration via CLI Flags + Environment Variables
**What:** SMTP configuration follows existing BunBase patterns - CLI flags take precedence over environment variables, with sensible defaults.
**When to use:** All configuration that users need to customize at runtime.
**Example:**
```typescript
// Source: Existing BunBase cli.ts pattern
interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  secure: boolean;  // true for port 465, false for 587
  from: string;     // Default sender address
}

function loadSmtpConfig(cliValues: Partial<SmtpConfig>): SmtpConfig | null {
  const host = cliValues.host ?? Bun.env.SMTP_HOST;
  const port = cliValues.port ?? parseInt(Bun.env.SMTP_PORT ?? "587");
  const user = cliValues.user ?? Bun.env.SMTP_USER;
  const pass = cliValues.pass ?? Bun.env.SMTP_PASS;

  // If no SMTP config provided, return null (email disabled)
  if (!host || !user || !pass) return null;

  return {
    host,
    port,
    user,
    pass,
    secure: port === 465,
    from: cliValues.from ?? Bun.env.SMTP_FROM ?? user,
  };
}
```

### Pattern 2: Lazy Transport Initialization
**What:** Create Nodemailer transport only when first email is sent, not at server startup.
**When to use:** When email is optional and may not be configured.
**Example:**
```typescript
// Source: Nodemailer best practices
let transporter: Transporter | null = null;

function getTransport(config: SmtpConfig): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass,
      },
    });
  }
  return transporter;
}
```

### Pattern 3: Simple Placeholder Replacement
**What:** Replace `{{key}}` patterns in email body with provided values.
**When to use:** For verification tokens, reset links, user names, etc.
**Example:**
```typescript
// Source: Custom implementation matching requirements
function replacePlaceholders(
  template: string,
  values: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return values[key] ?? match;
  });
}

// Usage
const body = replacePlaceholders(
  "Click here to verify: {{link}}\nToken: {{token}}",
  { link: "https://example.com/verify?t=abc123", token: "abc123" }
);
```

### Anti-Patterns to Avoid
- **Blocking startup on email config:** Email is optional. Server should start even if SMTP not configured.
- **Embedding credentials in code:** Always use env vars or CLI flags for SMTP credentials.
- **Sync email sending in request handlers:** Use async/await, but don't block response waiting for send confirmation.
- **Complex templating engines:** Requirements specify simple `{{placeholder}}` syntax. Don't add Handlebars/Mustache dependencies.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SMTP protocol handling | Custom TCP/TLS socket code | Nodemailer | SMTP has many edge cases: AUTH mechanisms, STARTTLS negotiation, connection pooling, multipart MIME encoding |
| Email address validation | Regex patterns | Nodemailer's built-in validation | Email RFC is notoriously complex, many edge cases |
| MIME multipart encoding | Manual boundary generation | Nodemailer | Handles text/html alternatives, attachments, encoding |
| Connection pooling | Manual socket management | Nodemailer | Built-in pooling for high-volume sending |

**Key insight:** SMTP is deceptively simple at first glance but has many protocol-level complexities. Nodemailer abstracts all of this with a clean API and is specifically designed to "avoid remote code execution vulnerabilities that have affected other Node.js email libraries."

## Common Pitfalls

### Pitfall 1: Silent Email Failures
**What goes wrong:** Email send fails but application continues without error, user never receives email.
**Why it happens:** async sendMail() rejected promise not awaited or caught.
**How to avoid:** Always await sendEmail() and handle errors. Log failures for debugging.
**Warning signs:** Users reporting "never received verification email" but no errors in logs.

### Pitfall 2: Hardcoded Port 587 Without TLS Fallback
**What goes wrong:** Some SMTP providers require specific port/security combinations.
**Why it happens:** Assuming 587+STARTTLS works everywhere.
**How to avoid:** Make port configurable, auto-detect secure mode based on port (465=secure, 587=STARTTLS).
**Warning signs:** "Connection refused" or "unable to verify certificate" errors.

### Pitfall 3: Missing From Address
**What goes wrong:** Email rejected by SMTP server or marked as spam.
**Why it happens:** From address not set or doesn't match SMTP user.
**How to avoid:** Default `from` to SMTP username if not explicitly provided. Validate format.
**Warning signs:** "550 5.1.7 Invalid address" or immediate bounce.

### Pitfall 4: Sync Email Blocking HTTP Response
**What goes wrong:** API endpoints become slow (several seconds) waiting for SMTP.
**Why it happens:** Awaiting email send before returning HTTP response.
**How to avoid:** For non-critical emails, consider fire-and-forget with error logging. For critical (verification), accept slight delay but keep timeout reasonable.
**Warning signs:** `/api/auth/signup` takes 2-5 seconds to respond.

### Pitfall 5: Credentials Logged in Error Messages
**What goes wrong:** SMTP password exposed in logs when connection fails.
**Why it happens:** Default error objects include config details.
**How to avoid:** Sanitize error messages before logging. Never log the transporter config object.
**Warning signs:** Grep logs for SMTP password, it appears.

### Pitfall 6: No Graceful Degradation When Email Unconfigured
**What goes wrong:** Auth flows crash if email not configured.
**Why it happens:** Calling sendEmail() without checking if SMTP is configured.
**How to avoid:** Check `smtpConfig !== null` before attempting send. Return clear error: "Email not configured".
**Warning signs:** Server crashes on first signup attempt.

## Code Examples

Verified patterns from official sources:

### Creating Transport (Nodemailer Official)
```typescript
// Source: https://nodemailer.com/
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: "smtp.example.com",
  port: 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: "user@example.com",
    pass: "password",
  },
});
```

### Sending Email with HTML and Plain Text
```typescript
// Source: https://nodemailer.com/
const info = await transporter.sendMail({
  from: '"BunBase" <noreply@example.com>',
  to: "user@example.com",
  subject: "Verify your email",
  text: "Click here to verify: https://example.com/verify?token=abc123",
  html: "<p>Click <a href='https://example.com/verify?token=abc123'>here</a> to verify.</p>",
});

console.log("Message sent:", info.messageId);
```

### CLI Flag Parsing (Existing BunBase Pattern)
```typescript
// Source: /Users/narcisbrindusescu/newme/bunbase/src/cli.ts
import { parseArgs } from "util";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    "smtp-host": { type: "string" },
    "smtp-port": { type: "string", default: "587" },
    "smtp-user": { type: "string" },
    "smtp-pass": { type: "string" },
    "smtp-from": { type: "string" },
  },
  strict: true,
  allowPositionals: true,
});
```

### Complete sendEmail Function
```typescript
// Source: Custom implementation combining patterns
import nodemailer, { Transporter } from "nodemailer";

interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
  placeholders?: Record<string, string>;
}

interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  secure: boolean;
  from: string;
}

let transporter: Transporter | null = null;
let config: SmtpConfig | null = null;

export function initEmailService(smtpConfig: SmtpConfig): void {
  config = smtpConfig;
  transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });
}

export function isEmailConfigured(): boolean {
  return config !== null && transporter !== null;
}

function replacePlaceholders(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? `{{${key}}}`);
}

export async function sendEmail(options: EmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!transporter || !config) {
    return { success: false, error: "Email service not configured" };
  }

  const text = options.placeholders
    ? replacePlaceholders(options.text, options.placeholders)
    : options.text;

  const html = options.html && options.placeholders
    ? replacePlaceholders(options.html, options.placeholders)
    : options.html;

  try {
    const info = await transporter.sendMail({
      from: config.from,
      to: options.to,
      subject: options.subject,
      text,
      html,
    });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    const err = error as Error;
    // Sanitize error - don't expose credentials
    return { success: false, error: `Failed to send email: ${err.message}` };
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Callback-based sendMail | Promise/async sendMail | Nodemailer v4+ | Cleaner async code, better error handling |
| Separate TLS module | Built-in STARTTLS | Nodemailer v6+ | Simpler setup, auto-negotiation |
| Manual DKIM signing | Built-in DKIM support | Nodemailer v6.4+ | No external module needed |
| node-mailer | nodemailer | Long ago | Different package entirely - use nodemailer |

**Deprecated/outdated:**
- `nodemailer-smtp-transport`: Merged into core nodemailer years ago
- `nodemailer-wellknown`: Use host/port config instead of provider names
- `secure: true` for port 587: Use `secure: false` for STARTTLS on 587

## Open Questions

Things that couldn't be fully resolved:

1. **Email queueing for reliability**
   - What we know: Phase 9 requirements don't mention queueing or retries
   - What's unclear: Whether failed emails should be retried
   - Recommendation: Implement simple send-and-log for v0.2. Add queueing in future if needed.

2. **Email verification link base URL**
   - What we know: Email needs to include verification links
   - What's unclear: How to determine the base URL (server doesn't know its public URL)
   - Recommendation: Add `--base-url` CLI flag or `BASE_URL` env var for link generation.

3. **Connection verification on startup**
   - What we know: Nodemailer can verify SMTP connection before sending
   - What's unclear: Whether to verify at startup or fail on first send
   - Recommendation: Log warning if SMTP configured but unverified. Don't block startup.

## Sources

### Primary (HIGH confidence)
- [Nodemailer Official Documentation](https://nodemailer.com/) - API reference, configuration options
- [Bun v0.6.13 Release Notes](https://bun.sh/blog/bun-v0.6.13) - Confirmed nodemailer compatibility
- [GitHub Issue #1652](https://github.com/oven-sh/bun/issues/1652) - Native SMTP not available, nodemailer recommended

### Secondary (MEDIUM confidence)
- [Mailtrap Bun.js Email Tutorial](https://mailtrap.io/blog/bunjs-send-email/) - Practical Bun + Nodemailer examples
- [Sending Emails in Bun 2026 Guide](https://dev.to/hongminhee/sending-emails-in-nodejs-deno-and-bun-in-2026-a-practical-guide-og9) - Cross-runtime comparison
- [npm nodemailer](https://www.npmjs.com/package/nodemailer) - Version 7.0.12, download stats

### Tertiary (LOW confidence)
- [Upyo Cross-Runtime Library](https://github.com/dahlia/upyo) - Alternative to nodemailer, less battle-tested
- WebSearch results for SMTP best practices - General patterns, not Bun-specific

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Nodemailer is definitively the right choice for Bun SMTP
- Architecture: HIGH - Patterns match existing BunBase conventions
- Pitfalls: MEDIUM - Based on general SMTP knowledge, some Bun-specific issues may exist

**Research date:** 2026-01-27
**Valid until:** 90 days (Nodemailer is stable, unlikely to have breaking changes)
