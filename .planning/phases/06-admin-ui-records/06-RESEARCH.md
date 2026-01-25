# Phase 6: Admin UI Records - Research

**Researched:** 2026-01-25
**Domain:** React Admin UI with shadcn/ui, Bun HTML imports
**Confidence:** HIGH

## Summary

Phase 6 implements the admin web interface for browsing and managing collection records. The architecture uses Bun's native HTML imports with React, shadcn/ui component library, and Tailwind CSS v4. The single Bun.serve() instance serves both the API and React frontend on port 8090.

The key technical decisions are locked in CONTEXT.md: shadcn/ui components, sidebar + main content layout, slide-over panel for forms, data table with row actions, and toast notifications. This research validates these choices and provides implementation patterns.

**Primary recommendation:** Use shadcn/ui with Tailwind CSS v4 via `bun-plugin-tailwind`, TanStack Table for data grid, React Hook Form with Zod for form handling, and simple useState-based view routing (no external router library needed for admin UI).

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react | 19.x | UI framework | Bun HTML imports natively support React/JSX |
| react-dom | 19.x | DOM rendering | Required for client-side React |
| tailwindcss | 4.x | CSS framework | shadcn/ui requirement |
| bun-plugin-tailwind | latest | Tailwind integration | Enables Tailwind in Bun.serve() |
| @tanstack/react-table | 8.x | Data table | Official shadcn/ui data table foundation |
| react-hook-form | 7.x | Form state | shadcn/ui form integration standard |
| @hookform/resolvers | 3.x | Validation bridge | Connects react-hook-form to Zod |
| zod | 3.x | Schema validation | Already in project, form validation |
| sonner | 1.x | Toast notifications | shadcn/ui recommended toast library |
| lucide-react | latest | Icons | shadcn/ui default icon library |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| class-variance-authority | latest | Variant styles | Component variant definitions |
| clsx | latest | Class merging | Conditional class names |
| tailwind-merge | latest | Tailwind dedup | Merge Tailwind classes safely |
| tw-animate-css | latest | Animations | shadcn/ui animation support |
| date-fns | latest | Date formatting | Date picker, datetime display |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @tanstack/react-table | Native HTML table | Loss of sorting, pagination, row selection features |
| react-hook-form | Native forms | More boilerplate, less integration with shadcn/ui |
| sonner | react-hot-toast | Sonner is shadcn/ui recommended |
| Simple useState routing | react-router | Overkill for admin-only SPA with few views |

**Installation:**
```bash
bun add react react-dom @tanstack/react-table react-hook-form @hookform/resolvers sonner lucide-react class-variance-authority clsx tailwind-merge tw-animate-css date-fns
bun add -d tailwindcss bun-plugin-tailwind @types/node
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── admin/                    # Admin UI code
│   ├── index.html           # HTML entry point (Bun HTML import)
│   ├── main.tsx             # React entry point
│   ├── App.tsx              # Root component with routing state
│   ├── styles/
│   │   └── globals.css      # Tailwind + CSS variables
│   ├── components/
│   │   ├── ui/              # shadcn/ui components (copied)
│   │   ├── layout/          # Sidebar, Header, Layout
│   │   ├── records/         # RecordsTable, RecordForm
│   │   └── dashboard/       # DashboardStats
│   ├── hooks/               # Custom hooks (useCollections, useRecords)
│   └── lib/
│       └── utils.ts         # cn() helper
├── api/
│   └── server.ts            # Updated to serve admin UI
└── ...
```

### Pattern 1: Bun HTML Import for Admin UI
**What:** Import HTML file directly into server and serve as route
**When to use:** Single entry point for SPA admin interface
**Example:**
```typescript
// Source: https://bun.com/docs/bundler/fullstack
import adminHtml from "./admin/index.html";

Bun.serve({
  routes: {
    // API routes
    "/api/collections/:name/records": { /* ... */ },

    // Admin UI - serve HTML for all /_/ routes
    "/_/": adminHtml,
    "/_/*": adminHtml,  // Catch-all for SPA routing
  },
  development: {
    hmr: true,
    console: true,
  },
});
```

