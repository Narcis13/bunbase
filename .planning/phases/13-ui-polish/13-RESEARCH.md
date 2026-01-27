# Phase 13: UI Polish - Research

**Researched:** 2026-01-27
**Domain:** React UI/UX, Form Validation, Toast Notifications, Responsive Design, Accessibility
**Confidence:** HIGH

## Summary

This phase enhances the existing BunBase admin UI with professional polish: loading states, toast notifications, inline form validation, consistent spacing, keyboard accessibility, and responsive layout refinements. The codebase already has the core infrastructure in place:

- **sonner** (v2.0.7) is installed and configured with `<Toaster>` in `main.tsx`
- **react-hook-form** (v7.71.1) is used for all forms with basic validation
- **@hookform/resolvers** (v5.2.2) is installed (can integrate Zod for schema validation)
- **zod** (v3.24.0) is available for type-safe validation schemas
- **shadcn/ui components** provide the design system foundation with Tailwind CSS v4
- **Radix UI primitives** provide accessible components (dialog, dropdown, etc.)
- Mobile detection already exists in the sidebar component (`window.innerWidth < 768`)

The main work is adding spinners to async operations, ensuring toast usage is consistent, integrating Zod for form validation with inline errors, auditing spacing, adding keyboard navigation to tables, and refining responsive breakpoints.

**Primary recommendation:** Leverage existing stack (sonner for toasts, react-hook-form + Zod for validation, Tailwind utilities for spacing/responsive) rather than adding new dependencies. Create a `Spinner` component using Lucide's `Loader2` icon with `animate-spin`.

## Standard Stack

The project already has all required libraries installed. No new dependencies needed.

### Core (Already Installed)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| sonner | 2.0.7 | Toast notifications | Installed, `<Toaster>` configured |
| react-hook-form | 7.71.1 | Form state management | In use across all forms |
| @hookform/resolvers | 5.2.2 | Schema validation integration | Installed, not yet used |
| zod | 3.24.0 | Schema validation | Installed, not yet used for forms |
| lucide-react | 0.563.0 | Icons including Loader2 | In use |
| tailwindcss | 4.1.18 | Styling with CSS variables | Configured with design tokens |

