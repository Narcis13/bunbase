/**
 * Records view component with table, pagination, and CRUD forms.
 * Container component for browsing and managing collection records.
 */

import { useState } from "react";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { RecordsTable } from "./RecordsTable";
import { RecordSheet } from "./RecordSheet";
import { DeleteConfirmation } from "./DeleteConfirmation";
import { useRecords } from "@/hooks/useRecords";
import { useCollectionFields } from "@/hooks/useCollectionFields";
import { fetchWithAuth } from "@/lib/api";
import { Button } from "@/components/ui/button";

interface RecordsViewProps {
  collection: string;
}

/**
 * RecordsView displays a collection's records with full CRUD capabilities.
 * Integrates data fetching, table display, forms, and pagination.
 *
 * @param collection - Name of the collection to display
 */
export function RecordsView({ collection }: RecordsViewProps) {
  const [page, setPage] = useState(1);
  const perPage = 30;

  const { records, totalItems, loading, error, refetch } = useRecords(
    collection,
    { page, perPage }
  );
  const { fields, loading: fieldsLoading } = useCollectionFields(collection);

  // Sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [saving, setSaving] = useState(false);

  // Delete dialog state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingRecord, setDeletingRecord] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [deleting, setDeleting] = useState(false);

  const totalPages = Math.ceil(totalItems / perPage);

  // Handle create
  const handleCreate = () => {
    setEditingRecord(null);
    setSheetOpen(true);
  };

  // Handle edit
  const handleEdit = (record: Record<string, unknown>) => {
    setEditingRecord(record);
    setSheetOpen(true);
  };

  // Handle delete click
  const handleDeleteClick = (record: Record<string, unknown>) => {
    setDeletingRecord(record);
    setDeleteOpen(true);
  };

  // Submit create/edit
  const handleSubmit = async (data: Record<string, unknown>) => {
    setSaving(true);
    try {
      if (editingRecord) {
        // Update existing record
        await fetchWithAuth(
          `/api/collections/${collection}/records/${editingRecord.id}`,
          {
            method: "PATCH",
            body: JSON.stringify(data),
          }
        );
        toast.success("Record updated successfully");
      } else {
        // Create new record
        await fetchWithAuth(`/api/collections/${collection}/records`, {
          method: "POST",
          body: JSON.stringify(data),
        });
        toast.success("Record created successfully");
      }
      setSheetOpen(false);
      refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // Confirm delete
  const handleDeleteConfirm = async () => {
    if (!deletingRecord) return;

    setDeleting(true);
    try {
      await fetchWithAuth(
        `/api/collections/${collection}/records/${deletingRecord.id}`,
        {
          method: "DELETE",
        }
      );
      toast.success("Record deleted successfully");
      setDeleteOpen(false);
      setDeletingRecord(null);
      refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive">Error: {error}</p>
        <Button onClick={refetch} variant="outline" className="mt-4">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with create button */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {loading ? (
            "Loading..."
          ) : (
            <>
              {totalItems} record{totalItems !== 1 ? "s" : ""}
            </>
          )}
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          New Record
        </Button>
      </div>

      {/* Records table */}
      <RecordsTable
        records={records}
        fields={fields}
        loading={loading || fieldsLoading}
        onEdit={handleEdit}
        onDelete={handleDeleteClick}
        onRowClick={handleEdit}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Record form sheet */}
      <RecordSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        collection={collection}
        fields={fields}
        fieldsLoading={fieldsLoading}
        record={editingRecord}
        onSubmit={handleSubmit}
        loading={saving}
      />

      {/* Delete confirmation */}
      <DeleteConfirmation
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={handleDeleteConfirm}
        recordId={(deletingRecord?.id as string) ?? ""}
        loading={deleting}
      />
    </div>
  );
}
