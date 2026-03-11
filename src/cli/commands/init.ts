/**
 * `bunbase init` command — bootstrap a database from schema and seed files.
 *
 * Creates multiple collections, fields, rules, and seed records atomically
 * in a single transaction. Agents can generate a JSON schema file and apply
 * it instead of making 20+ HTTP calls.
 *
 * Usage:
 *   bunbase init --collections schema.json [--seed seed.json] [--db ./app.db]
 *   cat schema.json | bunbase init --stdin [--seed seed.json]
 */

import { parseArgs } from "util";
import { output, outputError } from "../output";
import { getDatabase } from "../../core/database";
import { createCollection, getCollection, deleteCollection } from "../../core/schema";
import { createRecord } from "../../core/records";
import type { FieldInput } from "../../core/schema";
import type { CollectionRules } from "../../types/collection";

interface CollectionSchema {
  name: string;
  type?: "base" | "auth";
  fields: FieldInput[];
  rules?: CollectionRules;
}

interface SeedData {
  [collectionName: string]: Record<string, unknown>[];
}

function showHelp(): void {
  console.log(`Usage: bunbase init [options]

Bootstrap a database from JSON schema and optional seed data.
All collections and records are created atomically in a single transaction.

Options:
  --collections <file>  Path to JSON file defining collections
  --seed <file>         Path to JSON file with seed data per collection
  --stdin               Read collections schema from stdin instead of file
  --force               Drop existing collections before creating (use with caution)
  -h, --help            Show this help message

Schema file format (collections):
  [
    {
      "name": "tasks",
      "type": "base",
      "fields": [
        { "name": "title", "type": "text", "required": true },
        { "name": "status", "type": "text", "required": false }
      ],
      "rules": {
        "listRule": "",
        "viewRule": "",
        "createRule": "",
        "updateRule": "",
        "deleteRule": ""
      }
    }
  ]

Seed file format:
  {
    "tasks": [
      { "title": "First task", "status": "todo" },
      { "title": "Second task", "status": "done" }
    ]
  }

Examples:
  bunbase init --collections schema.json
  bunbase init --collections schema.json --seed seed.json
  cat schema.json | bunbase init --stdin --seed seed.json
  bunbase init --collections schema.json --force`);
  process.exit(0);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of Bun.stdin.stream()) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8").trim();
}

async function readJsonFile(filePath: string): Promise<unknown> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    throw new Error(`File not found: ${filePath}`);
  }
  const text = await file.text();
  return JSON.parse(text);
}

export async function execute(
  args: string[],
  format: "json" | "table" = "json"
): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      collections: { type: "string" },
      seed: { type: "string" },
      stdin: { type: "boolean", default: false },
      force: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: true,
    allowPositionals: false,
  });

  if (values.help) showHelp();

  const useStdin = values.stdin as boolean;
  const collectionsFile = values.collections as string | undefined;
  const seedFile = values.seed as string | undefined;
  const force = values.force as boolean;

  if (!useStdin && !collectionsFile) {
    outputError(
      "VALIDATION_ERROR",
      "bunbase init requires --collections <file> or --stdin. Run 'bunbase init --help' for usage."
    );
    process.exit(2);
  }

  try {
    // Read collections schema
    let schemas: CollectionSchema[];
    if (useStdin) {
      const raw = await readStdin();
      if (!raw) {
        outputError("VALIDATION_ERROR", "No input received on stdin.");
        process.exit(2);
      }
      schemas = JSON.parse(raw);
    } else {
      schemas = (await readJsonFile(collectionsFile!)) as CollectionSchema[];
    }

    if (!Array.isArray(schemas)) {
      outputError("VALIDATION_ERROR", "Collections schema must be a JSON array of collection definitions.");
      process.exit(2);
    }

    // Validate schemas
    for (const schema of schemas) {
      if (!schema.name || typeof schema.name !== "string") {
        outputError("VALIDATION_ERROR", "Each collection must have a 'name' string.");
        process.exit(2);
      }
      if (!Array.isArray(schema.fields)) {
        outputError("VALIDATION_ERROR", `Collection "${schema.name}" must have a 'fields' array.`);
        process.exit(2);
      }
    }

    // Read seed data if provided
    let seedData: SeedData | null = null;
    if (seedFile) {
      seedData = (await readJsonFile(seedFile)) as SeedData;
      if (typeof seedData !== "object" || Array.isArray(seedData)) {
        outputError("VALIDATION_ERROR", "Seed file must be a JSON object mapping collection names to record arrays.");
        process.exit(2);
      }
    }

    // Execute everything in a single transaction
    const db = getDatabase();
    const results: {
      collections: Array<{ name: string; type: string; fields: number }>;
      records: { [collection: string]: number };
      skipped: string[];
    } = {
      collections: [],
      records: {},
      skipped: [],
    };

    const initTransaction = db.transaction(() => {
      // Create collections
      for (const schema of schemas) {
        // Check if collection already exists
        const existing = getCollection(schema.name);
        if (existing) {
          if (force) {
            deleteCollection(schema.name);
          } else {
            results.skipped.push(schema.name);
            continue;
          }
        }

        createCollection(schema.name, schema.fields, {
          type: schema.type,
          rules: schema.rules,
        });

        results.collections.push({
          name: schema.name,
          type: schema.type ?? "base",
          fields: schema.fields.length,
        });
      }

      // Seed records
      if (seedData) {
        for (const [collectionName, records] of Object.entries(seedData)) {
          if (!Array.isArray(records)) continue;

          // Verify collection exists (either just created or pre-existing)
          const collection = getCollection(collectionName);
          if (!collection) {
            throw new Error(
              `Seed data references collection "${collectionName}" which does not exist and was not created.`
            );
          }

          let count = 0;
          for (const record of records) {
            createRecord(collectionName, record);
            count++;
          }
          results.records[collectionName] = count;
        }
      }
    });

    initTransaction();

    output(results, format);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    outputError("INIT_ERROR", message);
    process.exit(1);
  }
}
