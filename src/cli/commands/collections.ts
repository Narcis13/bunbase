/**
 * `bunbase collections` command — manage collections.
 *
 * Subcommands:
 *   list                          List all collections with field counts
 *   create --stdin                Create collection from JSON stdin
 *   delete <name> [--confirm]     Delete collection
 *   fields <name>                 List fields for a collection
 *   fields <name> --add --stdin   Add field from JSON stdin
 *   fields <name> --update <fieldName> --stdin  Update field from JSON stdin
 *   fields <name> --remove <fieldName>          Remove field
 *   rules <name>                  Get current rules
 *   rules <name> --stdin          Update rules from JSON stdin
 */

import { parseArgs } from "util";
import { output, outputError } from "../output";
import {
  getAllCollections,
  getCollection,
  createCollection,
  deleteCollection,
  getFields,
  addField,
  updateField,
  removeField,
  updateCollectionRules,
} from "../../core/schema";
import type { FieldInput, UpdateFieldInput } from "../../core/schema";
import type { CollectionRules } from "../../types/collection";

function showHelp(): void {
  console.log(`Usage: bunbase collections <subcommand> [options]

Subcommands:
  list                                    List all collections
  create --stdin                          Create collection from JSON stdin
  delete <name> [--confirm]               Delete collection
  fields <name>                           List fields for a collection
  fields <name> --add --stdin             Add field from JSON stdin
  fields <name> --update <field> --stdin  Update field from JSON stdin
  fields <name> --remove <field>          Remove field
  rules <name>                            Get current rules
  rules <name> --stdin                    Update rules from JSON stdin

Options:
  --stdin       Read input from stdin (JSON)
  --confirm     Skip confirmation for destructive operations
  -h, --help    Show this help message`);
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
      confirm: { type: "boolean", default: false },
      add: { type: "boolean", default: false },
      update: { type: "string" },
      remove: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: false,
    allowPositionals: true,
  });

  if (values.help) showHelp();

  const subcommand = positionals[0];

  if (!subcommand) {
    outputError("MISSING_SUBCOMMAND", "Usage: bunbase collections <list|create|delete|fields|rules>");
    process.exit(2);
  }

  try {
    switch (subcommand) {
      case "list":
        return handleList(format);
      case "create":
        return await handleCreate(format, values.stdin as boolean);
      case "delete":
        return handleDelete(positionals[1], values.confirm as boolean);
      case "fields":
        return await handleFields(positionals[1], format, values);
      case "rules":
        return await handleRules(positionals[1], format, values.stdin as boolean);
      default:
        outputError("UNKNOWN_SUBCOMMAND", `Unknown subcommand: ${subcommand}. Use: list, create, delete, fields, rules`);
        process.exit(2);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    outputError("COLLECTION_ERROR", message);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Subcommand handlers
// ---------------------------------------------------------------------------

function handleList(format: "json" | "table"): void {
  const collections = getAllCollections();
  const result = collections.map((c) => {
    const fields = getFields(c.name);
    return {
      name: c.name,
      type: c.type,
      fields: fields.length,
      created_at: c.created_at,
      updated_at: c.updated_at,
    };
  });
  output(result, format);
}

async function handleCreate(
  format: "json" | "table",
  useStdin: boolean
): Promise<void> {
  if (!useStdin) {
    outputError("VALIDATION_ERROR", "collections create requires --stdin. Pipe JSON to stdin.");
    process.exit(2);
  }

  const raw = await readStdin();
  if (!raw) {
    outputError("VALIDATION_ERROR", "No input received on stdin.");
    process.exit(2);
  }

  let input: {
    name: string;
    type?: "base" | "auth";
    fields: FieldInput[];
    rules?: CollectionRules;
  };
  try {
    input = JSON.parse(raw);
  } catch {
    outputError("VALIDATION_ERROR", "Invalid JSON on stdin.");
    process.exit(2);
    return; // unreachable but helps TS
  }

  if (!input.name || !input.fields) {
    outputError("VALIDATION_ERROR", "JSON must include 'name' and 'fields'.");
    process.exit(2);
  }

  const collection = createCollection(input.name, input.fields, {
    type: input.type,
    rules: input.rules,
  });

  output(collection, format);
}

function handleDelete(name: string | undefined, confirm: boolean): void {
  if (!name) {
    outputError("VALIDATION_ERROR", "Usage: bunbase collections delete <name> [--confirm]");
    process.exit(2);
  }

  // Verify collection exists before prompting
  const collection = getCollection(name);
  if (!collection) {
    outputError("NOT_FOUND", `Collection "${name}" not found`);
    process.exit(1);
  }

  if (!confirm) {
    outputError("CONFIRMATION_REQUIRED", `Pass --confirm to delete collection "${name}". This is irreversible.`);
    process.exit(2);
  }

  deleteCollection(name);
  output({ deleted: name }, "json");
}

async function handleFields(
  name: string | undefined,
  format: "json" | "table",
  values: Record<string, unknown>
): Promise<void> {
  if (!name) {
    outputError("VALIDATION_ERROR", "Usage: bunbase collections fields <name>");
    process.exit(2);
  }

  const useStdin = values.stdin as boolean;
  const addFlag = values.add as boolean;
  const updateFieldName = values.update as string | undefined;
  const removeFieldName = values.remove as string | undefined;

  // --add --stdin: add a field
  if (addFlag) {
    if (!useStdin) {
      outputError("VALIDATION_ERROR", "collections fields --add requires --stdin.");
      process.exit(2);
    }
    const raw = await readStdin();
    if (!raw) {
      outputError("VALIDATION_ERROR", "No input received on stdin.");
      process.exit(2);
    }

    let fieldInput: FieldInput;
    try {
      fieldInput = JSON.parse(raw);
    } catch {
      outputError("VALIDATION_ERROR", "Invalid JSON on stdin.");
      process.exit(2);
      return;
    }

    if (!fieldInput.name || !fieldInput.type) {
      outputError("VALIDATION_ERROR", "Field JSON must include 'name' and 'type'.");
      process.exit(2);
    }

    const field = addField(name, fieldInput);
    output(field, format);
    return;
  }

  // --update <fieldName> --stdin: update a field
  if (updateFieldName) {
    if (!useStdin) {
      outputError("VALIDATION_ERROR", "collections fields --update requires --stdin.");
      process.exit(2);
    }
    const raw = await readStdin();
    if (!raw) {
      outputError("VALIDATION_ERROR", "No input received on stdin.");
      process.exit(2);
    }

    let updates: UpdateFieldInput;
    try {
      updates = JSON.parse(raw);
    } catch {
      outputError("VALIDATION_ERROR", "Invalid JSON on stdin.");
      process.exit(2);
      return;
    }

    const field = updateField(name, updateFieldName, updates);
    output(field, format);
    return;
  }

  // --remove <fieldName>: remove a field
  if (removeFieldName) {
    removeField(name, removeFieldName);
    output({ removed: removeFieldName, collection: name }, "json");
    return;
  }

  // Default: list fields
  const fields = getFields(name);
  output(fields, format);
}

async function handleRules(
  name: string | undefined,
  format: "json" | "table",
  useStdin: boolean
): Promise<void> {
  if (!name) {
    outputError("VALIDATION_ERROR", "Usage: bunbase collections rules <name>");
    process.exit(2);
  }

  // Update rules from stdin
  if (useStdin) {
    const raw = await readStdin();
    if (!raw) {
      outputError("VALIDATION_ERROR", "No input received on stdin.");
      process.exit(2);
    }

    let rules: CollectionRules;
    try {
      rules = JSON.parse(raw);
    } catch {
      outputError("VALIDATION_ERROR", "Invalid JSON on stdin.");
      process.exit(2);
      return;
    }

    const updated = updateCollectionRules(name, rules);
    output(updated.rules, format);
    return;
  }

  // Default: get current rules
  const collection = getCollection(name);
  if (!collection) {
    outputError("NOT_FOUND", `Collection "${name}" not found`);
    process.exit(1);
  }

  output(collection.rules, format);
}
