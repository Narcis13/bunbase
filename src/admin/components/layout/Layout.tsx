/**
 * Main layout component for admin UI.
 * Provides sidebar navigation, header with realtime indicator, and content area.
 */

import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, User } from "lucide-react";
import { ConnectionIndicator } from "@/components/realtime/ConnectionIndicator";
import type { ConnectionStatus } from "@/hooks/useRealtime";

interface Admin {
  id: string;
  email: string;
}

interface LayoutProps {
  children: React.ReactNode;
  currentCollection?: string;
  onNavigate: (view: { type: string; collection?: string; collectionType?: "base" | "auth" }) => void;
  onSchemaEdit?: (collection: string) => void;
  onRefreshCollections?: () => void;
  admin?: Admin | null;
  onLogout?: () => void;
  realtimeStatus?: ConnectionStatus;
  onToggleRealtime?: () => void;
}

/**
 * Layout provides the main structure for the admin UI.
 * Includes sidebar navigation and main content area with header.
 */
export function Layout({
  children,
  currentCollection,
  onNavigate,
  onSchemaEdit,
  onRefreshCollections,
  admin,
  onLogout,
  realtimeStatus,
  onToggleRealtime,
}: LayoutProps) {
  return (
    <SidebarProvider>
      <AppSidebar
        currentCollection={currentCollection}
        onNavigate={onNavigate}
        onSchemaEdit={onSchemaEdit}
        onRefreshCollections={onRefreshCollections}
      />
      <SidebarInset>
        <header className="flex h-14 items-center gap-4 border-b px-4">
          <SidebarTrigger />
          <h1 className="text-lg font-semibold">
            {currentCollection || "Dashboard"}
          </h1>
          <div className="ml-auto flex items-center gap-2">
            {realtimeStatus && onToggleRealtime && (
              <ConnectionIndicator
                status={realtimeStatus}
                onClick={onToggleRealtime}
              />
            )}
            {admin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2">
                    <User className="h-4 w-4" />
                    <span className="hidden sm:inline">{admin.email}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={onLogout}
                    className="text-destructive focus:text-destructive"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </header>
        <main className="flex-1 overflow-hidden p-4">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
