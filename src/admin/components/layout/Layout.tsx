/**
 * Main layout component for admin UI.
 * Provides sidebar navigation and content area.
 */

import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";

interface LayoutProps {
  children: React.ReactNode;
  currentCollection?: string;
  onNavigate: (view: { type: string; collection?: string }) => void;
}

/**
 * Layout provides the main structure for the admin UI.
 * Includes sidebar navigation and main content area with header.
 *
 * @param children - Content to render in the main area
 * @param currentCollection - Name of the currently selected collection
 * @param onNavigate - Callback for view navigation
 */
export function Layout({ children, currentCollection, onNavigate }: LayoutProps) {
  return (
    <SidebarProvider>
      <AppSidebar currentCollection={currentCollection} onNavigate={onNavigate} />
      <SidebarInset>
        <header className="flex h-14 items-center gap-4 border-b px-4">
          <SidebarTrigger />
          <h1 className="text-lg font-semibold">
            {currentCollection || "Dashboard"}
          </h1>
        </header>
        <main className="flex-1 p-4">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
