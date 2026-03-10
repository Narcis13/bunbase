/**
 * CLI Entry Point for BunBase
 *
 * Subcommand dispatcher. Defaults to `serve` for backward compatibility.
 */

import { parseArgs } from "util";
import { outputError } from "./cli/output";
import { initForCli } from "./cli/db-init";

function showHelp(): void {
  console.log(`BunBase - Backend-in-a-box

Usage: bunbase <command> [options]

Commands:
  serve             Start the HTTP server (default)
  collections       Manage collections
  records           Manage records
  admin             Manage admin accounts
  apikeys           Manage API keys

Global Options:
  --db <path>       Database file path (default: BUNBASE_DB env var or bunbase.db)
  --format <fmt>    Output format: json or table (default: json)
  --quiet           Suppress non-essential output
  -h, --help        Show this help message

Run 'bunbase <command> --help' for command-specific help.`);
  process.exit(0);
}

async function main(): Promise<void> {
  // Parse top-level flags loosely so subcommands can handle their own flags
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      db: { type: "string" },
      format: { type: "string", default: "json" },
      quiet: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: false,
    allowPositionals: true,
  });

  const command = positionals[0];

  // Show top-level help
  if (!command && values.help) showHelp();

  // Build subcommand args by stripping global flags from raw args, then skipping the command name.
  const rawArgs = Bun.argv.slice(2);
  const stripped: string[] = [];
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === "--db" || arg === "--format") {
      i++; // skip flag and its value
      continue;
    }
    if (arg === "--quiet") continue;
    stripped.push(arg);
  }
  // Skip the command name itself (first element of stripped that matches the command)
  const cmdIdx = stripped.indexOf(command ?? "");
  const cmdArgs = cmdIdx >= 0 ? [...stripped.slice(0, cmdIdx), ...stripped.slice(cmdIdx + 1)] : stripped;

  switch (command) {
    case "serve":
    case undefined: {
      // Serve handles its own --db, so pass raw remaining args (just skip "serve")
      const serveIdx = rawArgs.indexOf("serve");
      const serveArgs = serveIdx >= 0 ? [...rawArgs.slice(0, serveIdx), ...rawArgs.slice(serveIdx + 1)] : rawArgs;
      const { execute } = await import("./cli/commands/serve");
      await execute(serveArgs);
      break;
    }
    case "collections": {
      initForCli(values.db as string | undefined);
      const { execute } = await import("./cli/commands/collections");
      await execute(cmdArgs, values.format as "json" | "table");
      break;
    }
    case "records": {
      initForCli(values.db as string | undefined);
      const { execute } = await import("./cli/commands/records");
      await execute(cmdArgs, values.format as "json" | "table");
      break;
    }
    case "admin": {
      initForCli(values.db as string | undefined);
      const { execute } = await import("./cli/commands/admin");
      await execute(cmdArgs, values.format as "json" | "table");
      break;
    }
    case "apikeys": {
      initForCli(values.db as string | undefined);
      const { execute } = await import("./cli/commands/apikeys");
      await execute(cmdArgs, values.format as "json" | "table");
      break;
    }
    default:
      outputError("UNKNOWN_COMMAND", `Unknown command: ${command}`);
      process.exit(1);
  }
}

main().catch((error) => {
  outputError("FATAL", error.message);
  process.exit(1);
});
