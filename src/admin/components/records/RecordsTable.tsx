/**
 * Records table component using TanStack Table.
 * Renders collection records with dynamic columns based on fields.
 */

import { useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import type { Field } from "@/hooks/useCollectionFields";

interface RecordsTableProps {
  records: Record<string, unknown>[];
  fields: Field[];
  loading: boolean;
  onEdit: (record: Record<string, unknown>) => void;
  onDelete: (record: Record<string, unknown>) => void;
  onRowClick: (record: Record<string, unknown>) => void;
}

/**
 * Helper to format cell values based on field type.
 *
 * @param value - The raw cell value
 * @param type - The field type (text, number, boolean, etc.)
 * @returns Formatted React node for display
 */
function formatCellValue(value: unknown, type: string): React.ReactNode {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">-</span>;
  }

  switch (type) {
    case "boolean":
      return value ? "Yes" : "No";
    case "datetime":
      return new Date(value as string).toLocaleString();
    case "json":
      return (
        <span className="font-mono text-xs max-w-[200px] truncate block">
          {JSON.stringify(value)}
        </span>
      );
    case "relation":
      return (
        <span className="font-mono text-xs">
          {String(value).slice(0, 8)}...
        </span>
      );
    default:
      return String(value);
  }
}

/**
 * RecordsTable displays collection records using TanStack Table.
 * Columns are dynamically built from collection fields.
 *
 * @param records - Array of records to display
 * @param fields - Collection field definitions for column generation
 * @param loading - Show loading skeletons when true
 * @param onEdit - Callback when edit action is triggered
 * @param onDelete - Callback when delete action is triggered
 * @param onRowClick - Callback when row is clicked
 */
export function RecordsTable({
  records,
  fields,
  loading,
  onEdit,
  onDelete,
  onRowClick,
}: RecordsTableProps) {
  // Build columns from fields + system fields + actions
  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(() => {
    const cols: ColumnDef<Record<string, unknown>>[] = [
      // ID column (always first)
      {
        accessorKey: "id",
        header: "ID",
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {String(row.getValue("id")).slice(0, 8)}...
          </span>
        ),
      },
      // Dynamic field columns
      ...fields.map((field) => ({
        accessorKey: field.name,
        header: field.name,
        cell: ({ row }: { row: { getValue: (key: string) => unknown } }) => {
          const value = row.getValue(field.name);
          return formatCellValue(value, field.type);
        },
      })),
      // Created at
      {
        accessorKey: "created_at",
        header: "Created",
        cell: ({ row }) => {
          const date = new Date(row.getValue("created_at") as string);
          return date.toLocaleDateString();
        },
      },
      // Actions column
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
              >
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(row.original)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(row.original)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ];
    return cols;
  }, [fields, onEdit, onDelete]);

  const table = useReactTable({
    data: records,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="text-center py-12 border rounded-lg bg-muted/50">
        <p className="text-muted-foreground">No records found</p>
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
              className="cursor-pointer"
              onClick={() => onRowClick(row.original)}
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
