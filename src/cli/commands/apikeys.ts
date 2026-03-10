/**
 * `bunbase apikeys` command — manage API keys.
 *
 * Subcommands:
 *   create --name <label>    Create a new API key
 *   list                     List all API keys
 *   revoke <id> [--confirm]  Revoke an API key
 */

import { parseArgs } from "util";
import { output, outputError } from "../output";
import { createApiKey, listApiKeys, revokeApiKey } from "../../auth/apikeys";

function showHelp(): void {
  console.log(`Usage: bunbase apikeys <subcommand> [options]

Subcommands:
  create --name <label>     Create a new API key (prints raw key once)
  list                      List all API keys
  revoke <id> [--confirm]   Revoke an API key

Options:
  -h, --help                Show this help message`);
  process.exit(0);
}

export async function execute(args: string[], format: "json" | "table" = "json"): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      name: { type: "string" },
      confirm: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: false,
    allowPositionals: true,
  });

  const subcommand = positionals[0];

  if (values.help && !subcommand) showHelp();

  switch (subcommand) {
    case "create": {
      const name = values.name as string | undefined;
      if (!name) {
        outputError("VALIDATION_ERROR", "Missing required flag: --name <label>");
        process.exit(2);
      }

      const result = await createApiKey(name);
      output(result, format);
      break;
    }

    case "list": {
      const keys = listApiKeys();
      output(keys, format);
      break;
    }

    case "revoke": {
      const id = positionals[1];
      if (!id) {
        outputError("VALIDATION_ERROR", "Missing required argument: <id>");
        process.exit(2);
      }

      if (!values.confirm) {
        outputError("CONFIRMATION_REQUIRED", "Pass --confirm to revoke this API key.");
        process.exit(2);
      }

      const deleted = revokeApiKey(id);
      if (!deleted) {
        outputError("NOT_FOUND", `API key "${id}" not found.`);
        process.exit(1);
      }

      output({ success: true, id }, format);
      break;
    }

    default:
      if (subcommand) {
        outputError("UNKNOWN_SUBCOMMAND", `Unknown subcommand: ${subcommand}`);
      } else {
        outputError("MISSING_SUBCOMMAND", "Expected subcommand: create, list, or revoke");
      }
      process.exit(1);
  }
}
