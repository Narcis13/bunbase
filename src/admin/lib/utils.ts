/**
 * Utility functions for shadcn/ui components
 */

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge class names with Tailwind CSS specificity handling.
 * This is the standard utility used by all shadcn/ui components.
 *
 * @param inputs - Class names to merge (strings, arrays, or conditional objects)
 * @returns Merged class string with Tailwind conflicts resolved
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
