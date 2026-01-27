/**
 * Spinner component for loading states.
 * Uses Lucide's Loader2 icon with Tailwind animate-spin.
 */

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SpinnerProps {
  /** Additional CSS classes */
  className?: string;
  /** Size variant */
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-6 w-6",
} as const;

/**
 * Spinner displays an animated loading indicator.
 * Decorative element - screen readers get loading text from button.
 *
 * @param className - Additional CSS classes for styling
 * @param size - Size variant: "sm" (16px), "md" (20px), "lg" (24px). Default: "md"
 *
 * @example
 * <Button disabled={loading}>
 *   {loading && <Spinner className="mr-2" size="sm" />}
 *   {loading ? "Saving..." : "Save"}
 * </Button>
 */
export function Spinner({ className, size = "md" }: SpinnerProps) {
  return (
    <Loader2
      className={cn("animate-spin", sizeClasses[size], className)}
      aria-hidden="true"
    />
  );
}
