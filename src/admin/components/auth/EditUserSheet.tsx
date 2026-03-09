/**
 * Edit user sheet for auth collections.
 * Allows editing email and custom fields of an existing user.
 */

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { updateAuthUser } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { Field } from "@/hooks/useCollectionFields";

const AUTH_SYSTEM_FIELDS = new Set(["email", "password_hash", "verified"]);

interface EditUserSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collection: string;
  fields: Field[];
  record: Record<string, unknown> | null;
  onUpdated: () => void;
}

export function EditUserSheet({
  open,
  onOpenChange,
  collection,
  fields,
  record,
  onUpdated,
}: EditUserSheetProps) {
  const customFields = fields.filter((f) => !AUTH_SYSTEM_FIELDS.has(f.name));

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Record<string, string>>();

  // Populate form when record changes
  useEffect(() => {
    if (record) {
      reset({
        email: (record.email as string) ?? "",
        ...Object.fromEntries(
          customFields.map((f) => [f.name, String(record[f.name] ?? "")])
        ),
      });
    }
  }, [record]);

  const onSubmit = async (data: Record<string, string>) => {
    if (!record) return;
    try {
      const updates: Record<string, unknown> = {};
      if (data.email && data.email !== record.email) updates.email = data.email;
      for (const field of customFields) {
        if (data[field.name] !== String(record[field.name] ?? "")) {
          updates[field.name] = data[field.name];
        }
      }
      if (Object.keys(updates).length === 0) {
        onOpenChange(false);
        return;
      }
      await updateAuthUser(collection, record.id as string, updates);
      toast.success("User updated");
      onOpenChange(false);
      onUpdated();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit User</SheetTitle>
          <SheetDescription>
            Update user details in the {collection} collection.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4 px-4">
          <div className="space-y-2">
            <Label htmlFor="edit-email">Email</Label>
            <Input
              id="edit-email"
              type="email"
              {...register("email", {
                required: "Email is required",
                pattern: {
                  value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                  message: "Invalid email address",
                },
              })}
              disabled={isSubmitting}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>

          {customFields.map((field) => (
            <div key={field.name} className="space-y-2">
              <Label htmlFor={`edit-${field.name}`}>
                {field.name}
                {field.required && <span className="text-destructive ml-1">*</span>}
              </Label>
              <Input
                id={`edit-${field.name}`}
                placeholder={field.name}
                {...register(field.name, {
                  required: field.required ? `${field.name} is required` : false,
                })}
                disabled={isSubmitting}
              />
              {errors[field.name] && (
                <p className="text-sm text-destructive">{errors[field.name]?.message}</p>
              )}
            </div>
          ))}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting && <Spinner className="mr-2" size="sm" />}
            {isSubmitting ? "Saving..." : "Save Changes"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
