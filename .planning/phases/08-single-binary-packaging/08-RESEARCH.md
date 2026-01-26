# Phase 8: Single Binary Packaging - Research

**Researched:** 2026-01-26
**Domain:** Bun compile, single executable, embedded frontend assets
**Confidence:** HIGH

## Summary

This phase packages BunBase into a single executable binary that includes the embedded React admin UI, similar to how PocketBase ships as a single Go binary. Bun's `--compile` flag natively supports this pattern when using HTML imports with `Bun.serve()`, which is already how the project is structured.

The current codebase is well-positioned for single binary compilation:
- Server uses `Bun.serve()` with routes object (correct pattern)
- Admin HTML is imported via `import adminHtml from "../admin/index.html"` (correct pattern)
- HTML references `./styles/globals.css` and `./main.tsx` (Bun auto-bundles these)
- No native node_modules dependencies that would break compilation

**Primary recommendation:** Use `bun build --compile --minify src/api/server.ts --outfile bunbase` with a CLI wrapper that parses `--port` and `--db` arguments using Node's built-in `util.parseArgs`.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Bun | 1.3.2+ | Runtime + bundler + compiler | Built-in `--compile` flag handles everything |
| bun:sqlite | built-in | SQLite database | Already used, compiles cleanly |
| util.parseArgs | Node built-in | CLI argument parsing | Zero dependencies, works in compiled binary |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| bun-plugin-tailwind | 0.1.2 | Tailwind CSS bundling | Already in devDependencies, used at build time |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| util.parseArgs | commander, yargs | More features but adds dependencies; for simple --port and --db flags, util.parseArgs is sufficient |
| Single entry point | Separate build steps | Bun handles frontend bundling automatically when HTML is imported |

**Installation:**
```bash
# No new dependencies needed - everything is already in place
```

## Architecture Patterns

### Recommended Project Structure

```
src/
├── cli.ts                 # NEW: CLI entry point with argument parsing
├── api/
│   └── server.ts         # Existing server (startServer function)
├── admin/
│   ├── index.html        # Entry point for admin UI (already imported)
│   ├── main.tsx          # React entry (auto-bundled)
│   └── styles/
│       └── globals.css   # Tailwind (auto-bundled)
└── core/
    └── database.ts       # SQLite initialization
```

### Pattern 1: CLI Entry Point with Argument Parsing

**What:** Create a dedicated CLI entry point that parses arguments before starting the server.

**When to use:** Always - this is the correct pattern for compiled executables.

**Example:**
```typescript
// src/cli.ts
// Source: Bun official docs - https://bun.com/docs/guides/process/argv
import { parseArgs } from "util";
import { startServer } from "./api/server";

const { values } = parseArgs({
  args: Bun.argv,
  options: {
    port: {
      type: "string",
      short: "p",
      default: "8090",
    },
    db: {
      type: "string",
      default: "bunbase.db",
    },
    help: {
      type: "boolean",
      short: "h",
    },
  },
  strict: true,
  allowPositionals: true,
});

if (values.help) {
  console.log(`
BunBase - Backend-in-a-box

Usage: bunbase [options]

Options:
  -p, --port <port>  Port to listen on (default: 8090)
  --db <path>        Database file path (default: bunbase.db)
  -h, --help         Show this help message
`);
  process.exit(0);
}

const port = parseInt(values.port!, 10);
if (isNaN(port) || port < 1 || port > 65535) {
  console.error("Error: Invalid port number");
  process.exit(1);
}

startServer(port, values.db!);
```

### Pattern 2: HTML Import for Embedded Frontend

**What:** Import HTML files directly in server code; Bun bundles all referenced assets.

**When to use:** Already implemented - this is how admin UI is served.

**Example:**
```typescript
// Source: Bun official docs - https://bun.com/docs/bundler/fullstack
import adminHtml from "../admin/index.html";

Bun.serve({
  routes: {
    "/_/": adminHtml,
    "/_/*": adminHtml, // SPA catch-all
  },
});
```

### Pattern 3: SQLite Database Path at Runtime

**What:** Database file path is resolved at runtime, not embedded in binary.

**When to use:** Always for writable databases.

**Example:**
```typescript
// Source: Bun official docs - https://bun.com/docs/bundler/executables
// Database is created relative to CWD where executable runs
import { Database } from "bun:sqlite";
const db = new Database(dbPath, { create: true, strict: true });
```

