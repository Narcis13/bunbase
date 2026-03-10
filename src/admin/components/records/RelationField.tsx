/**
 * RelationField - searchable combobox for picking records from a related collection.
 * Fetches records from the target collection and lets the user search and select.
 */

import { useState, useEffect, useRef } from "react";
import { ChevronDown, X, Search, Loader2 } from "lucide-react";
import { fetchWithAuth } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

interface RelationRecord {
  id: string;
  [key: string]: unknown;
}

interface RelationFieldProps {
  value: string;
  onChange: (value: string | null) => void;
  target: string;
  required?: boolean;
}

const SYSTEM_FIELDS = new Set(["id", "created_at", "updated_at", "collection_id"]);

/**
 * Pick the best human-readable label for a record.
 * Uses the first non-empty string field, then falls back to short ID.
 */
function getRecordLabel(record: RelationRecord): string {
  for (const [key, val] of Object.entries(record)) {
    if (SYSTEM_FIELDS.has(key)) continue;
    if (typeof val === "string" && val.trim()) return val;
    if (typeof val === "number") return String(val);
  }
  return record.id.slice(0, 8);
}

export function RelationField({ value, onChange, target, required }: RelationFieldProps) {
  const [open, setOpen] = useState(false);
  const [records, setRecords] = useState<RelationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!target) return;
    setLoading(true);
    fetchWithAuth(`/api/collections/${target}/records?perPage=200`)
      .then((r) => r.json())
      .then((data) => {
        setRecords(data.items ?? []);
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [target]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [open]);

  const selectedRecord = records.find((r) => r.id === value) ?? null;

  const filtered = search
    ? records.filter((r) => {
        const label = getRecordLabel(r).toLowerCase();
        return label.includes(search.toLowerCase()) || r.id.includes(search);
      })
    : records;

  const toggle = () => {
    setOpen((o) => !o);
    if (open) setSearch("");
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <div
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        tabIndex={0}
        className={cn(
          "flex h-10 w-full cursor-pointer items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm",
          "hover:border-ring/70 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          open && "ring-2 ring-ring ring-offset-2"
        )}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
          if (e.key === "Escape") { setOpen(false); setSearch(""); }
        }}
      >
        {loading ? (
          <span className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading {target}…
          </span>
        ) : selectedRecord ? (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate font-medium">{getRecordLabel(selectedRecord)}</span>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">
              {value.slice(0, 8)}
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground">Select {target} record…</span>
        )}

        <div className="flex shrink-0 items-center gap-1 pl-2">
          {value && !required && (
            <button
              type="button"
              aria-label="Clear"
              className="rounded p-0.5 hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
            >
              <X className="h-3 w-3" />
            </button>
          )}
          <ChevronDown
            className={cn("h-4 w-4 opacity-50 transition-transform duration-150", open && "rotate-180")}
          />
        </div>
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg">
          {/* Search */}
          <div className="border-b p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${target}…`}
                className="h-9 pl-8"
                onKeyDown={(e) => {
                  if (e.key === "Escape") { setOpen(false); setSearch(""); }
                }}
              />
            </div>
          </div>

          {/* Options */}
          <div role="listbox" className="max-h-60 overflow-y-auto p-1">
            {error ? (
              <p className="px-3 py-2 text-sm text-destructive">{error}</p>
            ) : filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">
                {search ? "No matches found" : `No records in "${target}"`}
              </p>
            ) : (
              filtered.map((record) => {
                const label = getRecordLabel(record);
                const isSelected = record.id === value;
                return (
                  <div
                    key={record.id}
                    role="option"
                    aria-selected={isSelected}
                    className={cn(
                      "flex cursor-pointer items-center justify-between rounded-sm px-3 py-2 text-sm",
                      "hover:bg-accent hover:text-accent-foreground",
                      isSelected && "bg-accent text-accent-foreground font-medium"
                    )}
                    onClick={() => {
                      onChange(record.id);
                      setOpen(false);
                      setSearch("");
                    }}
                  >
                    <span className="truncate">{label}</span>
                    <span className="ml-2 shrink-0 font-mono text-xs text-muted-foreground">
                      {record.id.slice(0, 8)}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer hint */}
          {records.length > 0 && (
            <div className="border-t px-3 py-1.5">
              <p className="text-xs text-muted-foreground">
                {records.length} record{records.length !== 1 ? "s" : ""} in {target}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