### Pattern 2: Simple View State Routing
**What:** Use React state for view switching instead of external router
**When to use:** Admin UI with limited views (dashboard, records list, record form)
**Example:**
```typescript
// Source: Simple state-based routing pattern
type View =
  | { type: "dashboard" }
  | { type: "collection"; name: string }
  | { type: "record"; collection: string; id: string }
  | { type: "create"; collection: string };

function App() {
  const [view, setView] = useState<View>({ type: "dashboard" });

  return (
    <SidebarProvider>
      <AppSidebar collections={collections} onNavigate={setView} />
      <main>
        {view.type === "dashboard" && <Dashboard />}
        {view.type === "collection" && <RecordsList collection={view.name} />}
        {/* ... */}
      </main>
    </SidebarProvider>
  );
}
```

### Pattern 3: shadcn/ui Component Structure
**What:** Copy components to project, customize as needed
**When to use:** All UI components
**Example:**
```typescript
// Source: https://ui.shadcn.com/docs/installation/manual
// components/ui/button.tsx - copied from shadcn/ui CLI
import { cn } from "@/lib/utils"

// lib/utils.ts
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

### Pattern 4: Data Table with TanStack Table
**What:** Configure columns, sorting, pagination for records display
**When to use:** Records list view
**Example:**
```typescript
// Source: https://ui.shadcn.com/docs/components/data-table
import { useReactTable, getCoreRowModel, getPaginationRowModel, getSortedRowModel } from "@tanstack/react-table"

const columns: ColumnDef<Record>[] = [
  {
    accessorKey: "id",
    header: "ID",
  },
  // Dynamic columns from collection fields
  ...fields.map(field => ({
    accessorKey: field.name,
    header: field.name,
  })),
  {
    id: "actions",
    cell: ({ row }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onEdit(row.original)}>Edit</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onDelete(row.original)} className="text-red-600">Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
]
```

### Pattern 5: Dynamic Form Generation
**What:** Generate form fields based on collection schema field types
**When to use:** Create/edit record forms
**Example:**
```typescript
// Source: Pattern from schema-driven form generation
function DynamicField({ field, control }: { field: Field; control: Control }) {
  switch (field.type) {
    case "text":
      return <Controller name={field.name} control={control} render={({ field: f }) => <Input {...f} />} />
    case "number":
      return <Controller name={field.name} control={control} render={({ field: f }) => <Input type="number" {...f} />} />
    case "boolean":
      return <Controller name={field.name} control={control} render={({ field: f }) => <Switch checked={f.value} onCheckedChange={f.onChange} />} />
    case "datetime":
      return <Controller name={field.name} control={control} render={({ field: f }) => <DatePicker value={f.value} onChange={f.onChange} />} />
    case "json":
      return <Controller name={field.name} control={control} render={({ field: f }) => <Textarea {...f} placeholder="JSON" />} />
    case "relation":
      return <Controller name={field.name} control={control} render={({ field: f }) => <RelationSelect {...f} target={field.options?.target} />} />
  }
}
```

### Pattern 6: Sheet/Slide-over for Forms
**What:** Use shadcn/ui Sheet component opening from right side
**When to use:** Create/edit forms overlay
**Example:**
```typescript
// Source: https://ui.shadcn.com/docs/components/sheet
<Sheet open={isOpen} onOpenChange={setIsOpen}>
  <SheetContent side="right" className="w-[400px] sm:w-[540px]">
    <SheetHeader>
      <SheetTitle>{editingRecord ? "Edit Record" : "Create Record"}</SheetTitle>
    </SheetHeader>
    <RecordForm
      collection={collection}
      record={editingRecord}
      onSubmit={handleSubmit}
      onCancel={() => setIsOpen(false)}
    />
  </SheetContent>
