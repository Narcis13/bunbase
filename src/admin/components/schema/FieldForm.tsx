/**
 * Field form component for creating and editing fields.
 * Uses react-hook-form with Select for field type.
 */

import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import type { Field, FieldInput, Collection } from "@/lib/api";
import { Button } from "@/components/ui/button";
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
  } = useForm<FieldInput>({
    defaultValues: {
      name: field?.name ?? "",
      type: field?.type ?? "text",
      required: field?.required ?? false,
      options: field?.options ?? null,
    },
  });

  // Reset form when field changes (switching between create/edit)
  useEffect(() => {
    reset({
      name: field?.name ?? "",
      type: field?.type ?? "text",
      required: field?.required ?? false,
      options: field?.options ?? null,
    });
  }, [field, reset]);

  const fieldType = watch("type");

  // Filter out current collection from relation targets
  const availableCollections = collections.filter(
    (c) => c.name !== currentCollection
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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

      {/* Submit Button */}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Saving..." : field ? "Update Field" : "Create Field"}
      </Button>
    </form>
  );
}
