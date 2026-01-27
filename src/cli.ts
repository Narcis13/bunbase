/**
 * CLI Entry Point for BunBase
 *
 * Parses command-line arguments for port, database path, and help.
 * Serves as the main entry point when compiled to a single binary.
 */

import { parseArgs } from "util";
import { startServer } from "./api/server";
import { loadSmtpConfig } from "./email";

/**
 * Display usage information and exit.
 */
function showHelp(): void {
  console.log(`BunBase - Backend-in-a-box

Usage: bunbase [options]

Options:
  -p, --port <port>  Port to listen on (default: 8090)
  --db <path>        Database file path (default: bunbase.db)
  -h, --help         Show this help message

SMTP Options:
  --smtp-host <host>   SMTP server hostname (or SMTP_HOST env var)
  --smtp-port <port>   SMTP server port (default: 587, or SMTP_PORT)
  --smtp-user <user>   SMTP username (or SMTP_USER env var)
  --smtp-pass <pass>   SMTP password (or SMTP_PASS env var)
  --smtp-from <addr>   Default from address (or SMTP_FROM, defaults to smtp-user)

Examples:
  bunbase                    # Start on port 8090 with bunbase.db
  bunbase --port 3000        # Start on port 3000
  bunbase --db ./data/app.db # Use custom database path`);
  process.exit(0);
}

/**
 * Validate port number is within valid range.
 *
 * @param portStr - Port string from CLI argument
 * @returns Valid port number or exits with error
 */
function validatePort(portStr: string): number {
  const port = parseInt(portStr, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    console.error("Error: Invalid port number");
    process.exit(1);
  }
  return port;
}

/**
 * Parse CLI arguments and start the server.
 */
async function main(): Promise<void> {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      port: {
        type: "string",
        short: "p",
        default: "8090",
      },
      db: {
        type: "string",
        default: "bunbase.db",
      },
      help: {
        type: "boolean",
        short: "h",
        default: false,
      },
      "smtp-host": {
        type: "string",
      },
      "smtp-port": {
        type: "string",
      },
      "smtp-user": {
        type: "string",
      },
      "smtp-pass": {
        type: "string",
      },
      "smtp-from": {
        type: "string",
      },
    },
    strict: true,
    allowPositionals: true,
  });

  // Show help if requested
  if (values.help) {
    showHelp();
  }

  // Validate and parse port
  const port = validatePort(values.port!);
  const dbPath = values.db!;

  // Load SMTP configuration (CLI flags take precedence over env vars)
  const smtpConfig = loadSmtpConfig({
    host: values["smtp-host"],
    port: values["smtp-port"],
    user: values["smtp-user"],
    pass: values["smtp-pass"],
    from: values["smtp-from"],
  });

  // Start server with parsed configuration
  await startServer(port, dbPath, undefined, smtpConfig);
}

// Run main entry point
main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
