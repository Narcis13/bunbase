---
phase: 12-realtime-sse
plan: 02
subsystem: realtime
tags: [sse, pub-sub, topics, pocketbase-protocol]

# Dependency graph
requires:
  - phase: none
    provides: standalone module
provides:
  - Topic parsing for subscription management
  - Subscription matching for event routing
  - Topic formatting utilities
affects: [12-03-manager, 12-04-events, 12-05-routes]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "PocketBase topic format: collection/* or collection/recordId"
    - "Fail-safe parsing: invalid input returns null"
    - "Wildcard matching: * matches any record in collection"

key-files:
  created:
    - src/realtime/topics.ts
    - src/realtime/topics.test.ts
  modified: []

key-decisions:
  - "Collection names: alphanumeric + underscore, must start with letter"
  - "RecordId: alphanumeric only (nanoid compatible)"
  - "Invalid topics return null (fail-safe, not exception)"
  - "Subscription interface defined locally (manager.ts not yet created)"

patterns-established:
  - "Topic format regex: /^([a-zA-Z][a-zA-Z0-9_]*)\\/([*]|[a-zA-Z0-9]+)$/"
  - "Wildcard subscriptions match all records in collection"
  - "Specific subscriptions match exact recordId only"

# Metrics
duration: 1min
completed: 2026-01-27
---

# Phase 12 Plan 02: Topic Parsing Summary

**Topic parsing and subscription matching utilities following PocketBase protocol format**

## Performance

- **Duration:** 1 min (49 seconds)
- **Started:** 2026-01-27T18:12:34Z
- **Completed:** 2026-01-27T18:13:23Z
- **Tasks:** 1
- **Files created:** 2

## Accomplishments

- Implemented parseTopic for "collection/*" and "collection/recordId" formats
- Implemented matchesSubscription for wildcard and specific record matching
- Implemented formatTopic for creating topic strings from components
- Comprehensive test suite with 29 passing tests covering valid/invalid cases

## Task Commits

Each task was committed atomically:

1. **Task 1: Create topic parsing utilities** - `93b7e21` (feat)

## Files Created/Modified

- `src/realtime/topics.ts` - Topic parsing, matching, and formatting utilities
- `src/realtime/topics.test.ts` - Comprehensive test suite (29 tests)

## Decisions Made

- **Collection naming rules:** Alphanumeric + underscore, must start with letter (matches database identifier conventions)
- **RecordId format:** Alphanumeric only to support nanoid-style IDs
- **Fail-safe parsing:** Invalid topics return null rather than throwing exceptions
- **Local Subscription interface:** Defined in topics.ts since manager.ts is not yet created (Wave 1 parallel)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Topic utilities ready for subscription manager (12-03)
- parseTopic will be used to validate incoming subscription requests
- matchesSubscription will be used for event routing
- formatTopic useful for creating canonical topic strings

---
*Phase: 12-realtime-sse*
*Completed: 2026-01-27*
