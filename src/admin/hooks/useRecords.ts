/**
 * Hook for fetching paginated records from a collection.
 * Supports pagination with page and perPage options.
 */

import { useState, useEffect, useCallback } from "react";
import { fetchWithAuth } from "@/lib/api";

interface RecordsResponse {
  items: Record<string, unknown>[];
  totalItems: number;
}

interface UseRecordsOptions {
  page?: number;
  perPage?: number;
}

interface UseRecordsReturn {
  records: Record<string, unknown>[];
  totalItems: number;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook for fetching paginated records from a collection.
 *
 * @param collectionName - Name of the collection to fetch records from
 * @param options - Pagination options (page, perPage)
 * @returns Records array, total count, loading state, error, and refetch function
 */
export function useRecords(
  collectionName: string,
  options: UseRecordsOptions = {}
): UseRecordsReturn {
  const { page = 1, perPage = 30 } = options;

  const [records, setRecords] = useState<Record<string, unknown>[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        perPage: String(perPage),
      });
      const response = await fetchWithAuth(
        `/api/collections/${collectionName}/records?${params}`
      );
      const data: RecordsResponse = await response.json();
      setRecords(data.items);
      setTotalItems(data.totalItems);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      setRecords([]);
      setTotalItems(0);
    } finally {
      setLoading(false);
    }
  }, [collectionName, page, perPage]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  return { records, totalItems, loading, error, refetch: fetchRecords };
}