</Sheet>
```

### Anti-Patterns to Avoid
- **Installing shadcn/ui as npm package:** shadcn/ui is copy-paste, not a dependency. Use CLI to add components.
- **Using Vite with Bun:** Bun has native HTML imports with bundling. Don't add Vite.
- **Complex router for admin:** useState-based view state is simpler than react-router for admin with 4-5 views.
- **Custom table implementation:** TanStack Table handles sorting, pagination, selection. Don't rebuild.
- **Inline form validation:** Use Zod schemas with react-hook-form resolver.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Data table with sorting/pagination | Custom table component | @tanstack/react-table + shadcn Table | Handles edge cases, accessibility, performance |
| Toast notifications | Custom notification system | Sonner | Auto-dismiss, stacking, animations handled |
| Form validation | Manual validation logic | react-hook-form + Zod | Integrates with shadcn, handles all field states |
| Modal dialogs | Custom modal | shadcn AlertDialog | Focus trap, keyboard navigation, accessibility |
| Date picker | Native input[type=date] | shadcn DatePicker (Calendar + Popover) | Better UX, consistent styling |
| Slide-over panel | Custom sliding div | shadcn Sheet | Animation, focus management, close on escape |
| Class name merging | Template literals | clsx + tailwind-merge | Handles Tailwind specificity conflicts |

**Key insight:** shadcn/ui components are built on Radix UI primitives which handle accessibility, keyboard navigation, and focus management. Custom implementations will miss these details.

## Common Pitfalls

### Pitfall 1: Tailwind CSS v4 Configuration
**What goes wrong:** Using Tailwind v3 configuration syntax with v4
**Why it happens:** Most tutorials show v3 patterns (tailwind.config.js)
**How to avoid:** Tailwind v4 uses CSS-based configuration with `@import "tailwindcss";`
**Warning signs:** "tailwind.config.js not found" errors, classes not applying

### Pitfall 2: shadcn/ui Path Aliases
**What goes wrong:** Import errors for `@/components/ui/*`
**Why it happens:** Path aliases not configured in tsconfig.json and bundler
**How to avoid:** Configure `compilerOptions.paths` in tsconfig.json. Bun respects tsconfig paths.
**Warning signs:** "Cannot find module @/components/ui/button" errors

### Pitfall 3: Form Default Values with React Hook Form
**What goes wrong:** Edit form shows empty fields when editing existing record
**Why it happens:** defaultValues only applied on mount, not on prop change
**How to avoid:** Use `reset()` method when record changes, or key the form component
**Warning signs:** Edit form doesn't populate, but create form works fine

### Pitfall 4: Sheet State Management
**What goes wrong:** Sheet doesn't close after form submit, or closes prematurely
**Why it happens:** Not coordinating Sheet open state with form submission lifecycle
**How to avoid:** Close Sheet in onSubmit success handler, not immediately on submit
**Warning signs:** Sheet closes before showing success toast, or stays open after success

### Pitfall 5: Dynamic Columns with TanStack Table
**What goes wrong:** Table doesn't update when collection changes
**Why it happens:** Column definitions memoized with stale data
**How to avoid:** Include collection fields in useMemo dependency array for columns
**Warning signs:** Switching collections shows wrong columns

### Pitfall 6: JWT Token Storage
**What goes wrong:** Token lost on page refresh, or stored insecurely
**Why it happens:** Using sessionStorage which clears, or localStorage without expiry check
**How to avoid:** Store in localStorage, check expiry on app load, redirect to login if expired
**Warning signs:** User logged out unexpectedly, or stays "logged in" after token expires

## Code Examples

Verified patterns from official sources:

### Tailwind CSS v4 Setup with Bun
```css
/* src/admin/styles/globals.css */
/* Source: https://ui.shadcn.com/docs/installation/manual */
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --destructive-foreground: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  --radius: 0.625rem;
  --sidebar-background: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.145 0 0);
  --sidebar-primary: oklch(0.205 0 0);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.97 0 0);
  --sidebar-accent-foreground: oklch(0.205 0 0);
  --sidebar-border: oklch(0.922 0 0);
  --sidebar-ring: oklch(0.708 0 0);
}
```

### Bun bunfig.toml for Tailwind Plugin
```toml
# bunfig.toml
# Source: https://bun.com/docs/bundler/fullstack
[serve.static]
plugins = ["bun-plugin-tailwind"]
```

### Admin HTML Entry Point
```html
<!-- src/admin/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BunBase Admin</title>
  <link rel="stylesheet" href="./styles/globals.css">
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./main.tsx"></script>
</body>
</html>
```

### React Entry Point with Toaster
```typescript
// src/admin/main.tsx
// Source: https://ui.shadcn.com/docs/components/sonner
import { createRoot } from "react-dom/client";
import { Toaster } from "@/components/ui/sonner";
import App from "./App";

