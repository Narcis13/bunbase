/**
 * Auth users table component using TanStack Table.
 * Renders auth collection users with email, verified status, and admin actions.
 */

import { useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import {
  MoreHorizontal,
  ShieldCheck,
  ShieldOff,
  Mail,
  Trash2,
} from "lucide-react";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import type { Field } from "@/hooks/useCollectionFields";

interface AuthUsersTableProps {
  records: Record<string, unknown>[];
  fields: Field[];
  loading: boolean;
  onToggleVerified: (record: Record<string, unknown>) => void;
  onSendVerification: (record: Record<string, unknown>) => void;
  onDelete: (record: Record<string, unknown>) => void;
}

/** System fields to exclude from the custom columns display. */
const HIDDEN_FIELDS = new Set(["email", "password_hash", "verified"]);

/**
 * AuthUsersTable displays auth collection users with admin actions.
 * Columns: ID, Email, Verified badge, custom fields, Created, Actions.
 */
export function AuthUsersTable({
  records,
  fields,
  loading,
  onToggleVerified,
  onSendVerification,
  onDelete,
}: AuthUsersTableProps) {
  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(() => {
    const cols: ColumnDef<Record<string, unknown>>[] = [
      {
        accessorKey: "id",
        header: "ID",
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {String(row.getValue("id")).slice(0, 8)}...
          </span>
        ),
      },
      {
        accessorKey: "email",
        header: "Email",
        cell: ({ row }) => (
          <span className="font-medium">{String(row.getValue("email"))}</span>
        ),
      },
      {
        accessorKey: "verified",
        header: "Verified",
        cell: ({ row }) => {
          const verified = row.getValue("verified");
          return verified ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
              Verified
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
              Unverified
            </span>
          );
        },
      },
      // Custom fields (excluding auth system fields)
      ...fields
        .filter((f) => !HIDDEN_FIELDS.has(f.name))
        .map((field) => ({
          accessorKey: field.name,
          header: field.name,
          cell: ({
            row,
          }: {
            row: { getValue: (key: string) => unknown };
          }) => {
            const value = row.getValue(field.name);
            if (value === null || value === undefined) {
              return <span className="text-muted-foreground">-</span>;
            }
            return String(value);
          },
        })),
      {
        accessorKey: "created_at",
        header: "Created",
        cell: ({ row }) => {
          const date = new Date(row.getValue("created_at") as string);
          return date.toLocaleDateString();
        },
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const verified = row.original.verified;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => onToggleVerified(row.original)}
                >
                  {verified ? (
                    <>
                      <ShieldOff className="mr-2 h-4 w-4" />
                      Mark Unverified
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="mr-2 h-4 w-4" />
                      Mark Verified
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onSendVerification(row.original)}
                  disabled={!!verified}
                >
                  <Mail className="mr-2 h-4 w-4" />
                  Send Verification Email
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onDelete(row.original)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ];
    return cols;
  }, [fields, onToggleVerified, onSendVerification, onDelete]);

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
        <p className="text-muted-foreground">No users found</p>
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
            <TableRow key={row.id}>
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
