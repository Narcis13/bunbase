/**
 * Fields table component displaying collection fields.
 * Uses TanStack Table for consistent data table experience.
 */

import { MoreHorizontal } from "lucide-react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import type { Field } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

interface FieldsTableProps {
  fields: Field[];
  loading: boolean;
  onEdit: (field: Field) => void;
  onDelete: (field: Field) => void;
}

/**
 * Type badge colors for visual distinction.
 */
const TYPE_COLORS: Record<string, string> = {
  text: "bg-blue-100 text-blue-800",
  number: "bg-green-100 text-green-800",
  boolean: "bg-purple-100 text-purple-800",
  datetime: "bg-orange-100 text-orange-800",
  json: "bg-gray-100 text-gray-800",
  relation: "bg-pink-100 text-pink-800",
  file: "bg-amber-100 text-amber-800",
};

/**
 * FieldsTable displays a collection's fields in a table with actions.
 */
export function FieldsTable({
  fields,
  loading,
  onEdit,
  onDelete,
}: FieldsTableProps) {
  const columns: ColumnDef<Field>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <span className="font-mono text-sm">{row.original.name}</span>
      ),
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => (
        <span
          className={`px-2 py-1 rounded-md text-xs font-medium ${
            TYPE_COLORS[row.original.type] || "bg-gray-100"
          }`}
        >
          {row.original.type}
        </span>
      ),
    },
    {
      accessorKey: "required",
      header: "Required",
      cell: ({ row }) => (
        <span className={row.original.required ? "text-green-600" : "text-muted-foreground"}>
          {row.original.required ? "Yes" : "No"}
        </span>
      ),
    },
    {
      id: "options",
      header: "Options",
      cell: ({ row }) => {
        if (row.original.type === "relation" && row.original.options?.target) {
          return (
            <span className="text-sm text-muted-foreground">
              -&gt; {row.original.options.target}
            </span>
          );
        }
        if (row.original.type === "file" && row.original.options) {
          const opts = row.original.options;
          const parts: string[] = [];
          if (opts.maxFiles) parts.push(`max ${opts.maxFiles} file${opts.maxFiles > 1 ? "s" : ""}`);
          if (opts.maxSize) parts.push(`${(opts.maxSize / 1024 / 1024).toFixed(1)} MB`);
          if (opts.allowedTypes?.length) parts.push(opts.allowedTypes.join(", "));
          if (parts.length > 0) {
            return (
              <span className="text-sm text-muted-foreground">
                {parts.join(" · ")}
              </span>
            );
          }
        }
        return <span className="text-muted-foreground">-</span>;
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(row.original)}>
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDelete(row.original)}
              className="text-destructive"
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const table = useReactTable({
    data: fields,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (fields.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No fields defined. Click "Add Field" to create one.
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              tabIndex={0}
              className="cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring focus:ring-inset"
              onClick={() => onEdit(row.original)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onEdit(row.original);
                }
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  const nextRow = e.currentTarget.nextElementSibling as HTMLElement;
                  nextRow?.focus();
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  const prevRow = e.currentTarget.previousElementSibling as HTMLElement;
                  prevRow?.focus();
                }
              }}
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
