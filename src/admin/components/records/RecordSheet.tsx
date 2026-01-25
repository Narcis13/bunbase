/**
 * Record sheet component for slide-over form panel.
 * Contains the RecordForm in a Sheet UI component.
 */

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { RecordForm } from "./RecordForm";
import { Skeleton } from "@/components/ui/skeleton";
import type { Field } from "@/hooks/useCollectionFields";

interface RecordSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collection: string;
  fields: Field[];
  fieldsLoading: boolean;
  record?: Record<string, unknown> | null;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  loading?: boolean;
}

/**
 * RecordSheet displays the record form in a slide-over panel.
 * Used for both create and edit operations.
 *
 * @param open - Whether the sheet is open
 * @param onOpenChange - Callback when sheet open state changes
 * @param collection - Name of the collection being edited
 * @param fields - Field definitions for the collection
 * @param fieldsLoading - Whether fields are still loading
 * @param record - Existing record for edit (null for create)
 * @param onSubmit - Callback when form is submitted
 * @param loading - Whether submission is in progress
 */
export function RecordSheet({
  open,
  onOpenChange,
  collection,
  fields,
  fieldsLoading,
  record,
  onSubmit,
  loading,
}: RecordSheetProps) {
  const isEditing = !!record;

  const handleSubmit = async (data: Record<string, unknown>) => {
    await onSubmit(data);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {isEditing ? "Edit Record" : "Create Record"}
          </SheetTitle>
          <SheetDescription>
            {isEditing
              ? `Editing record in ${collection}`
              : `Add a new record to ${collection}`}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6">
          {fieldsLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ))}
            </div>
          ) : (
            <RecordForm
              fields={fields}
              record={record}
              onSubmit={handleSubmit}
              onCancel={() => onOpenChange(false)}
              loading={loading}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
