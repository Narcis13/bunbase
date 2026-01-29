/**
 * Shared realtime context so multiple components share one SSE connection.
 */

import { createContext, useContext } from "react";
import { useRealtime, type UseRealtimeReturn } from "@/hooks/useRealtime";

const RealtimeContext = createContext<UseRealtimeReturn | null>(null);

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const realtime = useRealtime();
  return (
    <RealtimeContext.Provider value={realtime}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtimeContext(): UseRealtimeReturn {
  const ctx = useContext(RealtimeContext);
  if (!ctx) {
    throw new Error("useRealtimeContext must be used within RealtimeProvider");
  }
  return ctx;
}
