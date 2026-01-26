# Phase 7: Admin UI Schema Editor - Research

**Researched:** 2026-01-26
**Domain:** React Schema Editor UI with shadcn/ui, runtime schema modification
**Confidence:** HIGH

## Summary

Phase 7 implements the schema editor UI for creating and modifying collections through the admin interface. The backend already provides complete schema management APIs (Phase 1), so this phase focuses on building the UI layer that calls those endpoints. The schema editor allows admins to create new collections, add/edit/remove fields, and see changes take effect immediately without server restart.

The architecture follows the same patterns established in Phase 6: shadcn/ui components, react-hook-form for form state, Sheet components for edit panels, and state-based routing. The schema editor requires one new shadcn component (Select) for the field type dropdown. A key insight is that this is NOT a drag-and-drop form builder - it's a simple table-based schema editor with add/edit/delete actions for fields.

**Primary recommendation:** Build a SchemaView component following the RecordsView pattern: a table of fields with add/edit/delete actions, using Sheet for the field form, and Select for field type dropdown. Add API wrapper functions for schema endpoints.

## Standard Stack

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react | 19.x | UI framework | Already in project |
| react-hook-form | 7.x | Form state | Already in project, used for RecordForm |
| @tanstack/react-table | 8.x | Data table | Already in project, used for RecordsTable |
| sonner | 2.x | Toast notifications | Already in project |
| lucide-react | 0.563.x | Icons | Already in project |

### New Dependency Required
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @radix-ui/react-select | 2.x | Select dropdown | Required for shadcn Select component |

**Installation:**
```bash
bun add @radix-ui/react-select
```

### No New Libraries Needed
The schema editor can be built entirely with existing dependencies plus the Select component. No form builder libraries, drag-and-drop, or JSON schema tools are needed.

## Architecture Patterns

### Recommended Component Structure
```
src/admin/
├── components/
│   ├── ui/
│   │   └── select.tsx          # NEW: shadcn Select component
│   └── schema/                  # NEW: Schema editor components
│       ├── SchemaView.tsx      # Container (like RecordsView)
│       ├── FieldsTable.tsx     # Fields list with actions
│       ├── FieldSheet.tsx      # Field create/edit panel
│       ├── FieldForm.tsx       # Field form inputs
│       ├── CollectionSheet.tsx # Collection create/edit panel
│       └── DeleteFieldConfirmation.tsx
├── hooks/
│   └── useSchema.ts            # NEW: Hook for schema API calls
└── lib/
    └── api.ts                  # ADD: Schema API wrapper functions
```

### Pattern 1: View State Extension for Schema Editor
**What:** Add "schema" view type to existing view state
**When to use:** Integrating schema editor into existing navigation
**Example:**
```typescript
// In App.tsx - extend existing view type
type View =
  | { type: "dashboard" }
  | { type: "collection"; collection: string }
  | { type: "schema"; collection: string };  // NEW

// Navigation from sidebar or collection view
<Button onClick={() => setView({ type: "schema", collection: name })}>
  Edit Schema
</Button>
```

### Pattern 2: Fields Table with Inline Actions
**What:** Display fields in table with edit/delete actions per row
**When to use:** Schema editor field list
**Example:**
```typescript
// Source: Same pattern as RecordsTable
const columns: ColumnDef<Field>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "type", header: "Type", cell: ({ row }) => (
    <Badge variant="outline">{row.original.type}</Badge>
  )},
  { accessorKey: "required", header: "Required", cell: ({ row }) => (
    row.original.required ? "Yes" : "No"
  )},
  {
    id: "actions",
    cell: ({ row }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm"><MoreHorizontal /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onEdit(row.original)}>Edit</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onDelete(row.original)} className="text-destructive">Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];
```

### Pattern 3: Field Type Select with react-hook-form
**What:** Select dropdown for choosing field type (text, number, boolean, datetime, json, relation)
**When to use:** Field create/edit form
**Example:**
```typescript
// Source: https://ui.shadcn.com/docs/components/select
<Controller
  name="type"
  control={control}
  rules={{ required: "Field type is required" }}
  render={({ field }) => (
    <Select value={field.value} onValueChange={field.onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Select field type" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="text">Text</SelectItem>
        <SelectItem value="number">Number</SelectItem>
        <SelectItem value="boolean">Boolean</SelectItem>
        <SelectItem value="datetime">DateTime</SelectItem>
        <SelectItem value="json">JSON</SelectItem>
        <SelectItem value="relation">Relation</SelectItem>
      </SelectContent>
    </Select>
  )}
/>
```

