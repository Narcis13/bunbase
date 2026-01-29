/**
 * Create user sheet for auth collections.
 * Form to create a new user with email and password.
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

interface CreateUserSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collection: string;
  onCreated: () => void;
}

interface FormData {
  email: string;
  password: string;
  confirmPassword: string;
}

/**
 * CreateUserSheet allows creating a new user in an auth collection.
 * Validates email format and password confirmation before submission.
 */
export function CreateUserSheet({
  open,
  onOpenChange,
  collection,
  onCreated,
}: CreateUserSheetProps) {
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: { email: "", password: "", confirmPassword: "" },
  });

  const password = watch("password");

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      await createAuthUser(collection, data.email, data.password);
      toast.success(`User "${data.email}" created`);
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
        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-6 px-4">
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
              aria-invalid={!!errors.email}
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
                minLength: {
                  value: 8,
                  message: "Password must be at least 8 characters",
                },
              })}
              disabled={loading}
              aria-invalid={!!errors.password}
            />
            {errors.password && (
              <p className="text-sm text-destructive">
                {errors.password.message}
              </p>
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
                validate: (value) =>
                  value === password || "Passwords do not match",
              })}
              disabled={loading}
              aria-invalid={!!errors.confirmPassword}
            />
            {errors.confirmPassword && (
              <p className="text-sm text-destructive">
                {errors.confirmPassword.message}
              </p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Spinner className="mr-2" size="sm" />}
            {loading ? "Creating..." : "Create User"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
