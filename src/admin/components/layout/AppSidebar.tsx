/**
 * Sidebar component for admin layout.
 * Displays collections list with navigation and groups system vs user collections.
 */

import { Database, LayoutDashboard } from "lucide-react";
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

interface AppSidebarProps {
  currentCollection?: string;
  onNavigate: (view: { type: string; collection?: string }) => void;
}

/**
 * AppSidebar displays navigation for the admin UI.
 * Shows Dashboard link and lists all collections grouped by type.
 *
 * @param currentCollection - Name of the currently selected collection
 * @param onNavigate - Callback for view navigation
 */
export function AppSidebar({ currentCollection, onNavigate }: AppSidebarProps) {
  const { collections, loading } = useCollections();

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
                      <span className="ml-auto text-xs text-muted-foreground">
                        {collection.recordCount}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            )}
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
    </Sidebar>
  );
}
