/**
 * Dynamic field component for form inputs.
 * Renders appropriate input based on field type.
 */

import { Controller, type Control, type FieldErrors } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { Field } from "@/hooks/useCollectionFields";

interface DynamicFieldProps {
  field: Field;
  control: Control<Record<string, unknown>>;
  errors: FieldErrors<Record<string, unknown>>;
}

/**
 * DynamicField renders form inputs based on field type.
 * Supports: text, number, boolean, datetime, json, relation.
 *
 * @param field - Field definition from collection schema
 * @param control - react-hook-form control object
 * @param errors - Form validation errors
 */
export function DynamicField({ field, control, errors }: DynamicFieldProps) {
  const error = errors[field.name];

  return (
    <div className="space-y-2">
      <Label htmlFor={field.name} className="flex items-center gap-1">
        {field.name}
        {field.required && <span className="text-destructive">*</span>}
      </Label>

      <Controller
        name={field.name}
        control={control}
        rules={{
          required: field.required ? `${field.name} is required` : false,
        }}
        render={({ field: formField }) => {
          switch (field.type) {
            case "text":
              return (
                <Input
                  id={field.name}
                  {...formField}
                  value={(formField.value as string) ?? ""}
                  placeholder={`Enter ${field.name}`}
                />
              );

            case "number":
              return (
                <Input
                  id={field.name}
                  type="number"
                  step="any"
                  {...formField}
                  value={(formField.value as number) ?? ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    formField.onChange(val === "" ? null : Number(val));
                  }}
                  placeholder={`Enter ${field.name}`}
                />
              );

            case "boolean":
              return (
                <div className="flex items-center gap-2">
                  <Switch
                    id={field.name}
                    checked={!!formField.value}
                    onCheckedChange={formField.onChange}
                  />
                  <span className="text-sm text-muted-foreground">
                    {formField.value ? "Yes" : "No"}
                  </span>
                </div>
              );

            case "datetime":
              return (
                <Input
                  id={field.name}
                  type="datetime-local"
                  {...formField}
                  value={formatDateForInput(formField.value as string)}
                  onChange={(e) => {
                    const val = e.target.value;
                    formField.onChange(val ? new Date(val).toISOString() : null);
                  }}
                />
              );

            case "json":
              return (
                <Textarea
                  id={field.name}
                  {...formField}
                  value={
                    typeof formField.value === "string"
                      ? formField.value
                      : JSON.stringify(formField.value, null, 2) ?? ""
                  }
                  onChange={(e) => {
                    try {
                      const parsed = JSON.parse(e.target.value);
                      formField.onChange(parsed);
                    } catch {
                      // Keep as string if invalid JSON
                      formField.onChange(e.target.value);
                    }
                  }}
                  placeholder="Enter JSON"
                  className="font-mono text-sm min-h-[100px]"
                />
              );

            case "relation":
              return (
                <Input
                  id={field.name}
                  {...formField}
                  value={(formField.value as string) ?? ""}
                  placeholder={`Enter ${field.options?.target || "record"} ID`}
                  className="font-mono"
                />
              );

            default:
              return (
                <Input
                  id={field.name}
                  {...formField}
                  value={(formField.value as string) ?? ""}
                />
              );
          }
        }}
      />

      {error && (
        <p className="text-sm text-destructive">{error.message as string}</p>
      )}

      {field.type === "relation" && field.options?.target && (
        <p className="text-xs text-muted-foreground">
          References: {field.options.target}
        </p>
      )}
    </div>
  );
}

/**
 * Helper to format ISO date string for datetime-local input.
 * Returns YYYY-MM-DDTHH:mm format.
 */
function formatDateForInput(isoString: string | null | undefined): string {
  if (!isoString) return "";
  try {
    const date = new Date(isoString);
    // Format: YYYY-MM-DDTHH:mm
    return date.toISOString().slice(0, 16);
  } catch {
    return "";
  }
}
