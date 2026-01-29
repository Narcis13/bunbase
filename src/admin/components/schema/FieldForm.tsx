/**
 * Field form component for creating and editing fields.
 * Uses react-hook-form with Select for field type.
 */

import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import type { Field, FieldInput, Collection } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface FieldFormProps {
  field: Field | null;
  collections: Collection[];
  currentCollection: string;
  onSubmit: (data: FieldInput) => void;
  loading: boolean;
}

const FIELD_TYPES = [
  { value: "text", label: "Text", description: "String values" },
  { value: "number", label: "Number", description: "Numeric values" },
  { value: "boolean", label: "Boolean", description: "True/false values" },
  { value: "datetime", label: "DateTime", description: "Date and time" },
  { value: "json", label: "JSON", description: "Complex data structures" },
  { value: "relation", label: "Relation", description: "Link to another collection" },
  { value: "file", label: "File", description: "File uploads" },
] as const;

const RESERVED_NAMES = ["id", "created_at", "updated_at"];

/**
 * FieldForm renders form inputs for field properties.
 * Handles create (field=null) and edit (field provided) modes.
 */
export function FieldForm({
  field,
  collections,
  currentCollection,
  onSubmit,
  loading,
}: FieldFormProps) {
  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors },
  } = useForm<FieldInput & { _allowedTypesStr?: string }>({
    defaultValues: {
      name: field?.name ?? "",
      type: field?.type ?? "text",
      required: field?.required ?? false,
      options: field?.options ?? null,
      _allowedTypesStr: field?.options?.allowedTypes?.join(", ") ?? "",
    },
  });

  // Reset form when field changes (switching between create/edit)
  useEffect(() => {
    reset({
      name: field?.name ?? "",
      type: field?.type ?? "text",
      required: field?.required ?? false,
      options: field?.options ?? null,
      _allowedTypesStr: field?.options?.allowedTypes?.join(", ") ?? "",
    });
  }, [field, reset]);

  const fieldType = watch("type");

  // Filter out current collection from relation targets
  const availableCollections = collections.filter(
    (c) => c.name !== currentCollection
  );

  const handleFormSubmit = (data: FieldInput & { _allowedTypesStr?: string }) => {
    const { _allowedTypesStr, ...fieldData } = data;
    if (fieldData.type === "file") {
      const allowedTypes = _allowedTypesStr
        ? _allowedTypesStr.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
      fieldData.options = {
        maxFiles: fieldData.options?.maxFiles ?? 1,
        maxSize: fieldData.options?.maxSize ?? 5242880,
        ...(allowedTypes.length > 0 ? { allowedTypes } : {}),
      };
    }
    onSubmit(fieldData);
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      {/* Field Name */}
      <div className="space-y-2">
        <Label htmlFor="name">Field Name</Label>
        <Input
          id="name"
          placeholder="e.g., title, description, price"
          {...register("name", {
            required: "Field name is required",
            pattern: {
              value: /^[a-zA-Z][a-zA-Z0-9_]*$/,
              message:
                "Must start with letter, contain only letters, numbers, underscores",
            },
            validate: {
              notReserved: (value) =>
                !RESERVED_NAMES.includes(value) ||
                "This name is reserved for system fields",
            },
          })}
          disabled={loading}
          aria-invalid={!!errors.name}
        />
        {errors.name && (
          <p className="text-sm text-destructive">{errors.name.message}</p>
        )}
      </div>

      {/* Field Type */}
      <div className="space-y-2">
        <Label htmlFor="type">Field Type</Label>
        <Controller
          name="type"
          control={control}
          rules={{ required: "Field type is required" }}
          render={({ field: formField }) => (
            <Select
              value={formField.value}
              onValueChange={formField.onChange}
              disabled={loading}
            >
              <SelectTrigger id="type">
                <SelectValue placeholder="Select field type" />
              </SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    <div className="flex flex-col">
                      <span>{type.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {type.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.type && (
          <p className="text-sm text-destructive">{errors.type.message}</p>
        )}
      </div>

      {/* Required Toggle */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="required">Required</Label>
          <p className="text-sm text-muted-foreground">
            Records must have a value for this field
          </p>
        </div>
        <Controller
          name="required"
          control={control}
          render={({ field: formField }) => (
            <Switch
              id="required"
              checked={formField.value}
              onCheckedChange={formField.onChange}
              disabled={loading}
            />
          )}
        />
      </div>

      {/* Relation Target (conditional) */}
      {fieldType === "relation" && (
        <div className="space-y-2">
          <Label htmlFor="target">Target Collection</Label>
          <Controller
            name="options.target"
            control={control}
            rules={{
              required:
                fieldType === "relation"
                  ? "Target collection is required for relations"
                  : false,
            }}
            render={({ field: formField }) => (
              <Select
                value={formField.value ?? ""}
                onValueChange={formField.onChange}
                disabled={loading}
              >
                <SelectTrigger id="target">
                  <SelectValue placeholder="Select target collection" />
                </SelectTrigger>
                <SelectContent>
                  {availableCollections.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      No other collections available
                    </div>
                  ) : (
                    availableCollections.map((c) => (
                      <SelectItem key={c.id} value={c.name}>
                        {c.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            )}
          />
          {errors.options?.target && (
            <p className="text-sm text-destructive">
              {errors.options.target.message}
            </p>
          )}
        </div>
      )}

      {/* File Options (conditional) */}
      {fieldType === "file" && (
        <div className="space-y-4 rounded-lg border p-4">
          <p className="text-sm font-medium">File Options</p>
          <div className="space-y-2">
            <Label htmlFor="maxFiles">Max Files</Label>
            <Input
              id="maxFiles"
              type="number"
              min={1}
              {...register("options.maxFiles", { valueAsNumber: true })}
              placeholder="1"
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              Maximum number of files allowed (default: 1)
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="maxSize">Max Size (bytes)</Label>
            <Input
              id="maxSize"
              type="number"
              min={1}
              {...register("options.maxSize", { valueAsNumber: true })}
              placeholder="5242880"
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              Maximum file size in bytes (default: 5 MB)
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="allowedTypes">Allowed Types</Label>
            <Input
              id="allowedTypes"
              {...register("_allowedTypesStr")}
              placeholder="image/*, application/pdf"
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated MIME types (leave empty for any)
            </p>
          </div>
        </div>
      )}

      {/* Submit Button */}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading && <Spinner className="mr-2" size="sm" />}
        {loading ? "Saving..." : field ? "Update Field" : "Create Field"}
      </Button>
    </form>
  );
}
