/**
 * CLI Output Formatting
 *
 * All data goes to stdout, all errors go to stderr. Pipe-friendly.
 */

/**
 * Write data to stdout in the specified format.
 */
export function output(data: unknown, format: "json" | "table" = "json"): void {
  if (format === "json") {
    console.log(JSON.stringify(data, null, 2));
  } else {
    if (Array.isArray(data) && data.length > 0) {
      const headers = Object.keys(data[0]);
      const rows = data.map((row) =>
        headers.map((h) => String(row[h] ?? ""))
      );
      outputTable(headers, rows);
    } else if (typeof data === "object" && data !== null) {
      const headers = Object.keys(data);
      const rows = [headers.map((h) => String((data as Record<string, unknown>)[h] ?? ""))];
      outputTable(headers, rows);
    } else {
      console.log(String(data));
    }
  }
}

/**
 * Print a formatted table to stdout.
 */
export function outputTable(headers: string[], rows: string[][]): void {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length))
  );

  const separator = widths.map((w) => "-".repeat(w)).join(" | ");
  const headerLine = headers.map((h, i) => h.padEnd(widths[i])).join(" | ");

  console.log(headerLine);
  console.log(separator);
  for (const row of rows) {
    console.log(row.map((cell, i) => (cell ?? "").padEnd(widths[i])).join(" | "));
  }
}

/**
 * Write a structured error to stderr as JSON.
 */
export function outputError(code: string, message: string, details?: unknown): void {
  const err: Record<string, unknown> = { error: code, message };
  if (details !== undefined) err.details = details;
  console.error(JSON.stringify(err));
}
