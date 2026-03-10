/**
 * End-to-end test: CLI setup → API key → HTTP access
 *
 * Tests the full workflow an AI agent would follow:
 * 1. Create a collection via CLI
 * 2. Create records via CLI
 * 3. Create an API key via CLI
 * 4. Use the API key to access records over HTTP
 */

import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import type { Subprocess } from "bun";
import { unlinkSync, existsSync } from "node:fs";

const TEST_DB = "test-e2e.db";
// Use a random port to avoid conflicts with previous test runs
const TEST_PORT = 9100 + Math.floor(Math.random() * 900);
const BASE_URL = `http://localhost:${TEST_PORT}`;
const CLI_ENTRY = `${import.meta.dir}/../src/cli.ts`;

function runCli(args: string[], stdin?: string): { stdout: string; stderr: string; exitCode: number } {
  const proc = Bun.spawnSync(["bun", CLI_ENTRY, ...args, "--db", TEST_DB], {
    cwd: import.meta.dir + "/..",
    stdin: stdin ? new TextEncoder().encode(stdin) : undefined,
    timeout: 10000,
  });
  return {
    stdout: new TextDecoder().decode(proc.stdout).trim(),
    stderr: new TextDecoder().decode(proc.stderr).trim(),
    exitCode: proc.exitCode,
  };
}

function cleanup() {
  for (const suffix of ["", "-wal", "-shm"]) {
    try { unlinkSync(TEST_DB + suffix); } catch {}
  }
}