**Important:** Do NOT use `import db from "./my.db" with { type: "sqlite", embed: "true" }` - embedded databases are read-only at runtime and changes are lost when the process exits.

### Anti-Patterns to Avoid

- **Embedding the database:** Never use `embed: "true"` for SQLite databases that need to persist writes
- **Using external asset files:** All frontend assets should be bundled via HTML imports, not loaded from disk at runtime
- **Custom bundling pipelines:** Don't use webpack/esbuild/vite for frontend - Bun's HTML imports handle everything
- **Dynamic imports from node_modules at runtime:** All npm dependencies should be bundled at compile time

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CLI argument parsing | Manual argv parsing | util.parseArgs | Handles edge cases, short flags, type coercion |
| Frontend bundling | Custom build step | Bun HTML imports | Auto-bundles TSX, CSS, Tailwind |
| Asset embedding | Manual file reading | Bun compile | HTML imports automatically embed all assets |
| Cross-compilation | Platform-specific scripts | `--target` flag | Bun supports linux/darwin/windows x64/arm64 |

**Key insight:** Bun's `--compile` flag with HTML imports handles 90% of the work automatically. The only custom code needed is CLI argument parsing.

## Common Pitfalls

### Pitfall 1: Large Binary Size

**What goes wrong:** Compiled binaries are ~50-70MB because they include the full Bun runtime.

**Why it happens:** Bun embeds its entire runtime (including V8/JSC engine) in the binary.

**How to avoid:** Accept this as expected behavior. PocketBase (Go) is ~15MB, BunBase will be larger. Use `--minify` to reduce JavaScript bundle size, but runtime size is fixed.

**Warning signs:** None - this is expected, not a bug.

### Pitfall 2: Database Path Resolution

**What goes wrong:** SQLite database is created in unexpected location.

**Why it happens:** Database path is resolved relative to the process's current working directory (CWD), not the executable location.

**How to avoid:** Document this behavior. Users run `./bunbase` from the directory where they want `bunbase.db` created. Alternatively, use absolute paths.

**Warning signs:** Users report "database not found" when running from different directories.

### Pitfall 3: Missing `--minify` Flag

**What goes wrong:** Binary contains readable source code in frontend bundle.

**Why it happens:** Without `--minify`, JavaScript/CSS is bundled but not minified.

**How to avoid:** Always use `bun build --compile --minify` for production builds.

**Warning signs:** Binary size larger than expected, or source visible with `strings` command.

### Pitfall 4: Native Binaries in node_modules

**What goes wrong:** Binary fails with "module not found" errors.

**Why it happens:** Some npm packages (sharp, bcrypt) include native binaries that aren't embedded.

**How to avoid:** This project uses pure JavaScript/TypeScript dependencies only:
- `jose` for JWT (pure JS)
- Bun's built-in password hashing via `Bun.password.hash()`
- `bun:sqlite` (built into Bun runtime)

**Warning signs:** Errors mentioning `.node` files or native bindings.

### Pitfall 5: Tailwind CSS Not Processing

**What goes wrong:** CSS classes don't apply, styles missing.

**Why it happens:** Tailwind needs `bun-plugin-tailwind` configured or CSS imported correctly.

**How to avoid:** Project already has this working:
- `globals.css` uses `@import "tailwindcss"` (Tailwind v4 syntax)
- `bun-plugin-tailwind` is in devDependencies
- HTML links to `./styles/globals.css`

**Warning signs:** Unstyled UI, missing Tailwind classes in output.

## Code Examples

### Build Command (Production)

```bash
# Source: Bun official docs
bun build --compile --minify src/cli.ts --outfile bunbase
```

### Build Script (package.json)

```json
{
  "scripts": {
    "build": "bun build --compile --minify src/cli.ts --outfile bunbase"
  }
}
```

### Cross-Platform Builds

```bash
# Source: Bun official docs - https://bun.com/docs/bundler/executables
# macOS ARM (M1/M2/M3)
bun build --compile --minify --target=bun-darwin-arm64 src/cli.ts --outfile bunbase-darwin-arm64

# macOS Intel
bun build --compile --minify --target=bun-darwin-x64 src/cli.ts --outfile bunbase-darwin-x64

# Linux x64
bun build --compile --minify --target=bun-linux-x64 src/cli.ts --outfile bunbase-linux-x64

# Linux ARM
bun build --compile --minify --target=bun-linux-arm64 src/cli.ts --outfile bunbase-linux-arm64

# Windows x64
bun build --compile --minify --target=bun-windows-x64 src/cli.ts --outfile bunbase-windows-x64.exe
```

