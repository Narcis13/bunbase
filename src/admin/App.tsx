/**
 * Admin UI root component.
 * Manages view state and authentication.
 */

import { useState, useRef, useCallback } from "react";
import { Layout } from "@/components/layout/Layout";
import { useAuth } from "@/hooks/useAuth";
import { LoginPage } from "@/components/views/LoginPage";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { RecordsView } from "@/components/records/RecordsView";
import { SchemaView } from "@/components/schema/SchemaView";
import { Skeleton } from "@/components/ui/skeleton";

type View =
  | { type: "dashboard" }
  | { type: "collection"; collection: string }
  | { type: "schema"; collection: string };

/**
 * App is the root component for the admin UI.
 * Handles authentication state and view routing.
 */
export default function App() {
  const { loading, login, isAuthenticated } = useAuth();
  const [view, setView] = useState<View>({ type: "dashboard" });

  // Ref to hold the current refetch function from sidebar
  const refreshCollectionsRef = useRef<(() => void) | null>(null);

  // Callback to trigger sidebar refresh
  const handleRefreshCollections = useCallback(() => {
    refreshCollectionsRef.current?.();
  }, []);

  // Show loading state while checking auth
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Skeleton className="h-8 w-32" />
      </div>
    );
  }

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return <LoginPage onLogin={login} />;
  }

  const handleNavigate = (newView: { type: string; collection?: string }) => {
    if (newView.type === "dashboard") {
      setView({ type: "dashboard" });
    } else if (newView.type === "collection" && newView.collection) {
      setView({ type: "collection", collection: newView.collection });
    } else if (newView.type === "schema" && newView.collection) {
      setView({ type: "schema", collection: newView.collection });
    }
  };

  const handleSchemaEdit = (collection: string) => {
    setView({ type: "schema", collection });
  };

  return (
    <Layout
      currentCollection={
        view.type === "collection"
          ? view.collection
          : view.type === "schema"
            ? view.collection
            : undefined
      }
      onNavigate={handleNavigate}
      onSchemaEdit={handleSchemaEdit}
      onRefreshCollections={handleRefreshCollections}
    >
      {view.type === "dashboard" && (
        <Dashboard
          onNavigateToCollection={(collection) =>
            setView({ type: "collection", collection })
          }
        />
      )}
      {view.type === "collection" && (
        <RecordsView collection={view.collection} />
      )}
      {view.type === "schema" && (
        <SchemaView
          collection={view.collection}
          onBack={() => setView({ type: "collection", collection: view.collection })}
          onCollectionDeleted={() => {
            handleRefreshCollections();
            setView({ type: "dashboard" });
          }}
          onRefreshCollections={handleRefreshCollections}
        />
      )}
    </Layout>
  );
}
