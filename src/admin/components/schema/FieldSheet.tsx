/**
 * Field sheet component - slide-over panel for field form.
 * Wraps FieldForm in a Sheet for consistent UX with RecordSheet.
 */

import type { Field, FieldInput, Collection } from "@/lib/api";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { FieldForm } from "./FieldForm";

interface FieldSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  field: Field | null;
  collections: Collection[];
  currentCollection: string;
  onSubmit: (data: FieldInput) => void;
  loading: boolean;
}

/**
 * FieldSheet displays the field form in a slide-over panel.
 */
export function FieldSheet({
  open,
  onOpenChange,
  field,
  collections,
  currentCollection,
  onSubmit,
  loading,
}: FieldSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{field ? "Edit Field" : "New Field"}</SheetTitle>
          <SheetDescription>
            {field
              ? `Modify the "${field.name}" field configuration.`
              : "Add a new field to this collection."}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6">
          <FieldForm
            field={field}
            collections={collections}
            currentCollection={currentCollection}
            onSubmit={onSubmit}
            loading={loading}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
