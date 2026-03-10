/**
 * `bunbase records` command — manage records.
 *
 * Subcommands:
 *   list <collection>                         List with optional query flags
 *   create <collection> --stdin               Create from JSON stdin (supports batch arrays)
 *   create <collection> --set key=value ...   Create with inline key-value pairs
 *   get <collection> <id> [--expand fields]   Get single record
 *   update <collection> <id> --stdin          Partial update from JSON stdin
 *   update <collection> <id> --set key=value  Partial update with inline pairs
 *   delete <collection> <id> [--confirm]      Delete record
 */

import { parseArgs } from "util";
import { output, outputError } from "../output";
import { getDatabase } from "../../core/database";
import {
  createRecord,
  getRecord,
  updateRecord,
  deleteRecord,
  listRecordsWithQuery,
} from "../../core/records";
import type { QueryOptions, FilterCondition, SortOption } from "../../types/query";

function showHelp(): void {
  console.log(`Usage: bunbase records <subcommand> [options]

Subcommands:
  list <collection>                         List records
  create <collection> --stdin               Create record(s) from JSON stdin
  create <collection> --set key=value       Create with inline key-value pairs
  get <collection> <id>                     Get a single record
  update <collection> <id> --stdin          Update record from JSON stdin
  update <collection> <id> --set key=value  Update with inline key-value pairs
  delete <collection> <id> [--confirm]      Delete a record

List options:
  --filter <expr>     Filter expression (e.g. status='active')
  --sort <fields>     Sort fields (e.g. -created_at,title)
  --page <n>          Page number (default: 1)
  --per-page <n>      Items per page (default: 30)
  --expand <fields>   Comma-separated relation fields to expand
  --search <term>     Full-text search across text fields

Get options:
  --expand <fields>   Comma-separated relation fields to expand

Other options:
  --set key=value     Set field value (repeatable)
  --stdin             Read input from stdin (JSON)
  --confirm           Skip confirmation for destructive operations
  -h, --help          Show this help message`);
  process.exit(0);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of Bun.stdin.stream()) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8").trim();
}

/**
 * Parse --set key=value pairs into a data object.
 * Attempts to parse values as JSON for numbers/booleans/null,
 * otherwise treats them as strings.
 */
function parseSetPairs(sets: string[]): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const pair of sets) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx === -1) {
      outputError("VALIDATION_ERROR", `Invalid --set format: "${pair}". Use key=value.`);
      process.exit(2);
    }
    const key = pair.slice(0, eqIdx);
    const rawValue = pair.slice(eqIdx + 1);

    // Try to parse as JSON literal (number, boolean, null, object, array)
    try {
      data[key] = JSON.parse(rawValue);
    } catch {
      data[key] = rawValue;
    }
  }
  return data;
}

/**
 * Parse a sort string like "-created_at,title" into SortOption[].
 * Leading `-` means descending, `+` or no prefix means ascending.
 */
