/**
 * Create user sheet for auth collections.
 * Form to create a new user with email, password, and custom fields.
 */

import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { createAuthUser } from "@/lib/api";
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

interface CreateUserSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collection: string;
  fields: Field[];
  onCreated: () => void;
}

export function CreateUserSheet({
  open,
  onOpenChange,
  collection,
  fields,
  onCreated,
}: CreateUserSheetProps) {
  const [loading, setLoading] = useState(false);
  const customFields = fields.filter((f) => !AUTH_SYSTEM_FIELDS.has(f.name));

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<Record<string, string>>({
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
      ...Object.fromEntries(customFields.map((f) => [f.name, ""])),
    },
  });

  const password = watch("password");

  const onSubmit = async (data: Record<string, string>) => {
    setLoading(true);
    try {
      const { email, password, confirmPassword: _confirm, ...extra } = data;
      // Only pass non-empty custom fields
      const extraFields = Object.fromEntries(
        Object.entries(extra).filter(([, v]) => v !== "")
      );
      await createAuthUser(
        collection,
        email,
        password,
        Object.keys(extraFields).length > 0 ? extraFields : undefined
      );
      toast.success(`User "${email}" created`);
      reset();
      onOpenChange(false);
      onCreated();
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
          <SheetTitle>New User</SheetTitle>
          <SheetDescription>
            Create a new user in the {collection} collection.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4 px-4">
          <div className="space-y-2">
            <Label htmlFor="user-email">Email</Label>
            <Input
              id="user-email"
              type="email"
              placeholder="user@example.com"
              {...register("email", {
                required: "Email is required",
                pattern: {
                  value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                  message: "Invalid email address",
                },
              })}
              disabled={loading}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-password">Password</Label>
            <Input
              id="user-password"
              type="password"
              placeholder="Minimum 8 characters"
              {...register("password", {
                required: "Password is required",
                minLength: { value: 8, message: "Password must be at least 8 characters" },
              })}
              disabled={loading}
            />
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-confirm-password">Confirm Password</Label>
            <Input
              id="user-confirm-password"
              type="password"
              placeholder="Re-enter password"
              {...register("confirmPassword", {
                required: "Please confirm the password",
                validate: (value) => value === password || "Passwords do not match",
              })}
              disabled={loading}
            />
            {errors.confirmPassword && (
              <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
            )}
          </div>

          {customFields.map((field) => (
            <div key={field.name} className="space-y-2">
              <Label htmlFor={`user-${field.name}`}>
                {field.name}
                {field.required && <span className="text-destructive ml-1">*</span>}
              </Label>
              <Input
                id={`user-${field.name}`}
                placeholder={field.name}
                {...register(field.name, {
                  required: field.required ? `${field.name} is required` : false,
                })}
                disabled={loading}
              />
              {errors[field.name] && (
                <p className="text-sm text-destructive">{errors[field.name]?.message}</p>
              )}
            </div>
          ))}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Spinner className="mr-2" size="sm" />}
            {loading ? "Creating..." : "Create User"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