### CLI Entry Point (Complete)

```typescript
// src/cli.ts
import { parseArgs } from "util";
import { startServer } from "./api/server";

const { values } = parseArgs({
  args: Bun.argv,
  options: {
    port: {
      type: "string",
      short: "p",
      default: "8090",
    },
    db: {
      type: "string",
      default: "bunbase.db",
    },
    help: {
      type: "boolean",
      short: "h",
    },
  },
  strict: true,
  allowPositionals: true,
});

if (values.help) {
  console.log(`
BunBase - Backend-in-a-box

Usage: bunbase [options]

Options:
  -p, --port <port>  Port to listen on (default: 8090)
  --db <path>        Database file path (default: bunbase.db)
  -h, --help         Show this help message

Examples:
  bunbase                    # Start on port 8090 with bunbase.db
  bunbase --port 3000        # Start on port 3000
  bunbase --db ./data/app.db # Use custom database path
`);
  process.exit(0);
}

const port = parseInt(values.port!, 10);
if (isNaN(port) || port < 1 || port > 65535) {
  console.error("Error: Invalid port number");
  process.exit(1);
}

await startServer(port, values.db!);
```

### Verification Test

```typescript
// src/cli.test.ts
import { test, expect } from "bun:test";
import { spawn } from "bun";
import { existsSync, unlinkSync } from "node:fs";

test("compiled binary starts and serves admin UI", async () => {
  // Build the binary first
  const build = spawn(["bun", "build", "--compile", "--minify", "src/cli.ts", "--outfile", "test-bunbase"]);
  await build.exited;
  expect(existsSync("test-bunbase")).toBe(true);

  // Start the binary on a test port
  const proc = spawn(["./test-bunbase", "--port", "9999", "--db", "test.db"]);

  // Wait for server to start
  await Bun.sleep(1000);

  // Test that admin UI is served
  const res = await fetch("http://localhost:9999/_/");
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/html");

  // Cleanup
  proc.kill();
  unlinkSync("test-bunbase");
  unlinkSync("test.db");
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate frontend build | HTML imports | Bun 1.0 | No webpack/vite needed |
| Commander/yargs for CLI | util.parseArgs | Node 18.3 | Zero dependencies |
| bcrypt for passwords | Bun.password | Bun 0.1 | No native bindings |
| node --pkg or pkg | bun build --compile | Bun 1.0 | Native support |

**Deprecated/outdated:**
- `pkg` (Vercel's old Node compiler): Bun has native compile support
- Manual asset embedding: HTML imports handle this automatically
- PostCSS/autoprefixer: Bun's CSS bundler handles this

## Open Questions

### 1. Binary Size Optimization

- **What we know:** Binaries are ~50-70MB including Bun runtime
- **What's unclear:** Whether `--smol` flag reduces runtime size
- **Recommendation:** Test with `--compile-exec-argv="--smol"` to see if it helps. Document expected size in README.

### 2. Windows Icon/Metadata

- **What we know:** Bun supports `--windows-icon`, `--windows-title`, etc.
- **What's unclear:** Whether we need these for v1.0
- **Recommendation:** Defer to post-MVP. Add if users request Windows builds with proper metadata.

### 3. GitHub Actions Build Matrix

- **What we know:** Cross-compilation works with `--target` flag
- **What's unclear:** Exact CI configuration for multi-platform releases
- **Recommendation:** Create GitHub Actions workflow that builds for all platforms on release tags.

## Sources

### Primary (HIGH confidence)

- `/oven-sh/bun` (Context7) - Standalone executables, HTML imports, fullstack bundling
- Bun official docs: https://bun.com/docs/bundler/executables
- Bun official docs: https://bun.com/docs/bundler/fullstack

### Secondary (MEDIUM confidence)

- PocketBase architecture analysis: https://deepwiki.com/pocketbase/pocketbase/5-admin-ui
- Bun GitHub issues on compile: https://github.com/oven-sh/bun/issues/14676

### Tertiary (LOW confidence)

- Community blog posts on Bun compile (2025) - used for pitfall discovery

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Official Bun docs confirm all patterns
- Architecture: HIGH - Current codebase already follows correct patterns
- Pitfalls: MEDIUM - Gathered from GitHub issues and community reports

**Research date:** 2026-01-26
**Valid until:** 2026-02-26 (Bun is fast-moving, verify if doing this later)
