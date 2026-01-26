---
phase: 08-single-binary-packaging
plan: 01
subsystem: cli
tags: [cli, argument-parsing, entry-point]

dependency-graph:
  requires: [07-admin-ui-schema-editor]
  provides: [cli-entry-point, argument-parsing]
  affects: [08-02-binary-compilation]

tech-stack:
  added: []
  patterns: [util.parseArgs for zero-dependency CLI]

key-files:
  created:
    - src/cli.ts
  modified:
    - src/api/server.ts

decisions:
  - Use Node's util.parseArgs for zero-dependency argument parsing
  - Use Bun.argv.slice(2) for argument array (skip bun and script path)
  - Exit code 1 for invalid arguments with clean error message

metrics:
  duration: 1m 3s
  completed: 2026-01-26
---

# Phase 8 Plan 1: CLI Entry Point Summary

**One-liner:** CLI entry point using util.parseArgs for --port/-p, --db, --help/-h flags with port validation.

## What Was Built

Created `src/cli.ts` as the entry point for the compiled binary with command-line argument parsing.

### CLI Interface

```
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
```

### Features

1. **Port configuration:** `--port` or `-p` flag (default: 8090)
2. **Database path:** `--db` flag (default: bunbase.db)
3. **Help display:** `--help` or `-h` flag
4. **Port validation:** Range 1-65535, clean error exit on invalid

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Create CLI entry point with argument parsing | f500fb0 | src/cli.ts, src/api/server.ts |

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Use util.parseArgs | Zero dependencies, built into Node (and Bun) |
| Bun.argv.slice(2) | Skip bun executable and script path |
| Exit code 1 for errors | Standard Unix convention |
| Strict mode enabled | Reject unknown options |

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

All verification tests passed:

| Test | Result |
|------|--------|
| `bun src/cli.ts --help` prints usage | PASS |
| Server starts on default port 8090 | PASS |
| `--port 3000` overrides port | PASS |
| `--db custom.db` creates custom database | PASS |
| `--port abc` exits with error | PASS |
| `-p 99999` exits with error | PASS |

## Key Code

### CLI Entry Point (src/cli.ts)

```typescript
import { parseArgs } from "util";
import { startServer } from "./api/server";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    port: { type: "string", short: "p", default: "8090" },
    db: { type: "string", default: "bunbase.db" },
    help: { type: "boolean", short: "h", default: false },
  },
  strict: true,
  allowPositionals: true,
});
```

## Next Phase Readiness

Ready for 08-02 (Binary Compilation):
- CLI entry point exists at src/cli.ts
- All argument parsing implemented
- Server starts correctly with CLI arguments
- No blockers identified
