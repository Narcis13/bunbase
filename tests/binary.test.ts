/**
 * Binary Compilation and Integration Tests
 *
 * Tests for:
 * 1. Binary compilation via `bun run build`
 * 2. Binary execution and route handling
 * 3. Custom routes working identically in compiled binary
 */

import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import type { Subprocess } from "bun";

const PROJECT_ROOT = "/Users/narcisbrindusescu/newme/bunbase";
const BINARY_PATH = `${PROJECT_ROOT}/bunbase`;
const BINARY_PORT = 8099;
const BASE_URL = `http://localhost:${BINARY_PORT}`;

// ============================================================================
// Binary Compilation Tests
// ============================================================================

describe("Binary Compilation", () => {
  test("bun run build completes successfully", () => {
    const result = Bun.spawnSync(["bun", "run", "build"], {
      cwd: PROJECT_ROOT,
      timeout: 60000, // 60 seconds for compilation
    });

    if (!result.success) {
      const stderr = new TextDecoder().decode(result.stderr);
      console.error("Build failed with stderr:", stderr);
    }

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  test("bunbase binary exists after build", async () => {
    const file = Bun.file(BINARY_PATH);
    const exists = await file.exists();
    expect(exists).toBe(true);
  });

  test("bunbase binary is executable", () => {
    const result = Bun.spawnSync([BINARY_PATH, "--help"], {
      cwd: PROJECT_ROOT,
      timeout: 5000,
    });

    // --help should exit with code 0
    expect(result.exitCode).toBe(0);
  });
});

// ============================================================================
// Binary Integration Tests
// ============================================================================

describe("Binary Integration Tests", () => {
  let proc: Subprocess<"ignore", "pipe", "pipe"> | null = null;
  let abortController: AbortController;

  beforeAll(async () => {
    abortController = new AbortController();

    // Ensure binary is built
    const buildResult = Bun.spawnSync(["bun", "run", "build"], {
      cwd: PROJECT_ROOT,
      timeout: 60000,
    });

    if (!buildResult.success) {
      throw new Error("Failed to build binary for integration tests");
    }

    // Spawn binary server
    proc = Bun.spawn([BINARY_PATH, "serve", "--port", String(BINARY_PORT), "--db", ":memory:"], {
      cwd: PROJECT_ROOT,
      stdout: "pipe",
      stderr: "pipe",
      signal: abortController.signal,
    });

    // Poll health endpoint until server is ready
    const maxWait = 10000; // 10 seconds
    const pollInterval = 100; // 100ms
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      try {
        const response = await fetch(`${BASE_URL}/api/health`);
        if (response.ok) {
          return; // Server is ready
        }
      } catch {
        // Server not ready yet, continue polling
      }
      await Bun.sleep(pollInterval);
    }

    // Cleanup on failure
    abortController.abort();
    throw new Error(`Server did not start within ${maxWait}ms`);
  });

  afterAll(async () => {
    if (proc) {
      try {
        abortController.abort();
        await proc.exited;
      } catch {
        // Process may already be terminated
      }
    }
  });

  test("health route returns 200 with status ok", async () => {
    const response = await fetch(`${BASE_URL}/api/health`);

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeDefined();
    expect(typeof body.timestamp).toBe("string");
  });

  test("stats route returns 200 with collections", async () => {
    const response = await fetch(`${BASE_URL}/api/stats`);

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body.collections)).toBe(true);
    expect(typeof body.count).toBe("number");
  });

  test("stats route reflects actual database state", async () => {
    // With :memory: database, should start with no collections
    const response = await fetch(`${BASE_URL}/api/stats`);
    const body = await response.json();

    expect(body.count).toBe(0);
    expect(body.collections).toEqual([]);
  });

  test("custom routes have correct Content-Type", async () => {
    const response = await fetch(`${BASE_URL}/api/health`);

    const contentType = response.headers.get("Content-Type");
    expect(contentType).toContain("application/json");
  });
});
