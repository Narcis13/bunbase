---
phase: 11
plan: 06
title: File Cleanup Hooks
subsystem: storage
tags: ["file-storage", "hooks", "cleanup", "afterDelete"]
depends_on:
  requires: ["11-02", "11-04"]
  provides: ["automatic-file-cleanup", "file-cleanup-hook"]
  affects: []
tech_stack:
  added: []
  patterns: ["afterDelete hook pattern", "graceful error handling"]
key_files:
  created:
    - src/storage/hooks.ts
    - src/storage/hooks.test.ts
  modified:
    - src/api/server.ts
    - src/core/database.ts
decisions:
  - id: "cleanup-hook-location"
    choice: "Global afterDelete hook in storage/hooks module"
    rationale: "Separates file concerns from core hook module"
  - id: "cleanup-error-handling"
    choice: "Log errors but don't throw"
    rationale: "Record deletion is successful, file cleanup is best-effort"
metrics:
  duration: "10m"
  completed: "2026-01-27"
---

# Phase 11 Plan 06: File Cleanup Hooks Summary

**One-liner:** afterDelete hook that auto-deletes record's storage directory using graceful error handling

## What Changed

### Created: `src/storage/hooks.ts`
File cleanup hook module that:
- Checks if collection has file fields before attempting cleanup
- Registers global afterDelete hook via HookManager
- Deletes entire record storage directory on deletion
- Logs errors but doesn't throw (graceful degradation)
- Returns unsubscribe function for cleanup

### Created: `src/storage/hooks.test.ts`
Comprehensive test suite (5 tests):
- Files deleted when record with file field is deleted
- No error for collections without file fields
- Chain continues even if cleanup fails
- Unsubscribe function works correctly
- Multiple files deleted together

### Modified: `src/api/server.ts`
- Added import for registerFileCleanupHook
- Updated startServer to create HookManager if not provided
- Register file cleanup hook before server starts handling requests
- Pass hookManager to createServer for consistent usage

### Modified: `src/core/database.ts`
- Fixed CHECK constraint on _fields table to include 'file' type
- This was a bug - the file type was in TypeScript types but not in SQL schema

## Decisions Made

| Decision | Choice | Why |
|----------|--------|-----|
| Hook location | storage/hooks.ts module | Keeps file-related code in storage layer |
| Error handling | Log and continue | Record deletion succeeds even if file cleanup fails |
| Hook scope | Global (not collection-specific) | All collections with file fields need cleanup |
| Cleanup method | Delete entire record directory | Simpler than tracking individual files |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Missing 'file' type in database CHECK constraint**

- **Found during:** Task 3 (running tests)
- **Issue:** The _fields table CHECK constraint only included text, number, boolean, datetime, json, relation - missing 'file'
- **Fix:** Added 'file' to the CHECK constraint in INIT_METADATA_SQL
- **Files modified:** src/core/database.ts
- **Commit:** e4c2684 (combined with Task 3)

**Note:** Task 2 changes were already merged into HEAD by a previous execution (11-05 commit). The changes were verified present and working.

## Key Code

```typescript
// src/storage/hooks.ts
export function registerFileCleanupHook(hooks: HookManager): () => void {
  return hooks.on("afterDelete", async (ctx, next) => {
    if (hasFileFields(ctx.collection)) {
      try {
        await deleteRecordFiles(ctx.collection, ctx.id);
      } catch (error) {
        // Log but don't throw - record is already deleted
        console.error(
          `Failed to delete files for record ${ctx.collection}/${ctx.id}:`,
          error
        );
      }
    }
    await next();
  });
}
```

## Tests

All 5 tests pass:
- `deletes files when record with file field is deleted`
- `does not error for collections without file fields`
- `continues chain even if cleanup fails`
- `returns unsubscribe function`
- `deletes multiple files for a record`

## Files for AI Context

When working on file cleanup:
- `src/storage/hooks.ts` - File cleanup hook registration
- `src/storage/files.ts` - deleteRecordFiles function
- `src/core/hooks.ts` - HookManager implementation

## Next Phase Readiness

Phase 11 (File Uploads) is now complete with all 6 plans executed:
- 11-01: File type and sanitization
- 11-02: File storage operations
- 11-03: File validation
- 11-04: Multipart upload integration
- 11-05: File serving and URLs
- 11-06: File cleanup hooks

All file upload requirements (FILE-01 through FILE-09) are implemented.
