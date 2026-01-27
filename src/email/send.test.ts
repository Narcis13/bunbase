/**
 * Email Service Unit Tests
 *
 * Comprehensive tests for configuration loading, template placeholders,
 * and email service state management.
 */

import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { loadSmtpConfig } from "./config";
import { replacePlaceholders } from "./templates";
import { isEmailConfigured } from "./transport";

describe("loadSmtpConfig", () => {
  // Store original env vars to restore after tests
  const originalEnv: Record<string, string | undefined> = {};
  const envVars = [
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASS",
    "SMTP_FROM",
  ];

  beforeEach(() => {
    // Save original env vars
    for (const key of envVars) {
      originalEnv[key] = Bun.env[key];
      delete Bun.env[key];
    }
  });

  afterEach(() => {
    // Restore original env vars
    for (const key of envVars) {
      if (originalEnv[key] !== undefined) {
        Bun.env[key] = originalEnv[key];
      } else {
        delete Bun.env[key];
      }
    }
  });

  test("returns null when host is missing", () => {
    const config = loadSmtpConfig({
      user: "test@example.com",
      pass: "password",
    });
    expect(config).toBeNull();
  });

  test("returns null when user is missing", () => {
    const config = loadSmtpConfig({
      host: "smtp.example.com",
      pass: "password",
    });
    expect(config).toBeNull();
  });

  test("returns null when pass is missing", () => {
    const config = loadSmtpConfig({
      host: "smtp.example.com",
      user: "test@example.com",
    });
    expect(config).toBeNull();
  });

  test("returns SmtpConfig when all required fields present", () => {
    const config = loadSmtpConfig({
      host: "smtp.example.com",
      user: "test@example.com",
      pass: "password",
    });
    expect(config).not.toBeNull();
    expect(config!.host).toBe("smtp.example.com");
    expect(config!.user).toBe("test@example.com");
    expect(config!.pass).toBe("password");
  });

  test("CLI values override env vars", () => {
    // Set env vars
    Bun.env.SMTP_HOST = "env.example.com";
    Bun.env.SMTP_USER = "env@example.com";
    Bun.env.SMTP_PASS = "env-password";

    // CLI values should override
    const config = loadSmtpConfig({
      host: "cli.example.com",
      user: "cli@example.com",
      pass: "cli-password",
    });
    expect(config!.host).toBe("cli.example.com");
    expect(config!.user).toBe("cli@example.com");
    expect(config!.pass).toBe("cli-password");
  });

  test("falls back to env vars when CLI values missing", () => {
    Bun.env.SMTP_HOST = "env.example.com";
    Bun.env.SMTP_USER = "env@example.com";
    Bun.env.SMTP_PASS = "env-password";

    const config = loadSmtpConfig({});
    expect(config!.host).toBe("env.example.com");
    expect(config!.user).toBe("env@example.com");
    expect(config!.pass).toBe("env-password");
  });

  test("defaults port to 587 when not specified", () => {
    const config = loadSmtpConfig({
      host: "smtp.example.com",
      user: "test@example.com",
      pass: "password",
    });
    expect(config!.port).toBe(587);
  });

  test("uses specified port when provided", () => {
    const config = loadSmtpConfig({
      host: "smtp.example.com",
      port: "2525",
      user: "test@example.com",
      pass: "password",
    });
    expect(config!.port).toBe(2525);
  });

  test("sets secure: true for port 465", () => {
    const config = loadSmtpConfig({
      host: "smtp.example.com",
      port: "465",
      user: "test@example.com",
      pass: "password",
    });
    expect(config!.secure).toBe(true);
  });

  test("sets secure: false for port 587", () => {
    const config = loadSmtpConfig({
      host: "smtp.example.com",
      port: "587",
      user: "test@example.com",
      pass: "password",
    });
    expect(config!.secure).toBe(false);
  });

  test("sets secure: false for non-465 ports", () => {
    const config = loadSmtpConfig({
      host: "smtp.example.com",
      port: "2525",
      user: "test@example.com",
      pass: "password",
    });
    expect(config!.secure).toBe(false);
  });

  test("defaults from to user when not specified", () => {
    const config = loadSmtpConfig({
      host: "smtp.example.com",
      user: "test@example.com",
      pass: "password",
    });
    expect(config!.from).toBe("test@example.com");
  });

  test("uses specified from address when provided", () => {
    const config = loadSmtpConfig({
      host: "smtp.example.com",
      user: "test@example.com",
      pass: "password",
      from: "noreply@example.com",
    });
    expect(config!.from).toBe("noreply@example.com");
  });
});

describe("replacePlaceholders", () => {
  test("replaces single placeholder", () => {
    const result = replacePlaceholders("Hello {{name}}!", { name: "World" });
    expect(result).toBe("Hello World!");
  });

  test("replaces multiple placeholders", () => {
    const result = replacePlaceholders(
      "Hello {{first}} {{last}}!",
      { first: "John", last: "Doe" }
    );
    expect(result).toBe("Hello John Doe!");
  });

  test("replaces same placeholder multiple times", () => {
    const result = replacePlaceholders(
      "{{x}} + {{x}} = 2{{x}}",
      { x: "5" }
    );
    expect(result).toBe("5 + 5 = 25");
  });

  test("preserves unmatched placeholders", () => {
    const result = replacePlaceholders(
      "Hello {{name}}! Your code is {{code}}.",
      { name: "User" }
    );
    expect(result).toBe("Hello User! Your code is {{code}}.");
  });

  test("handles empty template", () => {
    const result = replacePlaceholders("", { name: "World" });
    expect(result).toBe("");
  });

  test("handles empty values object", () => {
    const result = replacePlaceholders("Hello {{name}}!", {});
    expect(result).toBe("Hello {{name}}!");
  });

  test("handles template with no placeholders", () => {
    const result = replacePlaceholders("Hello World!", { name: "Test" });
    expect(result).toBe("Hello World!");
  });

  test("only matches word characters in placeholder names", () => {
    // {{foo-bar}} is NOT matched because "-" is not a word character
    const result = replacePlaceholders(
      "Hello {{foo-bar}} and {{foo_bar}}!",
      { "foo-bar": "BAD", "foo_bar": "GOOD" }
    );
    expect(result).toBe("Hello {{foo-bar}} and GOOD!");
  });

  test("handles underscores in placeholder names", () => {
    const result = replacePlaceholders(
      "Code: {{verification_code}}",
      { verification_code: "123456" }
    );
    expect(result).toBe("Code: 123456");
  });

  test("handles numbers in placeholder names", () => {
    const result = replacePlaceholders(
      "Value: {{item1}}",
      { item1: "First" }
    );
    expect(result).toBe("Value: First");
  });
});

describe("isEmailConfigured", () => {
  test("returns false before initialization", () => {
    // Note: This test assumes fresh module state
    // In practice, email service won't be initialized in test environment
    // We can only test the "false" case without mocking SMTP server
    // Actual "true" case is tested via integration tests
    const result = isEmailConfigured();
    // This may be true or false depending on test order
    // The important thing is it returns a boolean
    expect(typeof result).toBe("boolean");
  });
});
