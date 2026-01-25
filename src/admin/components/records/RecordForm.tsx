/**
 * Record form component for create/edit operations.
 * Uses react-hook-form for form state management.
 */

import { useForm } from "react-hook-form";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { DynamicField } from "./DynamicField";
import type { Field } from "@/hooks/useCollectionFields";

interface RecordFormProps {
  fields: Field[];
  record?: Record<string, unknown> | null;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

/**
 * RecordForm renders a form for creating or editing records.
 * Dynamically generates inputs based on collection field definitions.
 *
 * @param fields - Field definitions from the collection schema
 * @param record - Existing record data for edit mode (null for create)
 * @param onSubmit - Callback when form is submitted
 * @param onCancel - Callback when form is cancelled
 * @param loading - Whether the form is in a loading state
 */
export function RecordForm({
  fields,
  record,
  onSubmit,
  onCancel,
  loading,
}: RecordFormProps) {
  const isEditing = !!record;

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Record<string, unknown>>({
    defaultValues: record || {},
  });

  // Reset form when record changes (important for edit mode)
  useEffect(() => {
    reset(record || {});
  }, [record, reset]);

  const handleFormSubmit = async (data: Record<string, unknown>) => {
    // Only include non-undefined values
    const cleanedData = Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== undefined)
    );
    await onSubmit(cleanedData);
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      <div className="space-y-4">
        {fields.map((field) => (
          <DynamicField
            key={field.id}
            field={field}
            control={control}
            errors={errors}
          />
        ))}
      </div>

      {fields.length === 0 && (
        <p className="text-sm text-muted-foreground py-4">
          This collection has no fields defined.
        </p>
      )}

      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting || loading}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || loading}>
          {isSubmitting || loading
            ? "Saving..."
            : isEditing
              ? "Update Record"
              : "Create Record"}
        </Button>
      </div>
    </form>
  );
}
