/**
 * Create collection sheet - form to create a new collection.
 * Opens from sidebar "New Collection" button.
 */

import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { createCollection, type FieldInput } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Label } from "@/components/ui/label";
import { Database, Shield } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface CreateCollectionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (collectionName: string) => void;
}

interface FormData {
  name: string;
  type: "base" | "auth";
}

/**
 * CreateCollectionSheet allows creating a new empty collection.
 * After creation, navigates to the schema editor to add fields.
 */
export function CreateCollectionSheet({
  open,
  onOpenChange,
  onCreated,
}: CreateCollectionSheetProps) {
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: { name: "", type: "base" as const },
  });

  const selectedType = watch("type");

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      await createCollection(data.name, [], data.type);
      toast.success(`Collection "${data.name}" created`);
      reset();
      onOpenChange(false);
      // Navigate to schema editor for the new collection
      onCreated(data.name);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>New Collection</SheetTitle>
          <SheetDescription>
            Create a new collection. You can add fields in the schema editor
            after creation.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-6 px-4">
          <div className="space-y-2">
            <Label htmlFor="collection-name">Collection Name</Label>
            <Input
              id="collection-name"
              placeholder="e.g., posts, products, users"
              {...register("name", {
                required: "Collection name is required",
                pattern: {
                  value: /^[a-zA-Z][a-zA-Z0-9_]*$/,
                  message:
                    "Must start with letter, contain only letters, numbers, underscores",
                },
                validate: {
                  notSystem: (value) =>
                    !value.startsWith("_") ||
                    "Names starting with underscore are reserved for system collections",
                },
              })}
              disabled={loading}
              aria-invalid={!!errors.name}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Use lowercase letters and underscores (e.g., blog_posts)
            </p>
          </div>

          <div className="space-y-2">
            <Label>Collection Type</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setValue("type", "base")}
                className={`flex items-center gap-2 rounded-md border p-3 text-left text-sm transition-colors ${
                  selectedType === "base"
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "hover:bg-accent"
                }`}
                disabled={loading}
              >
                <Database className="h-4 w-4 shrink-0" />
                <div>
                  <div className="font-medium">Base</div>
                  <div className="text-xs text-muted-foreground">Data records</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setValue("type", "auth")}
                className={`flex items-center gap-2 rounded-md border p-3 text-left text-sm transition-colors ${
                  selectedType === "auth"
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "hover:bg-accent"
                }`}
                disabled={loading}
              >
                <Shield className="h-4 w-4 shrink-0" />
                <div>
                  <div className="font-medium">Auth</div>
                  <div className="text-xs text-muted-foreground">User accounts</div>
                </div>
              </button>
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Spinner className="mr-2" size="sm" />}
            {loading ? "Creating..." : "Create Collection"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
