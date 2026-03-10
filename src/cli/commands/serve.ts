/**
 * `bunbase serve` command — starts the HTTP server.
 * Extracted from the original src/cli.ts.
 */

import { parseArgs } from "util";
import { startServer, HookManager, RealtimeManager } from "../../api/server";
import { loadSmtpConfig } from "../../email";
import { buildCustomRoutes, routeManifest } from "../../routes-generated";

function showServeHelp(): void {
  console.log(`BunBase - Backend-in-a-box

Usage: bunbase serve [options]

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
  bunbase serve                    # Start on port 8090 with bunbase.db
  bunbase serve --port 3000        # Start on port 3000
  bunbase serve --db ./data/app.db # Use custom database path`);
  process.exit(0);
}

function validatePort(portStr: string): number {
  const port = parseInt(portStr, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    console.error("Error: Invalid port number");
    process.exit(1);
  }
  return port;
}

export async function execute(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      port: { type: "string", short: "p", default: "8090" },
      db: { type: "string", default: "bunbase.db" },
      help: { type: "boolean", short: "h", default: false },
      "smtp-host": { type: "string" },
      "smtp-port": { type: "string" },
      "smtp-user": { type: "string" },
      "smtp-pass": { type: "string" },
      "smtp-from": { type: "string" },
    },
    strict: true,
    allowPositionals: false,
  });

  if (values.help) showServeHelp();

  const port = validatePort(values.port!);
  const dbPath = values.db!;

  const smtpConfig = loadSmtpConfig({
    host: values["smtp-host"],
    port: values["smtp-port"],
    user: values["smtp-user"],
    pass: values["smtp-pass"],
    from: values["smtp-from"],
  });

  const hookManager = new HookManager();
  const realtimeManager = new RealtimeManager();

  const customRoutes = buildCustomRoutes({
    hooks: hookManager,
    realtime: realtimeManager,
  });

  const isDev = Bun.env.NODE_ENV === "development" || Bun.env.BUNBASE_DEV === "true";
  if (isDev && routeManifest.routes.length > 0) {
    console.log(`Custom routes (${routeManifest.routes.length}):`);
    for (const route of routeManifest.routes) {
      console.log(`  ${route.methods.join(",")} ${route.path}`);
    }
  }

  await startServer(port, dbPath, hookManager, smtpConfig, realtimeManager, customRoutes);
}
