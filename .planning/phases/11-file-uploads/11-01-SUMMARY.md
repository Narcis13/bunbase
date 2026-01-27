---
phase: 11-file-uploads
plan: 01
subsystem: storage
tags: [file-upload, sanitization, nanoid, path-traversal, security]

# Dependency graph
requires:
  - phase: 09-email-service
    provides: infrastructure patterns
  - phase: 10-user-authentication
    provides: auth collection types
provides:
  - File field type in FieldType union
  - FileFieldOptions (maxFiles, maxSize, allowedTypes)
  - sanitizeFilename function for secure file naming
affects: [11-02, 11-03, 11-04, 11-05, 11-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Filename sanitization for path traversal prevention
    - Random suffix generation for collision prevention
    - Cross-platform path normalization (Windows backslash handling)

key-files:
  created:
    - src/storage/sanitize.ts
    - src/storage/sanitize.test.ts
  modified:
    - src/types/collection.ts

key-decisions:
  - "File field stored as TEXT (JSON array of filenames)"
  - "10-char random suffix via nanoid (matches PocketBase)"
  - "Normalize Windows backslashes before path parsing"
  - "Truncate base filename to 100 chars max"
  - "Preserve extension in lowercase"

patterns-established:
  - "Storage module location: src/storage/"
  - "Sanitization before storage, not on read"

# Metrics
duration: 4min
completed: 2026-01-27
---

# Phase 11 Plan 01: File Field Type and Sanitization Summary

**File field type added to schema with filename sanitization using nanoid for collision prevention and path traversal protection**

## Performance

- **Duration:** 4 min
- **Started:** 2026-01-27T12:00:00Z
- **Completed:** 2026-01-27T12:04:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added 'file' to FieldType union for schema definitions
- Implemented FileFieldOptions (maxFiles, maxSize, allowedTypes) in FieldOptions interface
- Created sanitizeFilename function that prevents path traversal attacks
- Added 10-character random suffix generation for filename uniqueness
- Built comprehensive test suite with 10 tests covering edge cases

## Task Commits

Each task was committed atomically:

1. **Task 1: Add file field type and FileFieldOptions** - `5782265` (feat)
2. **Task 2: Implement filename sanitization with tests** - `a2dbfaf` (feat)

## Files Created/Modified
- `src/types/collection.ts` - Extended FieldType union with 'file', added file options to FieldOptions, mapped file to TEXT in FIELD_TYPE_MAP
- `src/storage/sanitize.ts` - Filename sanitization function with path traversal protection and random suffix
- `src/storage/sanitize.test.ts` - 10 comprehensive tests for sanitization edge cases

## Decisions Made
- File field type maps to TEXT (stores JSON array of filenames)
- Used 10-char nanoid suffix (consistent with PocketBase approach)
- Normalize Windows backslashes to forward slashes before path parsing for cross-platform safety
- Truncate base filename to 100 characters maximum
- Preserve and lowercase file extension

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- File field type available for collection schema definitions
- Sanitization function ready for use in upload handlers
- Storage directory structure established (src/storage/)
- Ready for 11-02 (File Storage Provider) implementation

---
*Phase: 11-file-uploads*
*Completed: 2026-01-27*