describe("E2E: CLI setup → API key → HTTP access", () => {
  let apiKey: string;
  let proc: Subprocess<"ignore", "pipe", "pipe"> | null = null;
  let abortController: AbortController;

  beforeAll(() => {
    cleanup();
  });

  afterAll(async () => {
    if (proc) {
      try {
        abortController.abort();
        await proc.exited;
      } catch {}
    }
    cleanup();
  });

  // -----------------------------------------------------------------------
  // Phase 1: CLI collection setup
  // -----------------------------------------------------------------------

  test("1. create a collection via CLI", () => {
    const input = JSON.stringify({
      name: "tasks",
      type: "base",
      fields: [
        { name: "title", type: "text", required: true },
        { name: "done", type: "boolean", required: false },
      ],
    });

    const result = runCli(["collections", "create", "--stdin"], input);
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout);
    expect(parsed.name).toBe("tasks");
  });

  test("2. list collections shows the new collection", () => {
    const result = runCli(["collections", "list"]);
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout);
    expect(parsed).toBeArrayOfSize(1);
    expect(parsed[0].name).toBe("tasks");
    expect(parsed[0].fields).toBeGreaterThanOrEqual(2);
  });

  test("3. list fields for the collection", () => {
    const result = runCli(["collections", "fields", "tasks"]);
    expect(result.exitCode).toBe(0);

    const fields = JSON.parse(result.stdout);
    const fieldNames = fields.map((f: { name: string }) => f.name);
    expect(fieldNames).toContain("title");
    expect(fieldNames).toContain("done");
  });

  // -----------------------------------------------------------------------
  // Phase 2: CLI record operations
  // -----------------------------------------------------------------------

  test("4. create a record via --stdin", () => {
    const input = JSON.stringify({ title: "Write tests", done: false });
    const result = runCli(["records", "create", "tasks", "--stdin"], input);
    expect(result.exitCode).toBe(0);

    const record = JSON.parse(result.stdout);
    expect(record.title).toBe("Write tests");
    expect(record.id).toBeTruthy();
  });

  test("5. create a record via --set", () => {
    const result = runCli(["records", "create", "tasks", "--set", "title=Deploy app", "--set", "done=false"]);
    expect(result.exitCode).toBe(0);

    const record = JSON.parse(result.stdout);
    expect(record.title).toBe("Deploy app");
  });

  test("6. batch create records via stdin array", () => {
    const batch = JSON.stringify([
      { title: "Task A", done: false },
      { title: "Task B", done: true },
    ]);
    const result = runCli(["records", "create", "tasks", "--stdin"], batch);
    expect(result.exitCode).toBe(0);

    const records = JSON.parse(result.stdout);
    expect(records).toBeArrayOfSize(2);
  });

  test("7. list records via CLI", () => {
    const result = runCli(["records", "list", "tasks"]);
    expect(result.exitCode).toBe(0);

    const data = JSON.parse(result.stdout);
    expect(data.items.length).toBe(4);
    expect(data.totalItems).toBe(4);
  });

  // -----------------------------------------------------------------------
  // Phase 3: API key creation via CLI
  // -----------------------------------------------------------------------

  test("8. create an API key via CLI", async () => {
    const result = runCli(["apikeys", "create", "--name", "e2e-test-agent"]);
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout);
    expect(parsed.key).toStartWith("bb_");
    expect(parsed.name).toBe("e2e-test-agent");

    apiKey = parsed.key;
  });

  test("9. list API keys shows the new key", () => {
    const result = runCli(["apikeys", "list"]);
    expect(result.exitCode).toBe(0);

    const keys = JSON.parse(result.stdout);
    expect(keys).toBeArrayOfSize(1);
    expect(keys[0].name).toBe("e2e-test-agent");
    // Should NOT expose the hash or raw key
    expect(keys[0]).not.toHaveProperty("key_hash");
    expect(keys[0]).not.toHaveProperty("key");
  });

  // -----------------------------------------------------------------------
  // Phase 4: Start HTTP server and test API key access
  // -----------------------------------------------------------------------

  test("10. start server and access records with API key", async () => {
    abortController = new AbortController();

    proc = Bun.spawn(["bun", CLI_ENTRY, "serve", "--port", String(TEST_PORT), "--db", TEST_DB], {
      cwd: import.meta.dir + "/..",
      stdout: "pipe",
      stderr: "pipe",
      signal: abortController.signal,
    });

    // Wait for server to be ready
    const maxWait = 10000;
    const startTime = Date.now();
    while (Date.now() - startTime < maxWait) {
      try {
        const resp = await fetch(`${BASE_URL}/api/health`);
        if (resp.ok) break;
      } catch {}
      await Bun.sleep(100);
    }

    // List records using API key
    const response = await fetch(`${BASE_URL}/api/collections/tasks/records`, {
      headers: { "X-API-Key": apiKey },
    });

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.items.length).toBe(4);
    expect(body.totalItems).toBe(4);
  });

  test("11. create a record via HTTP with API key", async () => {
    const response = await fetch(`${BASE_URL}/api/collections/tasks/records`, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: "Created via HTTP", done: false }),
    });

    expect(response.status).toBe(201);

    const record = await response.json();
    expect(record.title).toBe("Created via HTTP");
    expect(record.id).toBeTruthy();
  });

  test("12. reject request with invalid API key", async () => {
    const response = await fetch(`${BASE_URL}/api/collections/tasks/records`, {
      headers: { "X-API-Key": "bb_invalidkeyinvalidkeyinvalidkey12" },
    });

    // Should fail — no valid auth means rules apply (default rules deny)
    expect(response.status).not.toBe(200);
  });

  test("13. reject request with no auth", async () => {
    // Default collection rules should deny unauthenticated access
    const response = await fetch(`${BASE_URL}/api/collections/tasks/records`);
    expect(response.status).not.toBe(200);
  });

  // -----------------------------------------------------------------------
  // Phase 5: CLI help text verification
  // -----------------------------------------------------------------------

  test("14. top-level --help works", () => {
    const result = runCli(["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("bunbase");
    expect(result.stdout).toContain("collections");
    expect(result.stdout).toContain("records");
    expect(result.stdout).toContain("apikeys");
  });

  test("15. serve --help works", () => {
    const result = runCli(["serve", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("--port");
    expect(result.stdout).toContain("--db");
  });

  test("16. collections --help works", () => {
    const result = runCli(["collections", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("list");
    expect(result.stdout).toContain("create");
    expect(result.stdout).toContain("delete");
    expect(result.stdout).toContain("fields");
    expect(result.stdout).toContain("rules");
  });

  test("17. records --help works", () => {
    const result = runCli(["records", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("list");
    expect(result.stdout).toContain("create");
    expect(result.stdout).toContain("get");
    expect(result.stdout).toContain("update");
    expect(result.stdout).toContain("delete");
  });

  test("18. admin --help works", () => {
    const result = runCli(["admin", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("create");
    expect(result.stdout).toContain("reset-password");
  });

  test("19. apikeys --help works", () => {
    const result = runCli(["apikeys", "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("create");
    expect(result.stdout).toContain("list");
    expect(result.stdout).toContain("revoke");
  });
});
