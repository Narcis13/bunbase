/**
 * Sidebar component for admin layout.
 * Displays collections list with navigation and groups system vs user collections.
 */

import { useState } from "react";
import { Database, Settings, Plus, LayoutDashboard } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useCollections } from "@/hooks/useCollections";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { CreateCollectionSheet } from "@/components/schema/CreateCollectionSheet";

interface AppSidebarProps {
  currentCollection?: string;
  onNavigate: (view: { type: string; collection?: string }) => void;
  onSchemaEdit?: (collection: string) => void;
  onRefreshCollections?: () => void;
}

/**
 * AppSidebar displays navigation for the admin UI.
 * Shows Dashboard link and lists all collections grouped by type.
 *
 * @param currentCollection - Name of the currently selected collection
 * @param onNavigate - Callback for view navigation
 * @param onSchemaEdit - Callback to navigate to schema editor
 * @param onRefreshCollections - Callback to refresh collections in sidebar
 */
export function AppSidebar({
  currentCollection,
  onNavigate,
  onSchemaEdit,
  onRefreshCollections,
}: AppSidebarProps) {
  const { collections, loading, refetch } = useCollections();
  const [createOpen, setCreateOpen] = useState(false);

  // Separate system and user collections
  const systemCollections = collections.filter((c) => c.name.startsWith("_"));
  const userCollections = collections.filter((c) => !c.name.startsWith("_"));

  return (
    <Sidebar>
      <SidebarHeader className="border-b px-4 py-3">
        <span className="text-lg font-semibold">BunBase</span>
      </SidebarHeader>
      <SidebarContent>
        {/* Dashboard link */}
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => onNavigate({ type: "dashboard" })}
                isActive={!currentCollection}
              >
                <LayoutDashboard className="h-4 w-4" />
                <span>Dashboard</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        {/* User Collections */}
        <SidebarGroup>
          <SidebarGroupLabel>Collections</SidebarGroupLabel>
          <SidebarGroupContent>
            {loading ? (
              <div className="space-y-2 px-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : userCollections.length === 0 ? (
              <p className="px-4 py-2 text-sm text-muted-foreground">
                No collections yet
              </p>
            ) : (
              <SidebarMenu>
                {userCollections.map((collection) => (
                  <SidebarMenuItem key={collection.id}>
                    <div className="flex items-center group">
                      <SidebarMenuButton
                        onClick={() =>
                          onNavigate({
                            type: "collection",
                            collection: collection.name,
                          })
                        }
                        isActive={currentCollection === collection.name}
                        className="flex-1"
                      >
                        <Database className="h-4 w-4" />
                        <span className="truncate">{collection.name}</span>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {collection.recordCount}
                        </span>
                      </SidebarMenuButton>
                      {onSchemaEdit && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSchemaEdit(collection.name);
                          }}
                          title="Edit Schema"
                        >
                          <Settings className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            )}
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-2"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              New Collection
            </Button>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* System Collections */}
        {systemCollections.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>System</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {systemCollections.map((collection) => (
                  <SidebarMenuItem key={collection.id}>
                    <SidebarMenuButton
                      onClick={() =>
                        onNavigate({
                          type: "collection",
                          collection: collection.name,
                        })
                      }
                      isActive={currentCollection === collection.name}
                    >
                      <Database className="h-4 w-4" />
                      <span>{collection.name}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <CreateCollectionSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(name) => {
          // Refresh collections list in sidebar
          refetch();
          // Also call parent's refresh if provided (for consistency)
          onRefreshCollections?.();
          // Navigate to schema editor for the new collection
          if (onSchemaEdit) {
            onSchemaEdit(name);
          }
        }}
      />
    </Sidebar>
  );
}
