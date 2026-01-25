/**
 * Admin UI root component.
 * Manages view state and authentication.
 */

import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { useAuth } from "@/hooks/useAuth";
import { LoginPage } from "@/components/views/LoginPage";
import { DashboardPlaceholder } from "@/components/views/DashboardPlaceholder";
import { CollectionPlaceholder } from "@/components/views/CollectionPlaceholder";
import { Skeleton } from "@/components/ui/skeleton";

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

  return (
    <Layout
      currentCollection={view.type === "collection" ? view.collection : undefined}
      onNavigate={handleNavigate}
    >
      {view.type === "dashboard" && <DashboardPlaceholder />}
      {view.type === "collection" && (
        <CollectionPlaceholder collection={view.collection} />
      )}
    </Layout>
  );
}
