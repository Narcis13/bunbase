/**
 * Email Template Utilities
 *
 * Provides template placeholder replacement for email content.
 * Pure functions with no side effects, enabling easy testing.
 */

/**
 * Replace {{key}} placeholders in a template string with provided values.
 *
 * @param template - Template string containing {{key}} placeholders
 * @param values - Key-value pairs for replacement
 * @returns Template with placeholders replaced by values
 *
 * @remarks
 * - Matches only {{word}} patterns (alphanumeric and underscore)
 * - Missing keys are preserved (not replaced with undefined)
 * - Empty template returns empty string
 * - Empty values object returns template unchanged
 *
 * @example
 * // Basic replacement
 * replacePlaceholders('Hello {{name}}!', { name: 'World' });
 * // Returns: 'Hello World!'
 *
 * @example
 * // Missing key preserved
 * replacePlaceholders('{{greeting}} {{name}}', { greeting: 'Hi' });
 * // Returns: 'Hi {{name}}'
 *
 * @example
 * // Multiple same keys
 * replacePlaceholders('{{x}} + {{x}} = 2x', { x: '5' });
 * // Returns: '5 + 5 = 2x'
 */
export function replacePlaceholders(
  template: string,
  values: Record<string, string>
): string {
  // Handle empty template
  if (!template) {
    return "";
  }

  // Regex matches {{word}} where word is alphanumeric/underscore
  // Using function replacement to handle each match
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    // If key exists in values, replace; otherwise preserve original
    return Object.prototype.hasOwnProperty.call(values, key)
      ? values[key]
      : match;
  });
}
