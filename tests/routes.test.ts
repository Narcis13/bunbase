/**
 * Route Manifest Generation and Development Mode Tests
 *
 * Tests for:
 * 1. Route manifest generation via build:routes script
 * 2. Custom routes working in development mode
 */

import { test, expect, describe, beforeAll, afterAll } from "bun:test";

// ============================================================================
// Route Manifest Generation Tests
// ============================================================================

describe("Route Manifest Generation", () => {
  test("build:routes executes successfully", async () => {
    const result = Bun.spawnSync(["bun", "run", "build:routes"], {
      cwd: "/Users/narcisbrindusescu/newme/bunbase",
    });

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  test("src/routes-generated.ts exists after build:routes", async () => {
    // Ensure build:routes has run
    Bun.spawnSync(["bun", "run", "build:routes"], {
      cwd: "/Users/narcisbrindusescu/newme/bunbase",
    });

    const file = Bun.file("/Users/narcisbrindusescu/newme/bunbase/src/routes-generated.ts");
    const exists = await file.exists();
    expect(exists).toBe(true);
  });

  test("generated manifest exports buildCustomRoutes function", async () => {
    // Run build:routes first
    Bun.spawnSync(["bun", "run", "build:routes"], {
      cwd: "/Users/narcisbrindusescu/newme/bunbase",
    });

    // Dynamic import the generated module
    const generated = await import("../src/routes-generated");

    expect(typeof generated.buildCustomRoutes).toBe("function");
  });

  test("generated manifest exports routeManifest object", async () => {
    // Run build:routes first
    Bun.spawnSync(["bun", "run", "build:routes"], {
      cwd: "/Users/narcisbrindusescu/newme/bunbase",
    });

    // Dynamic import the generated module
    const generated = await import("../src/routes-generated");

    expect(generated.routeManifest).toBeDefined();
    expect(typeof generated.routeManifest).toBe("object");
    expect(generated.routeManifest.routes).toBeArray();
  });

  test("routeManifest.routes contains /api/health with GET method", async () => {
    // Run build:routes first
    Bun.spawnSync(["bun", "run", "build:routes"], {
      cwd: "/Users/narcisbrindusescu/newme/bunbase",
    });

    // Dynamic import the generated module
    const generated = await import("../src/routes-generated");

    const healthRoute = generated.routeManifest.routes.find(
      (r: { path: string }) => r.path === "/api/health"
    );

    expect(healthRoute).toBeDefined();
    expect(healthRoute.methods).toContain("GET");
  });

  test("routeManifest.routes contains /api/stats with GET method", async () => {
    // Run build:routes first
    Bun.spawnSync(["bun", "run", "build:routes"], {
      cwd: "/Users/narcisbrindusescu/newme/bunbase",
    });

    // Dynamic import the generated module
    const generated = await import("../src/routes-generated");

    const statsRoute = generated.routeManifest.routes.find(
      (r: { path: string }) => r.path === "/api/stats"
    );

    expect(statsRoute).toBeDefined();
    expect(statsRoute.methods).toContain("GET");
  });
});

// ============================================================================
// Development Mode Integration Tests
// ============================================================================

describe("Development Mode Integration", () => {
  const TEST_PORT = 8097;
  const BASE_URL = `http://localhost:${TEST_PORT}`;

  let server: ReturnType<typeof import("../src/api/server").createServer>;
  let db: ReturnType<typeof import("../src/core/database").getDatabase>;

  beforeAll(async () => {
    // Run build:routes first (required for routes-generated.ts)
    Bun.spawnSync(["bun", "run", "build:routes"], {
      cwd: "/Users/narcisbrindusescu/newme/bunbase",
    });

    // Import dependencies
    const { initDatabase, closeDatabase, getDatabase } = await import("../src/core/database");
    const { createServer } = await import("../src/api/server");
    const { buildCustomRoutes } = await import("../src/routes-generated");
    const { HookManager } = await import("../src/core/hooks");
    const { RealtimeManager } = await import("../src/realtime/manager");

    // Initialize in-memory database
    initDatabase(":memory:");
    db = getDatabase();

    // Create HookManager and RealtimeManager instances
    const hooks = new HookManager();
    const realtime = new RealtimeManager();

    // Build custom routes with dependencies
    const customRoutes = buildCustomRoutes({ hooks, realtime });

    // Start server
    server = createServer(TEST_PORT, hooks, realtime, customRoutes);
  });

  afterAll(async () => {
    // Stop server
    if (server) {
      server.stop();
    }

    // Close database
    const { closeDatabase } = await import("../src/core/database");
    closeDatabase();
  });

  test("health route returns 200 with status ok", async () => {
    const res = await fetch(`${BASE_URL}/api/health`);

    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.status).toBe("ok");
  });

  test("health route returns timestamp", async () => {
    const res = await fetch(`${BASE_URL}/api/health`);

    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.timestamp).toBeDefined();
    expect(typeof data.timestamp).toBe("string");
  });

  test("stats route returns 200 with collections array", async () => {
    const res = await fetch(`${BASE_URL}/api/stats`);

    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.collections).toBeArray();
    expect(typeof data.count).toBe("number");
  });

  test("stats route uses database context", async () => {
    // The stats route queries _collections table
    // If no collections exist, response should have count: 0, collections: []
    const res = await fetch(`${BASE_URL}/api/stats`);

    expect(res.status).toBe(200);

    const data = await res.json();
    // Verify that the response structure indicates database access worked
    expect(data).toHaveProperty("collections");
    expect(data).toHaveProperty("count");
    // With in-memory database, should have empty collections
    expect(data.collections).toEqual([]);
    expect(data.count).toBe(0);
  });
});
