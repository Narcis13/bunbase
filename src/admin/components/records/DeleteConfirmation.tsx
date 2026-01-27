/**
 * Delete confirmation dialog component.
 * Shows an alert dialog before deleting a record.
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Spinner } from "@/components/ui/spinner";

interface DeleteConfirmationProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  recordId: string;
  loading?: boolean;
}

/**
 * DeleteConfirmation displays a confirmation dialog before deletion.
 * Requires explicit confirmation to delete a record.
 *
 * @param open - Whether the dialog is open
 * @param onOpenChange - Callback when dialog open state changes
 * @param onConfirm - Callback when deletion is confirmed
 * @param recordId - ID of the record being deleted
 * @param loading - Whether deletion is in progress
 */
export function DeleteConfirmation({
  open,
  onOpenChange,
  onConfirm,
  recordId,
  loading,
}: DeleteConfirmationProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Record?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete the
            record with ID{" "}
            <code className="font-mono text-sm bg-muted px-1 rounded">
              {recordId}
            </code>
            .
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={loading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {loading && <Spinner className="mr-2" size="sm" />}
            {loading ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
