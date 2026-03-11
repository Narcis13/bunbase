/**
 * `bunbase status` command — show instance info for debugging.
 *
 * Displays database path, collection count, record counts, and
 * whether JWT_SECRET is set. Helps agents introspect state without
 * trial-and-error debugging.
 *
 * Usage:
 *   bunbase status [--db ./app.db]
 */

import { parseArgs } from "util";
import { output, outputError } from "../output";
import { getDatabase } from "../../core/database";
import { getAllCollections, getFields } from "../../core/schema";

function showHelp(): void {
  console.log(`Usage: bunbase status [options]

Show database status including collections, record counts, and configuration.

Options:
  -h, --help    Show this help message

Output includes:
  - Database file path and size
  - Number of collections with record counts
  - Whether JWT_SECRET is configured
  - Whether BUNBASE_ADMIN_PASSWORD is configured
  - Admin account existence`);
  process.exit(0);
}

export async function execute(
  args: string[],
  format: "json" | "table" = "json",
  dbPath?: string
): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      help: { type: "boolean", short: "h", default: false },
    },
    strict: false,
    allowPositionals: true,
  });

  if (values.help) showHelp();

  try {
    const db = getDatabase();
    const resolvedPath = dbPath ?? Bun.env.BUNBASE_DB ?? "bunbase.db";

    // Get database file size
    const file = Bun.file(resolvedPath);
    let dbSize: string;
    try {
      const size = file.size;
      if (size < 1024) dbSize = `${size} B`;
      else if (size < 1024 * 1024) dbSize = `${(size / 1024).toFixed(1)} KB`;
      else dbSize = `${(size / (1024 * 1024)).toFixed(1)} MB`;
    } catch {
      dbSize = "unknown";
    }

    // Get collections info
    const collections = getAllCollections();
    const collectionDetails = collections.map((c) => {
      const fields = getFields(c.name);
      let recordCount: number;
      try {
        const result = db
          .prepare(`SELECT COUNT(*) as count FROM "${c.name}"`)
          .get() as { count: number };
        recordCount = result.count;
      } catch {
        recordCount = 0;
      }
      return {
        name: c.name,
        type: c.type,
        fields: fields.length,
        records: recordCount,
        rules: c.rules != null,
      };
    });

    // Check admin existence
    let adminCount = 0;
    try {
      const result = db
        .prepare("SELECT COUNT(*) as count FROM _admins")
        .get() as { count: number };
      adminCount = result.count;
    } catch {
      // table might not exist
    }

    // Check API key count
    let apiKeyCount = 0;
    try {
      const result = db
        .prepare("SELECT COUNT(*) as count FROM _api_keys")
        .get() as { count: number };
      apiKeyCount = result.count;
    } catch {
      // table might not exist
    }

    const status = {
      database: {
        path: resolvedPath,
        size: dbSize,
      },
      collections: {
        count: collections.length,
        details: collectionDetails,
      },
      auth: {
        jwt_secret_set: !!Bun.env.JWT_SECRET,
        admin_password_set: !!Bun.env.BUNBASE_ADMIN_PASSWORD,
        admin_accounts: adminCount,
        api_keys: apiKeyCount,
      },
    };

    output(status, format);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    outputError("STATUS_ERROR", message);
    process.exit(1);
  }
}
