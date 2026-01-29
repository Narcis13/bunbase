/**
 * Core SSE hook for managing realtime EventSource lifecycle,
 * subscriptions, and event dispatching.
 */

import { useState, useRef, useCallback, useEffect } from "react";

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";

export interface RealtimeEvent {
  id: string;
  timestamp: number;
  collection: string;
  action: "create" | "update" | "delete";
  record: Record<string, unknown>;
}

export interface UseRealtimeReturn {
  status: ConnectionStatus;
  clientId: string | null;
  subscribe: (topics: string[]) => Promise<void>;
  unsubscribe: () => Promise<void>;
  subscriptions: string[];
  events: RealtimeEvent[];
  clearEvents: () => void;
  connect: () => void;
  disconnect: () => void;
  onEvent: (
    collection: string,
    cb: (e: RealtimeEvent) => void
  ) => () => void;
}

const MAX_EVENTS = 100;
const VISIBILITY_TIMEOUT = 5 * 60 * 1000; // 5 minutes

async function postSubscription(
  clientId: string,
  subscriptions: string[]
): Promise<void> {
  const token = localStorage.getItem("bunbase_token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  await fetch("/api/realtime", {
    method: "POST",
    headers,
    body: JSON.stringify({ clientId, subscriptions }),
  });
}

export function useRealtime(): UseRealtimeReturn {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [clientId, setClientId] = useState<string | null>(null);
  const [subscriptions, setSubscriptions] = useState<string[]>([]);
  const [events, setEvents] = useState<RealtimeEvent[]>([]);

  const esRef = useRef<EventSource | null>(null);
  const clientIdRef = useRef<string | null>(null);
  const subsRef = useRef<string[]>([]);
  const callbacksRef = useRef<Map<string, Set<(e: RealtimeEvent) => void>>>(
    new Map()
  );
  const hiddenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasConnectedRef = useRef(false);
  const collectionListenersRef = useRef<Set<string>>(new Set());

  // Keep refs in sync
  subsRef.current = subscriptions;

  const addEvent = useCallback((event: RealtimeEvent) => {
    setEvents((prev) => [event, ...prev].slice(0, MAX_EVENTS));
    // Dispatch to callbacks
    const cbs = callbacksRef.current.get(event.collection);
    if (cbs) {
      for (const cb of cbs) {
        try {
          cb(event);
        } catch {
          // ignore callback errors
        }
      }
    }
  }, []);

  const addCollectionListener = useCallback(
    (es: EventSource, collection: string) => {
      if (collectionListenersRef.current.has(collection)) return;
      collectionListenersRef.current.add(collection);
      es.addEventListener(collection, (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          const event: RealtimeEvent = {
            id: e.lastEventId || crypto.randomUUID(),
            timestamp: Date.now(),
            collection,
            action: data.action,
            record: data.record,
          };
          addEvent(event);
        } catch {
          // ignore parse errors
        }
      });
    },
    [addEvent]
  );

  const disconnect = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    collectionListenersRef.current.clear();
    setStatus("disconnected");
    setClientId(null);
    clientIdRef.current = null;
  }, []);

  const connect = useCallback(() => {
    // Don't connect if already connected/connecting
    if (esRef.current) return;

    setStatus("connecting");
    const es = new EventSource("/api/realtime");
    esRef.current = es;

    es.addEventListener("PB_CONNECT", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        const id = data.clientId as string;
        clientIdRef.current = id;
        setClientId(id);
        setStatus("connected");

        // Re-subscribe if we had subscriptions (reconnect scenario)
        if (subsRef.current.length > 0) {
          postSubscription(id, subsRef.current).catch(() => {});
          // Re-add collection listeners
          for (const topic of subsRef.current) {
            const col = topic.split("/")[0];
            if (col) addCollectionListener(es, col);
          }
        }
      } catch {
        // ignore
      }
    });

    es.onerror = () => {
      if (esRef.current === es) {
        setStatus("reconnecting");
      }
    };
  }, [addCollectionListener]);

  const subscribe = useCallback(
    async (topics: string[]) => {
      setSubscriptions(topics);
      if (clientIdRef.current && esRef.current) {
        await postSubscription(clientIdRef.current, topics);
        // Add listeners for each collection
        for (const topic of topics) {
          const col = topic.split("/")[0];
          if (col && esRef.current) {
            addCollectionListener(esRef.current, col);
          }
        }
      }
    },
    [addCollectionListener]
  );

  const unsubscribe = useCallback(async () => {
    setSubscriptions([]);
    if (clientIdRef.current) {
      await postSubscription(clientIdRef.current, []);
    }
  }, []);

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  const onEvent = useCallback(
    (
      collection: string,
      cb: (e: RealtimeEvent) => void
    ): (() => void) => {
      if (!callbacksRef.current.has(collection)) {
        callbacksRef.current.set(collection, new Set());
      }
      callbacksRef.current.get(collection)!.add(cb);
      return () => {
        callbacksRef.current.get(collection)?.delete(cb);
      };
    },
    []
  );

  // Tab visibility: disconnect after 5min hidden, reconnect on visible
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        hiddenTimerRef.current = setTimeout(() => {
          if (esRef.current) {
            wasConnectedRef.current = true;
            disconnect();
          }
        }, VISIBILITY_TIMEOUT);
      } else {
        if (hiddenTimerRef.current) {
          clearTimeout(hiddenTimerRef.current);
          hiddenTimerRef.current = null;
        }
        if (wasConnectedRef.current && !esRef.current) {
          wasConnectedRef.current = false;
          connect();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      if (hiddenTimerRef.current) {
        clearTimeout(hiddenTimerRef.current);
      }
    };
  }, [connect, disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      collectionListenersRef.current.clear();
      callbacksRef.current.clear();
    };
  }, []);

  return {
    status,
    clientId,
    subscribe,
    unsubscribe,
    subscriptions,
    events,
    clearEvents,
    connect,
    disconnect,
    onEvent,
  };
}
