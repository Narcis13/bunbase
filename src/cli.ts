/**
 * CLI Entry Point for BunBase
 *
 * Parses command-line arguments for port, database path, and help.
 * Serves as the main entry point when compiled to a single binary.
 */

import { parseArgs } from "util";
import { startServer } from "./api/server";

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

  // Start server with parsed configuration
  await startServer(port, dbPath);
}

// Run main entry point
main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
