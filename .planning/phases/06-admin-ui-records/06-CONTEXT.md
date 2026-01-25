# Phase 6: Admin UI Records - Context

**Gathered:** 2025-01-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Provide a web interface for browsing and managing collection records. Admin can see collections in a sidebar, browse records in a table with pagination, and create/edit/delete records through auto-generated forms. Dashboard shows collection statistics. Schema editing is a separate phase (Phase 7).

</domain>

<decisions>
## Implementation Decisions

### Component Library
- Use shadcn/ui for all UI components
- Served on same port as API server (single Bun.serve instance)

### Layout Structure
- Sidebar + main content layout
- Fixed sidebar with collections list
- Main area for records browser and forms
- Collections grouped by category (system vs user collections)

### Records Table
- Comfortable density (balance between information and readability)
- Show all fields by default with horizontal scroll if needed
- Click row to open edit form
- Three-dot menu per row for delete action
- No bulk selection (single record operations only for v1)

### Form Display
- Slide-over panel from right side
- Table remains visible behind the panel
- Used for both create and edit operations

### Dashboard
- Collection stats cards (record count, last updated per collection)
- Entry point when admin first logs in

### Feedback & Confirmations
- Toast notifications for success/error (auto-dismiss, bottom-right)
- Delete actions always require confirmation dialog
- Skeleton loaders during data fetch

### Claude's Discretion
- Exact shadcn component choices per use case
- Color scheme and theming
- Responsive breakpoints
- Empty state designs
- Form field ordering

</decisions>

<specifics>
## Specific Ideas

- PocketBase admin UI is a good reference for the general feel
- Keep it clean and functional — this is a developer tool, not a consumer app

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-admin-ui-records*
*Context gathered: 2025-01-25*
