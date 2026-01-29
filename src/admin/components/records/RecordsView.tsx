/**
 * Records view component with table, pagination, and CRUD forms.
 * Container component for browsing and managing collection records.
 * Auto-refreshes on realtime events from other sessions.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { RecordsTable } from "./RecordsTable";
import { RecordSheet } from "./RecordSheet";
import { DeleteConfirmation } from "./DeleteConfirmation";
import { useRecords } from "@/hooks/useRecords";
import { useCollectionFields } from "@/hooks/useCollectionFields";
import { fetchWithAuth } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useRealtimeContext } from "@/contexts/RealtimeContext";

interface RecordsViewProps {
  collection: string;
}

const ACTION_LABELS: Record<string, string> = {
  create: "Record created",
  update: "Record updated",
  delete: "Record deleted",
};

/**
 * RecordsView displays a collection's records with full CRUD capabilities.
 * Integrates data fetching, table display, forms, and pagination.
 * Listens for SSE events and auto-refreshes the table.
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

  // Track own mutations to avoid double-toasting
  const ownMutationRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totalPages = Math.ceil(totalItems / perPage);

  // Realtime auto-refresh
  const realtime = useRealtimeContext();

  const debouncedRefetch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      refetch();
    }, 500);
  }, [refetch]);

  useEffect(() => {
    const unsub = realtime.onEvent(collection, (event) => {
      // Skip toast for own mutations (within 2 seconds)
      if (ownMutationRef.current) return;

      const label = ACTION_LABELS[event.action] || "Record changed";
      toast.info(label, {
        description: `${collection} / ${event.record.id}`,
        duration: 3000,
      });
      debouncedRefetch();
    });

    return () => {
      unsub();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [collection, realtime, debouncedRefetch]);

  // Mark own mutation window
  const markOwnMutation = () => {
    ownMutationRef.current = true;
    setTimeout(() => {
      ownMutationRef.current = false;
    }, 2000);
  };

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
  const handleSubmit = async (data: Record<string, unknown> | FormData) => {
    setSaving(true);
    try {
      const isFormData = data instanceof FormData;
      const body = isFormData ? data : JSON.stringify(data);

      markOwnMutation();

      if (editingRecord) {
        // Update existing record
        await fetchWithAuth(
          `/api/collections/${collection}/records/${editingRecord.id}`,
          { method: "PATCH", body }
        );
        toast.success("Record updated successfully");
      } else {
        // Create new record
        await fetchWithAuth(`/api/collections/${collection}/records`, {
          method: "POST",
          body,
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
      markOwnMutation();

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          {loading ? (
            "Loading..."
          ) : (
            <>
              {totalItems} record{totalItems !== 1 ? "s" : ""}
            </>
          )}
        </div>
        <Button onClick={handleCreate} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          New Record
        </Button>
      </div>

      {/* Records table */}
      <div className="overflow-x-auto">
        <RecordsTable
          records={records}
          fields={fields}
          loading={loading || fieldsLoading}
          onEdit={handleEdit}
          onDelete={handleDeleteClick}
          onRowClick={handleEdit}
        />
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
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
              <span className="sr-only sm:not-sr-only">Previous</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
            >
              <span className="sr-only sm:not-sr-only">Next</span>
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