const root = createRoot(document.getElementById("root")!);
root.render(
  <>
    <App />
    <Toaster position="bottom-right" />
  </>
);
```

### Delete Confirmation Dialog
```typescript
// Source: https://ui.shadcn.com/docs/components/alert-dialog
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function DeleteConfirmation({
  open,
  onOpenChange,
  onConfirm,
  recordId
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  recordId: string;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Record?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete record "{recordId}".
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

### Skeleton Loader for Table
```typescript
// Source: https://ui.shadcn.com/docs/components/skeleton
import { Skeleton } from "@/components/ui/skeleton";

function TableSkeleton({ rows = 5, cols = 4 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex space-x-4">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className="h-8 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}
```

### API Client with Auth Token
```typescript
// src/admin/lib/api.ts
const API_BASE = "";  // Same origin

export async function fetchWithAuth(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem("bunbase_token");
  if (!token) {
    throw new Error("Not authenticated");
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...options.headers,
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (response.status === 401) {
    localStorage.removeItem("bunbase_token");
    window.location.href = "/_/login";
    throw new Error("Session expired");
  }

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Request failed");
  }

  return response;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| tailwind.config.js | CSS-based config (@import "tailwindcss") | Tailwind v4 (2024) | Simpler config, no JS file |
| Toast component | Sonner | shadcn/ui update (2024) | Toast deprecated in shadcn |
| Radix UI Dialog | Radix UI Dialog (same) | N/A | shadcn Sheet/AlertDialog still use Radix |
| Vite for React bundling | Bun HTML imports | Bun 1.2+ (2024) | No Vite needed with Bun |

**Deprecated/outdated:**
- shadcn/ui Toast component: Use Sonner instead
- tailwind.config.js: Tailwind v4 uses CSS-based configuration
- Manual class string building: Use cn() utility with clsx + tailwind-merge

## Open Questions

Things that couldn't be fully resolved:

1. **Date picker component for datetime fields**
   - What we know: shadcn/ui has Calendar component, DatePicker is built by combining with Popover
   - What's unclear: Exact implementation for datetime (date + time) vs just date
   - Recommendation: Start with date-only picker using shadcn Calendar + Popover, add time input separately if needed

2. **Relation field display in table**
   - What we know: Relation fields store foreign IDs
   - What's unclear: Whether to display ID, fetch related record name, or just ID with tooltip
   - Recommendation: Display ID initially, consider expand parameter to fetch related names in v2

## Sources

### Primary (HIGH confidence)
- Bun Fullstack Dev Server - https://bun.com/docs/bundler/fullstack (HTML imports, Tailwind plugin, HMR)
- shadcn/ui Installation Manual - https://ui.shadcn.com/docs/installation/manual (dependencies, CSS variables, utils)
- shadcn/ui Data Table - https://ui.shadcn.com/docs/components/data-table (TanStack Table integration)
- shadcn/ui Sheet - https://ui.shadcn.com/docs/components/sheet (slide-over panel)
- shadcn/ui Sonner - https://ui.shadcn.com/docs/components/sonner (toast notifications)
- shadcn/ui Alert Dialog - https://ui.shadcn.com/docs/components/alert-dialog (confirmation dialogs)
- shadcn/ui Sidebar - https://ui.shadcn.com/docs/components/sidebar (admin layout)
- shadcn/ui React Hook Form - https://ui.shadcn.com/docs/forms/react-hook-form (form integration)

### Secondary (MEDIUM confidence)
- shadcn/ui Vite Installation - https://ui.shadcn.com/docs/installation/vite (Tailwind v4 setup patterns)
- React Hook Form documentation - https://react-hook-form.com/docs (form patterns)

### Tertiary (LOW confidence)
- WebSearch for simple state-based routing patterns in React (community patterns, not official)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Official shadcn/ui docs specify exact libraries
- Architecture: HIGH - Bun docs + shadcn patterns are well documented
- Pitfalls: MEDIUM - Some from experience patterns, not all officially documented

**Research date:** 2026-01-25
**Valid until:** 2026-02-25 (stable libraries, shadcn/ui and Bun are actively maintained)