### Supporting (Already Available)
| Library | Purpose | When to Use |
|---------|---------|-------------|
| @radix-ui/* | Accessible primitives | Already used via shadcn/ui |
| class-variance-authority | Component variants | Already used for Button |
| tw-animate-css | Animation utilities | Already imported in globals.css |

### No New Dependencies Required
The existing stack fully supports all UI Polish requirements.

## Architecture Patterns

### Recommended Component Additions
```
src/admin/
├── components/
│   ├── ui/
│   │   ├── spinner.tsx          # NEW - Loading spinner component
│   │   └── ...existing
│   ├── records/
│   │   └── DynamicField.tsx     # MODIFY - Add aria-invalid, error styling
│   └── ...existing
├── lib/
│   └── validations/             # NEW - Zod schemas for forms
│       └── record.ts            # Collection record validation
└── hooks/
    └── ...existing
```

### Pattern 1: Spinner Component
**What:** Reusable loading spinner using Lucide's Loader2 icon
**When to use:** Any button or area showing loading state
**Example:**
```typescript
// src/admin/components/ui/spinner.tsx
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SpinnerProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizes = {
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-6 w-6",
};

export function Spinner({ className, size = "md" }: SpinnerProps) {
  return (
    <Loader2
      className={cn("animate-spin", sizes[size], className)}
      aria-hidden="true"
    />
  );
}
```

### Pattern 2: Loading Button State
**What:** Button with spinner during async operations
**When to use:** Form submissions, delete confirmations, any action buttons
**Example:**
```typescript
<Button disabled={loading}>
  {loading && <Spinner className="mr-2" size="sm" />}
  {loading ? "Saving..." : "Save"}
</Button>
```

### Pattern 3: Toast Patterns with Sonner
**What:** Consistent success/error/loading toast usage
**When to use:** After any async operation completes
**Example:**
```typescript
import { toast } from "sonner";

// Success
toast.success("Record created successfully");

// Error
toast.error("Failed to save record", {
  description: error.message,
});

// Promise-based (auto handles loading/success/error)
toast.promise(saveRecord(data), {
  loading: "Saving record...",
  success: "Record saved!",
  error: (err) => `Error: ${err.message}`,
});
```

### Pattern 4: Zod + React Hook Form Integration
**What:** Type-safe validation with inline errors
**When to use:** All forms requiring validation beyond HTML5 basics
**Example:**
```typescript
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const recordSchema = z.object({
  title: z.string().min(1, "Title is required"),
  price: z.number().positive("Price must be greater than 0"),
});

type RecordInput = z.infer<typeof recordSchema>;

function RecordForm() {
  const { register, handleSubmit, formState: { errors } } = useForm<RecordInput>({
    resolver: zodResolver(recordSchema),
    mode: "onBlur", // Validate on blur for good UX
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div>
        <Input {...register("title")} aria-invalid={!!errors.title} />
        {errors.title && (
          <p className="text-sm text-destructive mt-1">{errors.title.message}</p>
        )}
      </div>
    </form>
  );
}
```

### Pattern 5: Keyboard Navigation for Tables
**What:** Arrow key navigation within tables
**When to use:** RecordsTable, FieldsTable
**Example:**
```typescript
// Add to table wrapper
<div
  role="grid"
  tabIndex={0}
  onKeyDown={(e) => {
    const rows = tableRef.current?.querySelectorAll('[role="row"]');
    const currentIndex = Array.from(rows || []).findIndex(
      (row) => row.contains(document.activeElement)
    );

    if (e.key === "ArrowDown" && currentIndex < rows.length - 1) {
      e.preventDefault();
      (rows[currentIndex + 1] as HTMLElement).focus();
    }
    if (e.key === "ArrowUp" && currentIndex > 0) {
      e.preventDefault();
      (rows[currentIndex - 1] as HTMLElement).focus();
    }
  }}
>
  <Table>...</Table>
</div>
```

### Pattern 6: Responsive Spacing System
**What:** Consistent spacing using Tailwind's spacing scale
**When to use:** All component spacing, page layouts
**Standard scales:**
```
Gap between sections: gap-6 (24px)
Gap between form fields: space-y-4 (16px)
Padding inside cards: p-4 or p-6
Button padding: px-4 py-2 (built into Button)
Page padding: p-4 (already in Layout)
```

### Anti-Patterns to Avoid
- **Inline pixel values:** Use Tailwind spacing utilities, not `style={{ margin: "10px" }}`
- **Mixed toast libraries:** Only use sonner's `toast()`, never `alert()` or other toast libs
- **Manual loading state in toast:** Use `toast.promise()` for automatic loading/success/error
- **Validation in components:** Put Zod schemas in `/lib/validations/`, not inline
- **Hardcoded breakpoints:** Use Tailwind's `sm:`, `md:`, `lg:` prefixes

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Form validation | Custom validation logic | `@hookform/resolvers/zod` | Type-safe, declarative, less code |
| Toast notifications | Custom notification system | `sonner` | Already installed, proven library |
| Loading spinners | Custom CSS animations | Lucide `Loader2` + `animate-spin` | Consistent with icon set |
| Focus management | Manual focus tracking | `shouldFocusError: true` in useForm | Built-in to react-hook-form |
| Mobile detection | Manual media queries | Tailwind's responsive prefixes | Declarative, mobile-first |

**Key insight:** The codebase already has all the tools needed. The work is about consistent usage and filling gaps, not adding new infrastructure.

## Common Pitfalls

### Pitfall 1: Inconsistent Toast Usage
**What goes wrong:** Some operations show success toasts, others don't. Error handling varies.
**Why it happens:** Different developers implement differently over time.
**How to avoid:** Audit all async operations and ensure consistent pattern:
  - All successful mutations (create/update/delete) show success toast
  - All errors show error toast with message
**Warning signs:** Some operations complete silently without feedback.

### Pitfall 2: Form Validation Mode
**What goes wrong:** Validation only on submit makes forms feel unresponsive.
**Why it happens:** Default mode is "onSubmit".
**How to avoid:** Use `mode: "onBlur"` or `mode: "onTouched"` for immediate feedback.
**Warning signs:** Users don't see errors until clicking submit.

### Pitfall 3: Missing aria-invalid
**What goes wrong:** Screen readers don't announce invalid fields.
**Why it happens:** Only visual error styling is added.
**How to avoid:** Always add `aria-invalid={!!errors.fieldName}` to inputs.
**Warning signs:** Accessibility audit failures on forms.

### Pitfall 4: Spinner Without Loading Text
**What goes wrong:** Visual-only loading state, no screen reader feedback.
**Why it happens:** Just adding spinner, forgetting accessible text.
**How to avoid:** Include "Loading..." or similar text (can be visually hidden with `sr-only`).
**Warning signs:** Screen reader users don't know something is loading.

### Pitfall 5: Responsive Breakpoint Inconsistency
**What goes wrong:** Some components break at different widths.
**Why it happens:** Using different breakpoint logic in different places.
**How to avoid:** Always use Tailwind's standard breakpoints (sm: 640px, md: 768px, lg: 1024px).
**Warning signs:** UI looks broken at specific viewport widths.

### Pitfall 6: Missing Keyboard Escape Handler
**What goes wrong:** Modals/sheets can't be closed with Escape key.
**Why it happens:** Radix dialogs handle this by default, but custom implementations might not.
**How to avoid:** Use shadcn/ui Dialog/Sheet components which have Escape built-in.
**Warning signs:** Users complain they can't close dialogs with keyboard.

## Code Examples

### Loading Button (Verified Pattern)
```typescript
// Source: shadcn/ui Button + Lucide Loader2
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

function SubmitButton({ loading, children }: { loading: boolean; children: React.ReactNode }) {
  return (
    <Button type="submit" disabled={loading}>
      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {children}
    </Button>
  );
}
```

### Toast Success/Error Pattern
```typescript
// Source: sonner documentation
import { toast } from "sonner";

async function handleSubmit(data: FormData) {
  try {
    await saveRecord(data);
    toast.success("Record saved successfully");
  } catch (error) {
    toast.error("Failed to save record", {
      description: (error as Error).message,
    });
  }
}
```

### Toast Promise Pattern (Auto Loading State)
```typescript
// Source: sonner documentation
import { toast } from "sonner";

async function handleDelete(id: string) {
  toast.promise(deleteRecord(id), {
    loading: "Deleting record...",
    success: "Record deleted",
    error: (err) => `Delete failed: ${err.message}`,
  });
}
```

### Inline Form Validation with Zod
```typescript
// Source: react-hook-form + zod integration
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z.object({
  email: z.string().email("Invalid email address"),
  name: z.string().min(2, "Name must be at least 2 characters"),
});

type FormData = z.infer<typeof schema>;

function MyForm() {
  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    mode: "onBlur",
    shouldFocusError: true,
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          {...register("email")}
          aria-invalid={!!errors.email}
        />
        {errors.email && (
          <p className="text-sm text-destructive">{errors.email.message}</p>
        )}
      </div>
    </form>
  );
}
```

### Responsive Layout Pattern
```typescript
// Tailwind responsive classes - mobile first
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {/* Cards */}
</div>

