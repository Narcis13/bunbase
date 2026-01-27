/**
 * Schema view component - main container for schema editor.
 * Displays fields table with add/edit/delete capabilities.
 */

import { useState, useEffect } from "react";
import { Plus, ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { FieldsTable } from "./FieldsTable";
import { FieldSheet } from "./FieldSheet";
import { useSchema } from "@/hooks/useSchema";
import {
  addField,
  updateField,
  deleteField,
  deleteCollection,
  fetchCollections,
  type Field,
  type FieldInput,
  type Collection,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
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

interface SchemaViewProps {
  collection: string;
  onBack: () => void;
  onCollectionDeleted: () => void;
  onRefreshCollections?: () => void;
}

/**
 * SchemaView displays the schema editor for a collection.
 * Allows adding, editing, and deleting fields.
 *
 * @param collection - Name of the collection to edit
 * @param onBack - Callback to navigate back to records view
 * @param onCollectionDeleted - Callback after collection is deleted
 * @param onRefreshCollections - Callback to refresh sidebar collection counts after field changes
 */
export function SchemaView({
  collection,
  onBack,
  onCollectionDeleted,
  onRefreshCollections,
}: SchemaViewProps) {
  const { fields, loading, error, refetch } = useSchema(collection);
  const [collections, setCollections] = useState<Collection[]>([]);

  // Sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingField, setEditingField] = useState<Field | null>(null);
  const [saving, setSaving] = useState(false);

  // Delete field dialog state
  const [deleteFieldOpen, setDeleteFieldOpen] = useState(false);
  const [deletingField, setDeletingField] = useState<Field | null>(null);
  const [deletingFieldLoading, setDeletingFieldLoading] = useState(false);

  // Delete collection dialog state
  const [deleteCollectionOpen, setDeleteCollectionOpen] = useState(false);
  const [deletingCollection, setDeletingCollection] = useState(false);

  // Load collections for relation target selector
  useEffect(() => {
    fetchCollections()
      .then(setCollections)
      .catch((e) => console.error("Failed to load collections:", e));
  }, []);

  // Handle add field
  const handleAddField = () => {
    setEditingField(null);
    setSheetOpen(true);
  };

  // Handle edit field
  const handleEditField = (field: Field) => {
    setEditingField(field);
    setSheetOpen(true);
  };

  // Handle delete field click
  const handleDeleteFieldClick = (field: Field) => {
    setDeletingField(field);
    setDeleteFieldOpen(true);
  };

  // Submit add/edit field
  const handleSubmit = async (data: FieldInput) => {
    setSaving(true);
    try {
      if (editingField) {
        // Update existing field
        await updateField(collection, editingField.name, data);
        toast.success(`Field "${data.name}" updated`);
      } else {
        // Add new field
        await addField(collection, data);
        toast.success(`Field "${data.name}" created`);
      }
      setSheetOpen(false);
      refetch();
      // Refresh sidebar collection counts (field count may have changed)
      onRefreshCollections?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // Confirm delete field
  const handleDeleteFieldConfirm = async () => {
    if (!deletingField) return;

    setDeletingFieldLoading(true);
    try {
      await deleteField(collection, deletingField.name);
      toast.success(`Field "${deletingField.name}" deleted`);
      setDeleteFieldOpen(false);
      setDeletingField(null);
      refetch();
      // Refresh sidebar collection counts (field count changed)
      onRefreshCollections?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDeletingFieldLoading(false);
    }
  };

  // Confirm delete collection
  const handleDeleteCollectionConfirm = async () => {
    setDeletingCollection(true);
    try {
      await deleteCollection(collection);
      toast.success(`Collection "${collection}" deleted`);
      onCollectionDeleted();
    } catch (e) {
      toast.error((e as Error).message);
      setDeletingCollection(false);
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h2 className="text-xl font-semibold">Schema: {collection}</h2>
            <p className="text-sm text-muted-foreground">
              {loading ? "Loading..." : `${fields.length} field${fields.length !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDeleteCollectionOpen(true)}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Collection
          </Button>
          <Button onClick={handleAddField}>
            <Plus className="mr-2 h-4 w-4" />
            Add Field
          </Button>
        </div>
      </div>

      {/* System fields info */}
      <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        <strong>System fields:</strong> Every collection automatically includes{" "}
        <code className="font-mono">id</code>,{" "}
        <code className="font-mono">created_at</code>, and{" "}
        <code className="font-mono">updated_at</code> fields. These are managed
        by the system and cannot be modified.
      </div>

      {/* Fields table */}
      <FieldsTable
        fields={fields}
        loading={loading}
        onEdit={handleEditField}
        onDelete={handleDeleteFieldClick}
      />

      {/* Field sheet */}
      <FieldSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        field={editingField}
        collections={collections}
        currentCollection={collection}
        onSubmit={handleSubmit}
        loading={saving}
      />

      {/* Delete field confirmation */}
      <AlertDialog open={deleteFieldOpen} onOpenChange={setDeleteFieldOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete field?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the{" "}
              <code className="font-mono bg-muted px-1 rounded">
                {deletingField?.name}
              </code>{" "}
              field and all its data from every record in this collection. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingFieldLoading}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteFieldConfirm}
              disabled={deletingFieldLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingFieldLoading && <Spinner className="mr-2" size="sm" />}
              {deletingFieldLoading ? "Deleting..." : "Delete Field"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete collection confirmation */}
      <AlertDialog
        open={deleteCollectionOpen}
        onOpenChange={setDeleteCollectionOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete collection?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the{" "}
              <code className="font-mono bg-muted px-1 rounded">
                {collection}
              </code>{" "}
              collection and ALL its records. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingCollection}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCollectionConfirm}
              disabled={deletingCollection}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingCollection && <Spinner className="mr-2" size="sm" />}
              {deletingCollection ? "Deleting..." : "Delete Collection"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
