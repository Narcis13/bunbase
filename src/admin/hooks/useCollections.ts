/**
 * Collections fetcher hook for admin UI.
 * Fetches all collections with field and record counts.
 */

import { useState, useEffect, useCallback } from "react";
import { fetchWithAuth } from "@/lib/api";

interface Collection {
  id: string;
  name: string;
  type: "base" | "auth";
  fieldCount: number;
  recordCount: number;
  created_at: string;
  updated_at: string;
}

interface UseCollectionsReturn {
  collections: Collection[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook for fetching collections from the API.
 * Automatically fetches on mount and provides refetch function.
 *
 * @returns Collections data, loading state, error, and refetch function
 */
export function useCollections(): UseCollectionsReturn {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchWithAuth("/_/api/collections");
      const data = await response.json();
      setCollections(data);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { collections, loading, error, refetch };
}