function parseSortString(sortStr: string): SortOption[] {
  return sortStr.split(",").map((s) => {
    const trimmed = s.trim();
    if (trimmed.startsWith("-")) {
      return { field: trimmed.slice(1), direction: "desc" as const };
    }
    if (trimmed.startsWith("+")) {
      return { field: trimmed.slice(1), direction: "asc" as const };
    }
    return { field: trimmed, direction: "asc" as const };
  });
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
      set: { type: "string", multiple: true },
      filter: { type: "string" },
      sort: { type: "string" },
      page: { type: "string" },
      "per-page": { type: "string" },
      expand: { type: "string" },
      search: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: false,
    allowPositionals: true,
  });

  if (values.help) showHelp();

  const subcommand = positionals[0];

  if (!subcommand) {
    outputError("MISSING_SUBCOMMAND", "Usage: bunbase records <list|create|get|update|delete>");
    process.exit(2);
  }

  try {
    switch (subcommand) {
      case "list":
        return handleList(positionals[1], format, values);
      case "create":
        return await handleCreate(positionals[1], format, values);
      case "get":
        return handleGet(positionals[1], positionals[2], format, values);
      case "update":
        return await handleUpdate(positionals[1], positionals[2], format, values);
      case "delete":
        return handleDelete(positionals[1], positionals[2], values.confirm as boolean);
      default:
        outputError("UNKNOWN_SUBCOMMAND", `Unknown subcommand: ${subcommand}. Use: list, create, get, update, delete`);
        process.exit(2);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    outputError("RECORD_ERROR", message);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Subcommand handlers
// ---------------------------------------------------------------------------

function handleList(
  collection: string | undefined,
  format: "json" | "table",
  values: Record<string, unknown>
): void {
  if (!collection) {
    outputError("VALIDATION_ERROR", "Usage: bunbase records list <collection>");
    process.exit(2);
  }

  const queryOpts: QueryOptions = {};

  // --filter: pass as filterExpr for the expression-based parser
  if (values.filter) {
    queryOpts.filterExpr = values.filter as string;
  }

  // --sort
  if (values.sort) {
    queryOpts.sort = parseSortString(values.sort as string);
  }

  // --page
  if (values.page) {
    const page = parseInt(values.page as string, 10);
    if (isNaN(page) || page < 1) {
      outputError("VALIDATION_ERROR", "--page must be a positive integer.");
      process.exit(2);
    }
    queryOpts.page = page;
  }

  // --per-page
  if (values["per-page"]) {
    const perPage = parseInt(values["per-page"] as string, 10);
    if (isNaN(perPage) || perPage < 1) {
      outputError("VALIDATION_ERROR", "--per-page must be a positive integer.");
      process.exit(2);
    }
    queryOpts.perPage = perPage;
  }

  // --expand
  if (values.expand) {
    queryOpts.expand = (values.expand as string).split(",").map((s) => s.trim());
  }

  // --search
  if (values.search) {
    queryOpts.search = values.search as string;
  }

  // CLI = no auth context (admin-level, skips rule checks)
  const result = listRecordsWithQuery(collection, queryOpts);
  output(result, format);
}

async function handleCreate(
  collection: string | undefined,
  format: "json" | "table",
  values: Record<string, unknown>
): Promise<void> {
  if (!collection) {
    outputError("VALIDATION_ERROR", "Usage: bunbase records create <collection> --stdin|--set key=value");
    process.exit(2);
  }

  const useStdin = values.stdin as boolean;
  const setPairs = values.set as string[] | undefined;

  if (!useStdin && (!setPairs || setPairs.length === 0)) {
    outputError("VALIDATION_ERROR", "records create requires --stdin or --set key=value.");
    process.exit(2);
  }

  if (useStdin) {
    const raw = await readStdin();
    if (!raw) {
      outputError("VALIDATION_ERROR", "No input received on stdin.");
      process.exit(2);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      outputError("VALIDATION_ERROR", "Invalid JSON on stdin.");
      process.exit(2);
      return;
    }

    // Batch: if stdin is an array, create all in a transaction
    if (Array.isArray(parsed)) {
      const db = getDatabase();
      const records: Record<string, unknown>[] = [];
      const batchCreate = db.transaction(() => {
        for (const item of parsed) {
          records.push(createRecord(collection, item as Record<string, unknown>));
        }
      });
      batchCreate();
      output(records, format);
      return;
    }

    // Single record
    const record = createRecord(collection, parsed as Record<string, unknown>);
    output(record, format);
    return;
  }

  // --set key=value pairs
  const data = parseSetPairs(setPairs!);
  const record = createRecord(collection, data);
  output(record, format);
}

function handleGet(
  collection: string | undefined,
  id: string | undefined,
  format: "json" | "table",
  values: Record<string, unknown>
): void {
  if (!collection || !id) {
    outputError("VALIDATION_ERROR", "Usage: bunbase records get <collection> <id>");
    process.exit(2);
  }

  // CLI = no auth context
  const record = getRecord(collection, id);
  if (!record) {
    outputError("NOT_FOUND", `Record "${id}" not found in collection "${collection}"`);
    process.exit(1);
  }

  // Handle --expand for single record get
  if (values.expand) {
    const expandFields = (values.expand as string).split(",").map((s) => s.trim());
    // Use listRecordsWithQuery with id filter + expand for expansion support
    const result = listRecordsWithQuery(collection, {
      filterExpr: `id='${id}'`,
      expand: expandFields,
      perPage: 1,
    });
    if (result.items.length > 0) {
      output(result.items[0], format);
      return;
    }
  }

  output(record, format);
}

async function handleUpdate(
  collection: string | undefined,
  id: string | undefined,
  format: "json" | "table",
  values: Record<string, unknown>
): Promise<void> {
  if (!collection || !id) {
    outputError("VALIDATION_ERROR", "Usage: bunbase records update <collection> <id> --stdin|--set key=value");
    process.exit(2);
  }

  const useStdin = values.stdin as boolean;
  const setPairs = values.set as string[] | undefined;

  if (!useStdin && (!setPairs || setPairs.length === 0)) {
    outputError("VALIDATION_ERROR", "records update requires --stdin or --set key=value.");
    process.exit(2);
  }

  let data: Record<string, unknown>;

  if (useStdin) {
    const raw = await readStdin();
    if (!raw) {
      outputError("VALIDATION_ERROR", "No input received on stdin.");
      process.exit(2);
    }
    try {
      data = JSON.parse(raw);
    } catch {
      outputError("VALIDATION_ERROR", "Invalid JSON on stdin.");
      process.exit(2);
      return;
    }
  } else {
    data = parseSetPairs(setPairs!);
  }

  const record = updateRecord(collection, id, data);
  output(record, format);
}

function handleDelete(
  collection: string | undefined,
  id: string | undefined,
  confirm: boolean
): void {
  if (!collection || !id) {
    outputError("VALIDATION_ERROR", "Usage: bunbase records delete <collection> <id> [--confirm]");
    process.exit(2);
  }

  // Verify record exists
  const record = getRecord(collection, id);
  if (!record) {
    outputError("NOT_FOUND", `Record "${id}" not found in collection "${collection}"`);
    process.exit(1);
  }

  if (!confirm) {
    outputError("CONFIRMATION_REQUIRED", `Pass --confirm to delete record "${id}" from "${collection}".`);
    process.exit(2);
  }

  deleteRecord(collection, id);
  output({ deleted: id, collection }, "json");
}
