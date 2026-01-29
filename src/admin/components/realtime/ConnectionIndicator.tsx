/**
 * Small header component showing SSE connection status.
 * Colored dot with tooltip; clickable to toggle the Realtime Panel.
 */

import type { ConnectionStatus } from "@/hooks/useRealtime";

interface ConnectionIndicatorProps {
  status: ConnectionStatus;
  onClick: () => void;
}

const statusConfig: Record<
  ConnectionStatus,
  { color: string; pulse: boolean; label: string }
> = {
  connected: { color: "bg-green-500", pulse: false, label: "Connected" },
  connecting: { color: "bg-yellow-500", pulse: true, label: "Connecting" },
  reconnecting: {
    color: "bg-yellow-500",
    pulse: true,
    label: "Reconnecting",
  },
  disconnected: { color: "bg-gray-400", pulse: false, label: "Disconnected" },
};

export function ConnectionIndicator({
  status,
  onClick,
}: ConnectionIndicatorProps) {
  const config = statusConfig[status];

  return (
    <button
      onClick={onClick}
      className="relative flex items-center gap-1.5 px-2 py-1 rounded hover:bg-muted transition-colors"
      title={`Realtime: ${config.label}`}
    >
      <span className="relative flex h-2.5 w-2.5">
        {config.pulse && (
          <span
            className={`absolute inline-flex h-full w-full rounded-full ${config.color} opacity-75 animate-ping`}
          />
        )}
        <span
          className={`relative inline-flex rounded-full h-2.5 w-2.5 ${config.color}`}
        />
      </span>
      <span className="text-xs text-muted-foreground hidden sm:inline">
        SSE
      </span>
    </button>
  );
}