// Sidebar visibility
<aside className="hidden md:block w-64">
  {/* Desktop sidebar */}
</aside>
<Sheet>
  {/* Mobile drawer - only shown on small screens */}
</Sheet>
```

### Keyboard Accessible Table Row
```typescript
// Add tabIndex and keyboard handling
<TableRow
  key={row.id}
  tabIndex={0}
  className="cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring"
  onClick={() => onRowClick(row.original)}
  onKeyDown={(e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onRowClick(row.original);
    }
  }}
>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| react-toastify | sonner | 2024 | Simpler API, better animations |
| Form validation in components | Zod schemas with resolver | 2024 | Type-safe, centralized |
| Custom CSS spinners | Lucide animate-spin | Standard | Consistent with icon set |
| Manual focus management | useForm shouldFocusError | Built-in | Less code, automatic |
| CSS media queries | Tailwind responsive prefixes | Standard | Mobile-first, declarative |

**Deprecated/outdated:**
- Custom notification systems: Use sonner
- Yup validation: Zod is now standard for TypeScript projects
- CSS-in-JS for responsive: Tailwind utilities are simpler

## Open Questions

1. **Zod schema location for dynamic fields**
   - What we know: RecordForm uses dynamic fields based on collection schema
   - What's unclear: Can't pre-define Zod schemas for user-defined fields
   - Recommendation: Use react-hook-form's built-in `rules` for dynamic validation, reserve Zod for static forms (FieldForm, CreateCollectionSheet, LoginPage)

2. **Loading skeleton granularity**
   - What we know: Skeleton component exists and is used in tables
   - What's unclear: Should we add skeleton states to individual form fields?
   - Recommendation: Keep current approach (full-component skeletons during load), focus on spinners for actions

## Sources

### Primary (HIGH confidence)
- Sonner official docs: https://sonner.emilkowal.ski/toast - Toast API, promise patterns
- React Hook Form docs: https://react-hook-form.com/docs/useform - Mode options, error handling
- shadcn/ui Sonner: https://ui.shadcn.com/docs/components/sonner - Integration example
- Tailwind CSS v4: Already configured in codebase with `@theme` design tokens

### Secondary (MEDIUM confidence)
- https://www.freecodecamp.org/news/react-form-validation-zod-react-hook-form/ - Zod + RHF integration patterns
- https://wasp.sh/blog/2025/01/22/advanced-react-hook-form-zod-shadcn - Advanced patterns
- https://www.freecodecamp.org/news/designing-keyboard-accessibility-for-complex-react-experiences/ - Keyboard nav patterns
- https://medium.com/@sureshdotariya/accessibility-quick-wins-in-reactjs-2025-skip-links-focus-traps-aria-live-regions-c926b9e44593 - Accessibility patterns

### Tertiary (LOW confidence - patterns to verify)
- Table keyboard navigation patterns may need testing with TanStack Table specifics

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already installed and configured
- Architecture: HIGH - Patterns are well-documented and proven
- Pitfalls: HIGH - Common issues are well-known in React ecosystem
- Keyboard navigation: MEDIUM - Table-specific patterns may need adaptation

**Research date:** 2026-01-27
**Valid until:** 60 days (stable libraries, no breaking changes expected)
