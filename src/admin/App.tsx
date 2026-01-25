/**
 * Admin UI root component.
 * Manages view state and authentication.
 */

import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { useAuth } from "@/hooks/useAuth";
import { LoginPage } from "@/components/views/LoginPage";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { RecordsView } from "@/components/records/RecordsView";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

type View = { type: "dashboard" } | { type: "collection"; collection: string };

/**
 * App is the root component for the admin UI.
 * Handles authentication state and view routing.
 */
export default function App() {
  const { loading, login, isAuthenticated } = useAuth();
  const [view, setView] = useState<View>({ type: "dashboard" });

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
    }
  };

  // Record action handlers (placeholders for now)
  const handleCreateRecord = () => {
    toast.info("Create record form coming in next plan");
  };

  const handleEditRecord = (record: Record<string, unknown>) => {
    toast.info(`Edit record ${record.id} - coming in next plan`);
  };

  const handleDeleteRecord = (record: Record<string, unknown>) => {
    toast.info(`Delete record ${record.id} - coming in next plan`);
  };

  return (
    <Layout
      currentCollection={view.type === "collection" ? view.collection : undefined}
      onNavigate={handleNavigate}
    >
      {view.type === "dashboard" && (
        <Dashboard
          onNavigateToCollection={(collection) =>
            setView({ type: "collection", collection })
          }
        />
      )}
      {view.type === "collection" && (
        <RecordsView
          collection={view.collection}
          onCreateRecord={handleCreateRecord}
          onEditRecord={handleEditRecord}
          onDeleteRecord={handleDeleteRecord}
        />
      )}
    </Layout>
  );
}
