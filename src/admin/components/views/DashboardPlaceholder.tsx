/**
 * Dashboard placeholder component.
 * Will be replaced with actual dashboard content in later plans.
 */

/**
 * DashboardPlaceholder shows a welcome message.
 * Instructs users to select a collection from the sidebar.
 */
export function DashboardPlaceholder() {
  return (
    <div className="text-center py-12">
      <h2 className="text-2xl font-semibold">Welcome to BunBase</h2>
      <p className="mt-2 text-muted-foreground">
        Select a collection from the sidebar to view records
      </p>
    </div>
  );
}
