/**
 * `bunbase schema` command — export and import collection schemas.
 *
 * Enables reproducible database setups without HTTP calls.
 *
 * Subcommands:
 *   export                   Export all collection schemas as JSON
 *   import --stdin           Import schemas from JSON stdin
 *   import --file <path>     Import schemas from a JSON file
 */

import { parseArgs } from "util";
import { output, outputError } from "../output";
import { getDatabase } from "../../core/database";
import {
  getAllCollections,
  getCollection,
  getFields,
  createCollection,
  deleteCollection,
  updateCollectionRules,
} from "../../core/schema";
import type { FieldInput } from "../../core/schema";
import type { CollectionRules } from "../../types/collection";

interface ExportedCollection {
  name: string;
  type: "base" | "auth";
  fields: Array<{
    name: string;
    type: string;
    required: boolean;
    options: unknown | null;
  }>;
  rules: CollectionRules | null;
}

function showHelp(): void {
  console.log(`Usage: bunbase schema <subcommand> [options]

Subcommands:
  export                    Export all collection schemas as JSON
  import --stdin            Import schemas from JSON stdin
  import --file <path>      Import schemas from a JSON file

Import Options:
  --stdin                   Read schema from stdin
  --file <path>             Read schema from file
  --force                   Drop existing collections before importing
  --merge                   Skip existing collections instead of erroring
  -h, --help                Show this help message

Export format:
  [
    {
      "name": "tasks",
      "type": "base",
      "fields": [
        { "name": "title", "type": "text", "required": true, "options": null }
      ],
      "rules": { "listRule": "", "viewRule": "", ... }
    }
  ]

Examples:
  bunbase schema export > schema.json
  bunbase schema export --db ./app.db > schema.json
  bunbase schema import --file schema.json
  bunbase schema import --file schema.json --force
  cat schema.json | bunbase schema import --stdin`);
  process.exit(0);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of Bun.stdin.stream()) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8").trim();
}

export async function execute(
  args: string[],
  format: "json" | "table" = "json"
): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      stdin: { type: "boolean", default: false },
      file: { type: "string" },
      force: { type: "boolean", default: false },
      merge: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: false,
    allowPositionals: true,
  });

  if (values.help) showHelp();

  const subcommand = positionals[0];

  if (!subcommand) {
    outputError(
      "MISSING_SUBCOMMAND",
      "Usage: bunbase schema <export|import>"
    );
    process.exit(2);
  }

  try {
    switch (subcommand) {
      case "export":
        return handleExport(format);
      case "import":
        return await handleImport(
          format,
          values.stdin as boolean,
          values.file as string | undefined,
          values.force as boolean,
          values.merge as boolean
        );
      default:
        outputError(
          "UNKNOWN_SUBCOMMAND",
          `Unknown subcommand: ${subcommand}. Use: export, import`
        );
        process.exit(2);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    outputError("SCHEMA_ERROR", message);
    process.exit(1);
  }
}

function handleExport(format: "json" | "table"): void {
  const collections = getAllCollections();
  const exported: ExportedCollection[] = collections.map((c) => {
    const fields = getFields(c.name);
    return {
      name: c.name,
      type: c.type as "base" | "auth",
      fields: fields.map((f) => ({
        name: f.name,
        type: f.type,
        required: f.required,
        options: f.options,
      })),
      rules: c.rules,
    };
  });

  output(exported, format);
}

async function handleImport(
  format: "json" | "table",
  useStdin: boolean,
  filePath: string | undefined,
  force: boolean,
  merge: boolean
): Promise<void> {
  if (!useStdin && !filePath) {
    outputError(
      "VALIDATION_ERROR",
      "schema import requires --stdin or --file <path>."
    );
    process.exit(2);
  }

  let raw: string;
  if (useStdin) {
    raw = await readStdin();
    if (!raw) {
      outputError("VALIDATION_ERROR", "No input received on stdin.");
      process.exit(2);
    }
  } else {
    const file = Bun.file(filePath!);
    if (!(await file.exists())) {
      outputError("VALIDATION_ERROR", `File not found: ${filePath}`);
      process.exit(2);
    }
    raw = await file.text();
  }

  let schemas: ExportedCollection[];
  try {
    schemas = JSON.parse(raw);
  } catch {
    outputError("VALIDATION_ERROR", "Invalid JSON input.");
    process.exit(2);
    return;
  }

  if (!Array.isArray(schemas)) {
    outputError(
      "VALIDATION_ERROR",
      "Schema must be a JSON array of collection definitions."
    );
    process.exit(2);
  }

  const db = getDatabase();
  const results: {
    created: string[];
    replaced: string[];
    skipped: string[];
  } = {
    created: [],
    replaced: [],
    skipped: [],
  };

  const importTransaction = db.transaction(() => {
    for (const schema of schemas) {
      if (!schema.name || !Array.isArray(schema.fields)) {
        throw new Error(
          `Invalid schema entry: each must have 'name' and 'fields' array.`
        );
      }

      const existing = getCollection(schema.name);

      if (existing) {
        if (force) {
          deleteCollection(schema.name);
          results.replaced.push(schema.name);
        } else if (merge) {
          results.skipped.push(schema.name);
          continue;
        } else {
          throw new Error(
            `Collection "${schema.name}" already exists. Use --force to replace or --merge to skip.`
          );
        }
      }

      const fieldInputs: FieldInput[] = schema.fields.map((f) => ({
        name: f.name,
        type: f.type as FieldInput["type"],
        required: f.required ?? false,
        options: (f.options as FieldInput["options"]) ?? null,
      }));

      createCollection(schema.name, fieldInputs, {
        type: schema.type,
        rules: schema.rules ?? undefined,
      });

      if (!results.replaced.includes(schema.name)) {
        results.created.push(schema.name);
      }
    }
  });

  importTransaction();
  output(results, format);
}
