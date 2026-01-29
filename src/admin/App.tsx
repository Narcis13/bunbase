/**
 * Admin UI root component.
 * Manages view state, authentication, and realtime SSE integration.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import { useAuth } from "@/hooks/useAuth";
import { LoginPage } from "@/components/views/LoginPage";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { RecordsView } from "@/components/records/RecordsView";
import { AuthUsersView } from "@/components/auth/AuthUsersView";
import { SchemaView } from "@/components/schema/SchemaView";
import { Skeleton } from "@/components/ui/skeleton";
import {
  RealtimeProvider,
  useRealtimeContext,
} from "@/contexts/RealtimeContext";
import { RealtimePanel } from "@/components/realtime/RealtimePanel";

type View =
  | { type: "dashboard" }
  | { type: "collection"; collection: string; collectionType?: "base" | "auth" }
  | { type: "schema"; collection: string };

/**
 * Inner app component that uses the realtime context.
 */
function AppInner() {
  const { loading, login, logout, isAuthenticated, admin } = useAuth();
  const [view, setView] = useState<View>({ type: "dashboard" });
  const [realtimePanelOpen, setRealtimePanelOpen] = useState(false);

  const realtime = useRealtimeContext();

  // Ref to hold the current refetch function from sidebar
  const refreshCollectionsRef = useRef<(() => void) | null>(null);

  // Callback to trigger sidebar refresh
  const handleRefreshCollections = useCallback(() => {
    refreshCollectionsRef.current?.();
  }, []);

  // Auto-connect when viewing a collection or when panel is open
  useEffect(() => {
    if (!isAuthenticated) return;
    const shouldConnect =
      view.type === "collection" || realtimePanelOpen;
    if (shouldConnect && realtime.status === "disconnected") {
      realtime.connect();
    }
  }, [
    view.type,
    realtimePanelOpen,
    isAuthenticated,
    realtime.status,
    realtime.connect,
  ]);

  // Auto-subscribe to current collection
  useEffect(() => {
    if (realtime.status !== "connected") return;
    if (view.type === "collection") {
      const topic = `${view.collection}/*`;
      // Only update if the collection topic isn't already in subscriptions
      if (!realtime.subscriptions.includes(topic)) {
        // Replace any previous auto-subscription with the new one,
        // but keep manually-added topics from the panel
        const manualTopics = realtime.subscriptions.filter(
          (t) => !t.endsWith("/*") || t === topic
        );
        if (!manualTopics.includes(topic)) {
          manualTopics.push(topic);
        }
        realtime.subscribe(manualTopics);
      }
    }
  }, [
    view.type,
    view.type === "collection" ? (view as { collection: string }).collection : null,
    realtime.status,
  ]);

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

  const handleNavigate = (newView: { type: string; collection?: string; collectionType?: "base" | "auth" }) => {
    if (newView.type === "dashboard") {
      setView({ type: "dashboard" });
    } else if (newView.type === "collection" && newView.collection) {
      setView({ type: "collection", collection: newView.collection, collectionType: newView.collectionType });
    } else if (newView.type === "schema" && newView.collection) {
      setView({ type: "schema", collection: newView.collection });
    }
  };

  const handleSchemaEdit = (collection: string) => {
    setView({ type: "schema", collection });
  };

  const toggleRealtimePanel = () => {
    setRealtimePanelOpen((prev) => !prev);
  };

  return (
    <>
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
        admin={admin}
        onLogout={logout}
        realtimeStatus={realtime.status}
        onToggleRealtime={toggleRealtimePanel}
      >
        {view.type === "dashboard" && (
          <Dashboard
            onNavigateToCollection={(collection) =>
              setView({ type: "collection", collection })
            }
          />
        )}
        {view.type === "collection" && view.collectionType === "auth" && (
          <AuthUsersView collection={view.collection} />
        )}
        {view.type === "collection" && view.collectionType !== "auth" && (
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

      <RealtimePanel
        realtime={realtime}
        open={realtimePanelOpen}
        onClose={() => setRealtimePanelOpen(false)}
      />
    </>
  );
}

/**
 * App is the root component for the admin UI.
 * Wraps AppInner with RealtimeProvider.
 */
export default function App() {
  return (
    <RealtimeProvider>
      <AppInner />
    </RealtimeProvider>
  );
}
