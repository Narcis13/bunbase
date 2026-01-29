/**
 * Auth users view component for managing users in auth collections.
 * Container with user table, pagination, create form, and admin actions.
 */

import { useState } from "react";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { AuthUsersTable } from "./AuthUsersTable";
import { CreateUserSheet } from "./CreateUserSheet";
import { DeleteConfirmation } from "@/components/records/DeleteConfirmation";
import { useRecords } from "@/hooks/useRecords";
import { useCollectionFields } from "@/hooks/useCollectionFields";
import {
  toggleUserVerified,
  sendVerificationEmail,
  deleteAuthUser,
} from "@/lib/api";
import { Button } from "@/components/ui/button";

interface AuthUsersViewProps {
  collection: string;
}

/**
 * AuthUsersView displays auth collection users with admin management actions.
 * Provides create user, toggle verified, send verification email, and delete.
 */
export function AuthUsersView({ collection }: AuthUsersViewProps) {
  const [page, setPage] = useState(1);
  const perPage = 30;

  const { records, totalItems, loading, error, refetch } = useRecords(
    collection,
    { page, perPage }
  );
  const { fields, loading: fieldsLoading } = useCollectionFields(collection);

  // Create sheet state
  const [createOpen, setCreateOpen] = useState(false);

  // Delete dialog state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingRecord, setDeletingRecord] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [deleting, setDeleting] = useState(false);

  const totalPages = Math.ceil(totalItems / perPage);

  const handleToggleVerified = async (record: Record<string, unknown>) => {
    const newVerified = record.verified ? 0 : 1;
    try {
      await toggleUserVerified(
        collection,
        record.id as string,
        newVerified
      );
      toast.success(
        newVerified ? "User marked as verified" : "User marked as unverified"
      );
      refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleSendVerification = async (record: Record<string, unknown>) => {
    try {
      await sendVerificationEmail(collection, record.id as string);
      toast.success("Verification email sent");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleDeleteClick = (record: Record<string, unknown>) => {
    setDeletingRecord(record);
    setDeleteOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingRecord) return;

    setDeleting(true);
    try {
      await deleteAuthUser(collection, deletingRecord.id as string);
      toast.success("User deleted");
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          {loading ? (
            "Loading..."
          ) : (
            <>
              {totalItems} user{totalItems !== 1 ? "s" : ""}
            </>
          )}
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="w-full sm:w-auto"
        >
          <Plus className="mr-2 h-4 w-4" />
          New User
        </Button>
      </div>

      {/* Users table */}
      <div className="overflow-x-auto">
        <AuthUsersTable
          records={records}
          fields={fields}
          loading={loading || fieldsLoading}
          onToggleVerified={handleToggleVerified}
          onSendVerification={handleSendVerification}
          onDelete={handleDeleteClick}
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

      {/* Create user sheet */}
      <CreateUserSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        collection={collection}
        onCreated={refetch}
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
