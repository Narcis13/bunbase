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
