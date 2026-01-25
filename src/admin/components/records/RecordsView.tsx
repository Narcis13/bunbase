/**
 * Records view component with table and pagination controls.
 * Container component for browsing collection records.
 */

import { useState } from "react";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { RecordsTable } from "./RecordsTable";
import { useRecords } from "@/hooks/useRecords";
import { useCollectionFields } from "@/hooks/useCollectionFields";
import { Button } from "@/components/ui/button";

interface RecordsViewProps {
  collection: string;
  onCreateRecord: () => void;
  onEditRecord: (record: Record<string, unknown>) => void;
  onDeleteRecord: (record: Record<string, unknown>) => void;
}

/**
 * RecordsView displays a collection's records with pagination.
 * Integrates data fetching hooks and RecordsTable component.
 *
 * @param collection - Name of the collection to display
 * @param onCreateRecord - Callback when create button is clicked
 * @param onEditRecord - Callback when record is selected for editing
 * @param onDeleteRecord - Callback when record is selected for deletion
 */
export function RecordsView({
  collection,
  onCreateRecord,
  onEditRecord,
  onDeleteRecord,
}: RecordsViewProps) {
  const [page, setPage] = useState(1);
  const perPage = 30;

  const { records, totalItems, loading, error, refetch } = useRecords(
    collection,
    { page, perPage }
  );
  const { fields, loading: fieldsLoading } = useCollectionFields(collection);

  const totalPages = Math.ceil(totalItems / perPage);

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
        <Button onClick={onCreateRecord}>
          <Plus className="mr-2 h-4 w-4" />
          New Record
        </Button>
      </div>

      {/* Records table */}
      <RecordsTable
        records={records}
        fields={fields}
        loading={loading || fieldsLoading}
        onEdit={onEditRecord}
        onDelete={onDeleteRecord}
        onRowClick={onEditRecord}
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
    </div>
  );
}
