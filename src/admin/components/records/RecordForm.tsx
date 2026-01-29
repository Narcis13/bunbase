/**
 * Record form component for create/edit operations.
 * Uses react-hook-form for form state management.
 */

import { useForm } from "react-hook-form";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { DynamicField } from "./DynamicField";
import type { FileFieldValue } from "./FileField";
import type { Field } from "@/hooks/useCollectionFields";

interface RecordFormProps {
  fields: Field[];
  record?: Record<string, unknown> | null;
  onSubmit: (data: Record<string, unknown> | FormData) => Promise<void>;
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

    // Check if any file fields have new files to upload
    const fileFields = fields.filter((f) => f.type === "file");
    let hasNewFiles = false;

    for (const ff of fileFields) {
      const val = cleanedData[ff.name] as FileFieldValue | undefined;
      if (val && typeof val === "object" && "newFiles" in val && val.newFiles.length > 0) {
        hasNewFiles = true;
        break;
      }
    }

    if (hasNewFiles) {
      // Build FormData for multipart upload
      const formData = new FormData();

      for (const [key, value] of Object.entries(cleanedData)) {
        const ff = fileFields.find((f) => f.name === key);
        if (ff) {
          const fileVal = value as FileFieldValue;
          // Append existing filenames as a JSON data field
          if (fileVal.existing.length > 0) {
            for (const url of fileVal.existing) {
              // Extract filename from URL
              const filename = url.split("/").pop() || url;
              formData.append(`${key}_existing`, filename);
            }
          }
          // Append new File objects
          for (const file of fileVal.newFiles) {
            formData.append(key, file);
          }
        } else {
          // Non-file fields as JSON string values
          formData.append(
            key,
            typeof value === "object" && value !== null
              ? JSON.stringify(value)
              : String(value ?? "")
          );
        }
      }

      await onSubmit(formData);
    } else {
      // No new files — send JSON with raw filenames for file fields
      const jsonData: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(cleanedData)) {
        const ff = fileFields.find((f) => f.name === key);
        if (ff) {
          const fileVal = value as FileFieldValue | string | string[];
          if (fileVal && typeof fileVal === "object" && "existing" in fileVal) {
            const fv = fileVal as FileFieldValue;
            const maxFiles = ff.options?.maxFiles ?? 1;
            const filenames = fv.existing.map((url) => url.split("/").pop() || url);
            jsonData[key] = maxFiles > 1 ? filenames : (filenames[0] ?? null);
          } else {
            jsonData[key] = value;
          }
        } else {
          jsonData[key] = value;
        }
      }
      await onSubmit(jsonData);
    }
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
          {(isSubmitting || loading) && <Spinner className="mr-2" size="sm" />}
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
