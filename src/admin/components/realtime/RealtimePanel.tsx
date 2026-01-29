/**
 * Toggleable bottom debug panel for testing/observing SSE events.
 * Shows connection status, subscriptions, and a scrollable event log.
 */

import { useState } from "react";
import {
  X,
  Wifi,
  WifiOff,
  Trash2,
  Plus,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { UseRealtimeReturn } from "@/hooks/useRealtime";

interface RealtimePanelProps {
  realtime: UseRealtimeReturn;
  open: boolean;
  onClose: () => void;
}

const actionColors: Record<string, string> = {
  create: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  update: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  delete: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  } as Intl.DateTimeFormatOptions);
}

export function RealtimePanel({
  realtime,
  open,
  onClose,
}: RealtimePanelProps) {
  const [newTopic, setNewTopic] = useState("");
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);

  if (!open) return null;

  const {
    status,
    clientId,
    subscriptions,
    events,
    clearEvents,
    connect,
    disconnect,
    subscribe,
  } = realtime;

  const handleAddTopic = async () => {
    const topic = newTopic.trim();
    if (!topic) return;
    const updated = [...subscriptions, topic];
    await subscribe(updated);
    setNewTopic("");
  };

  const handleRemoveTopic = async (topic: string) => {
    const updated = subscriptions.filter((t) => t !== topic);
    await subscribe(updated);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTopic();
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background shadow-lg transition-transform">
      {/* Header bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/50">
        <span className="text-sm font-medium">Realtime</span>

        {/* Status badge */}
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
            status === "connected"
              ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
              : status === "disconnected"
                ? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
          }`}
        >
          {status}
        </span>

        {clientId && (
          <span className="text-xs text-muted-foreground font-mono">
            {clientId}
          </span>
        )}

        <div className="ml-auto flex items-center gap-1">
          {status === "disconnected" ? (
            <Button variant="ghost" size="sm" onClick={connect}>
              <Wifi className="h-3.5 w-3.5 mr-1" />
              Connect
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={disconnect}>
              <WifiOff className="h-3.5 w-3.5 mr-1" />
              Disconnect
            </Button>
          )}

          <Button variant="ghost" size="sm" onClick={clearEvents}>
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Clear
          </Button>

          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex" style={{ height: "260px" }}>
        {/* Subscriptions sidebar */}
        <div className="w-64 border-r p-3 flex flex-col gap-2 overflow-y-auto">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Subscriptions
          </div>

          {/* Current subscriptions */}
          <div className="flex flex-wrap gap-1">
            {subscriptions.map((topic) => (
              <span
                key={topic}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs"
              >
                {topic}
                <button
                  onClick={() => handleRemoveTopic(topic)}
                  className="hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {subscriptions.length === 0 && (
              <span className="text-xs text-muted-foreground italic">
                No subscriptions
              </span>
            )}
          </div>

          {/* Add subscription */}
          <div className="flex gap-1 mt-auto">
            <Input
              value={newTopic}
              onChange={(e) => setNewTopic(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="collection/*"
              className="h-7 text-xs"
            />
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={handleAddTopic}
              disabled={!newTopic.trim()}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Event log */}
        <div className="flex-1 overflow-y-auto p-2 font-mono text-xs">
          {events.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              No events yet. Subscribe to a collection to start receiving
              events.
            </div>
          ) : (
            <div className="space-y-0.5">
              {events.map((event) => {
                const isExpanded = expandedEvent === event.id;
                return (
                  <div key={event.id}>
                    <button
                      className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/50 text-left"
                      onClick={() =>
                        setExpandedEvent(isExpanded ? null : event.id)
                      }
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                      )}
                      <span className="text-muted-foreground w-20 shrink-0">
                        {formatTime(event.timestamp)}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary shrink-0">
                        {event.collection}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded shrink-0 ${actionColors[event.action] || ""}`}
                      >
                        {event.action}
                      </span>
                      <span className="text-muted-foreground truncate">
                        {(event.record.id as string) || "?"}
                      </span>
                    </button>
                    {isExpanded && (
                      <pre className="ml-7 p-2 rounded bg-muted text-xs overflow-x-auto max-h-40">
                        {JSON.stringify(event.record, null, 2)}
                      </pre>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