### Pattern 4: Conditional Options Form (Relation Target)
**What:** Show additional options input only when field type is "relation"
**When to use:** Field form with type-specific options
**Example:**
```typescript
// Watch the type field to conditionally show options
const fieldType = watch("type");

{fieldType === "relation" && (
  <div className="space-y-2">
    <Label htmlFor="target">Target Collection</Label>
    <Controller
      name="options.target"
      control={control}
      rules={{ required: "Target collection is required for relations" }}
      render={({ field }) => (
        <Select value={field.value} onValueChange={field.onChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select target collection" />
          </SelectTrigger>
          <SelectContent>
            {collections.map((c) => (
              <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    />
  </div>
)}
```

### Pattern 5: Schema API Wrapper Functions
**What:** Add schema CRUD functions to api.ts using existing fetchWithAuth
**When to use:** Calling backend schema APIs
**Example:**
```typescript
// Add to src/admin/lib/api.ts
export async function createCollection(name: string, fields: FieldInput[]) {
  const response = await fetchWithAuth("/_/api/collections", {
    method: "POST",
    body: JSON.stringify({ name, fields }),
  });
  return response.json();
}

export async function addField(collection: string, field: FieldInput) {
  const response = await fetchWithAuth(`/_/api/collections/${collection}/fields`, {
    method: "POST",
    body: JSON.stringify(field),
  });
  return response.json();
}

export async function updateField(collection: string, fieldName: string, updates: Partial<FieldInput>) {
  const response = await fetchWithAuth(`/_/api/collections/${collection}/fields/${fieldName}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
  return response.json();
}

export async function deleteField(collection: string, fieldName: string) {
  await fetchWithAuth(`/_/api/collections/${collection}/fields/${fieldName}`, {
    method: "DELETE",
  });
}
```

### Anti-Patterns to Avoid
- **Drag-and-drop form builder:** Overkill for simple field CRUD. Use table + sheet pattern.
- **JSON Schema visual editor:** The backend uses simple field definitions, not JSON Schema.
- **Complex field validation UI:** Keep it simple - name, type, required, options. No regex builders.
- **Live preview of collection:** Not needed. Show field list, not a form preview.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Field type dropdown | Custom radio buttons | shadcn Select | Accessibility, keyboard nav |
| Field list with actions | Custom list | TanStack Table | Already used for records, consistent UI |
| Edit field panel | Custom modal | shadcn Sheet | Same pattern as RecordSheet |
| Delete confirmation | window.confirm | shadcn AlertDialog | Same pattern as DeleteConfirmation |
| Form validation | Manual validation | react-hook-form + rules | Already in project |

**Key insight:** The schema editor should use the exact same UI patterns as the records editor - just with different data (fields instead of records).

## Common Pitfalls

### Pitfall 1: Backend API Routes Missing for Schema Management
**What goes wrong:** POST/PATCH/DELETE endpoints for collections/fields not exposed to admin UI
**Why it happens:** Phase 1 core has the functions, but they may not be exposed as HTTP routes
**How to avoid:** Check server.ts for missing routes. Need:
  - POST /_/api/collections (create collection)
  - PATCH /_/api/collections/:name (update collection name)
  - DELETE /_/api/collections/:name (delete collection)
  - POST /_/api/collections/:name/fields (add field)
  - PATCH /_/api/collections/:name/fields/:fieldName (update field)
  - DELETE /_/api/collections/:name/fields/:fieldName (delete field)
**Warning signs:** 404 errors when calling schema mutation APIs

### Pitfall 2: Field Name Validation
**What goes wrong:** User enters invalid field name (starts with number, has spaces)
**Why it happens:** Backend validates, but no client-side validation
**How to avoid:** Add regex validation: `/^[a-zA-Z][a-zA-Z0-9_]*$/`
**Warning signs:** Validation errors from backend that could be caught earlier

### Pitfall 3: Select Component Default Value
**What goes wrong:** Select shows empty on edit, even though field has a type
**Why it happens:** react-hook-form defaultValues not properly set for Select
**How to avoid:** Use `reset()` when editing record changes, ensure defaultValues include the type
**Warning signs:** Edit form shows "Select field type" instead of the actual type

### Pitfall 4: Relation Target Dropdown Empty
**What goes wrong:** Target collection dropdown has no options
**Why it happens:** Collections not loaded before form renders
**How to avoid:** Load collections in parent component, pass as prop to FieldForm
**Warning signs:** Empty dropdown when selecting "relation" type

### Pitfall 5: Deleting Field with Data
**What goes wrong:** User deletes field, loses data in that column
**Why it happens:** No warning about data loss
**How to avoid:** Add warning in delete confirmation: "This will delete all data in this field"
**Warning signs:** User complaints about lost data

### Pitfall 6: Reserved Field Names
**What goes wrong:** User creates field named "id", "created_at", or "updated_at"
**Why it happens:** These are auto-generated system fields
**How to avoid:** Validate against reserved names in form validation
**Warning signs:** Confusing behavior or errors when creating records

## Code Examples

### shadcn Select Component
```typescript
// src/admin/components/ui/select.tsx
// Source: https://ui.shadcn.com/docs/components/select
import * as React from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { Check, ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"

const Select = SelectPrimitive.Root
const SelectGroup = SelectPrimitive.Group
const SelectValue = SelectPrimitive.Value

const SelectTrigger = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
      className
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-4 w-4 opacity-50" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
))
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName

const SelectContent = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        "relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        position === "popper" &&
          "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
        className
      )}
      position={position}
      {...props}
    >
      <SelectPrimitive.Viewport
        className={cn(
          "p-1",
          position === "popper" &&
            "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]"
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
))
SelectContent.displayName = SelectPrimitive.Content.displayName

const SelectItem = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
))
SelectItem.displayName = SelectPrimitive.Item.displayName

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
}
```

### Field Type Icons/Badges
```typescript
// Field type to display mapping
const FIELD_TYPE_LABELS: Record<string, { label: string; description: string }> = {
  text: { label: "Text", description: "String values" },
  number: { label: "Number", description: "Numeric values" },
  boolean: { label: "Boolean", description: "True/false values" },
  datetime: { label: "DateTime", description: "Date and time" },
  json: { label: "JSON", description: "Complex data structures" },
  relation: { label: "Relation", description: "Link to another collection" },
};
```

### Validation Rules for Field Name
```typescript
// react-hook-form validation rules
const fieldNameRules = {
  required: "Field name is required",
  pattern: {
    value: /^[a-zA-Z][a-zA-Z0-9_]*$/,
    message: "Must start with letter, contain only letters, numbers, underscores",
  },
  validate: {
    notReserved: (value: string) =>
      !["id", "created_at", "updated_at"].includes(value) ||
      "This name is reserved for system fields",
  },
};
```

## Backend API Routes Needed

The admin UI needs these routes exposed (some may already exist):

| Method | Route | Purpose | Status |
|--------|-------|---------|--------|
| GET | /_/api/collections | List all collections | EXISTS |
| GET | /_/api/collections/:name/fields | Get collection fields | EXISTS |
| POST | /_/api/collections | Create collection | NEEDS ROUTE |
| PATCH | /_/api/collections/:name | Rename collection | NEEDS ROUTE |
| DELETE | /_/api/collections/:name | Delete collection | NEEDS ROUTE |
| POST | /_/api/collections/:name/fields | Add field | NEEDS ROUTE |
| PATCH | /_/api/collections/:name/fields/:fieldName | Update field | NEEDS ROUTE |
| DELETE | /_/api/collections/:name/fields/:fieldName | Delete field | NEEDS ROUTE |

Core functions exist in `src/core/schema.ts`:
- `createCollection(name, fields)`
- `updateCollection(name, newName)`
- `deleteCollection(name)`
- `addField(collectionName, field)`
- `updateField(collectionName, fieldName, updates)`
- `removeField(collectionName, fieldName)`

These need HTTP route handlers in `src/api/server.ts`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| JSON Schema visual editors | Simple table + form | N/A | simpler for limited field types |
| Drag-and-drop builders | Click to add/edit | N/A | lower complexity, faster to implement |
| Complex field configs | 4 fields: name, type, required, options | N/A | covers 90% of use cases |

**Not needed for this phase:**
- Field ordering/reordering (could add later)
- Field groups/sections (not part of current schema)
- Advanced field options (min/max, regex) - backend supports but UI can defer
- Import/export schema as JSON

## Open Questions

1. **Should field reordering be supported?**
   - What we know: Fields ordered by created_at in current API
   - What's unclear: Whether users need to reorder fields
   - Recommendation: Defer to future phase, add order column later if needed

2. **How to handle schema changes affecting existing data?**
   - What we know: Backend handles column migrations
   - What's unclear: Should UI warn about data migration?
   - Recommendation: Show warning on type change: "Existing data may be converted"

3. **Collection rename in sidebar sync?**
   - What we know: Renaming collection changes its name in DB
   - What's unclear: How to update sidebar if viewing renamed collection
   - Recommendation: Refetch collections list after rename, redirect to new name

## Sources

### Primary (HIGH confidence)
- shadcn/ui Select - https://ui.shadcn.com/docs/components/select (component code, react-hook-form integration)
- shadcn/ui React Hook Form - https://ui.shadcn.com/docs/forms/react-hook-form (form patterns)
- Existing codebase (RecordsView, RecordForm, DynamicField patterns)
- Existing schema APIs in src/core/schema.ts

### Secondary (MEDIUM confidence)
- WebSearch for schema editor patterns (community patterns)

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Using existing project dependencies, only adding @radix-ui/react-select
- Architecture: HIGH - Following exact patterns from Phase 6 RecordsView
- Pitfalls: HIGH - Based on code review of existing implementation and standard form patterns

**Research date:** 2026-01-26
**Valid until:** 2026-02-26 (stable libraries, patterns match existing codebase)
