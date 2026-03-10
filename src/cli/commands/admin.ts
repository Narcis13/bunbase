/**
 * `bunbase admin` command — manage admin accounts.
 *
 * Subcommands:
 *   create --email <email> --password <pass>          Create admin account
 *   reset-password --email <email> --password <pass>  Reset admin password
 */

import { parseArgs } from "util";
import { output, outputError } from "../output";
import { createAdmin, getAdminByEmail, updateAdminPassword } from "../../auth/admin";

function showHelp(): void {
  console.log(`Usage: bunbase admin <subcommand> [options]

Subcommands:
  create          Create a new admin account
  reset-password  Reset an admin's password

Options:
  --email <email>       Admin email address (required)
  --password <password> Admin password (required)
  -h, --help            Show this help message`);
  process.exit(0);
}

export async function execute(
  args: string[],
  format: "json" | "table" = "json"
): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      email: { type: "string" },
      password: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: false,
    allowPositionals: true,
  });

  if (values.help) showHelp();

  const subcommand = positionals[0];

  if (!subcommand) {
    outputError("MISSING_SUBCOMMAND", "Usage: bunbase admin <create|reset-password>");
    process.exit(2);
  }

  try {
    switch (subcommand) {
      case "create":
        return await handleCreate(values.email as string | undefined, values.password as string | undefined, format);
      case "reset-password":
        return await handleResetPassword(values.email as string | undefined, values.password as string | undefined, format);
      default:
        outputError("UNKNOWN_SUBCOMMAND", `Unknown subcommand: ${subcommand}. Use: create, reset-password`);
        process.exit(2);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    outputError("ADMIN_ERROR", message);
    process.exit(1);
  }
}

async function handleCreate(
  email: string | undefined,
  password: string | undefined,
  format: "json" | "table"
): Promise<void> {
  if (!email || !password) {
    outputError("VALIDATION_ERROR", "Usage: bunbase admin create --email <email> --password <password>");
    process.exit(2);
  }

  const admin = await createAdmin(email, password);
  output(admin, format);
}

async function handleResetPassword(
  email: string | undefined,
  password: string | undefined,
  format: "json" | "table"
): Promise<void> {
  if (!email || !password) {
    outputError("VALIDATION_ERROR", "Usage: bunbase admin reset-password --email <email> --password <password>");
    process.exit(2);
  }

  const admin = getAdminByEmail(email);
  if (!admin) {
    outputError("NOT_FOUND", `Admin with email "${email}" not found`);
    process.exit(1);
  }

  await updateAdminPassword(admin.id, password);
  output({ id: admin.id, email: admin.email, password_reset: true }, format);
}
