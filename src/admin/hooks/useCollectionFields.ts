/**
 * Hook for fetching collection fields.
 * Used by RecordsTable to build dynamic columns.
 */

import { useState, useEffect } from "react";
import { fetchWithAuth } from "@/lib/api";

export interface Field {
  id: string;
  collection_id: string;
  name: string;
  type: "text" | "number" | "boolean" | "datetime" | "json" | "relation";
  required: boolean;
  options: { target?: string } | null;
  created_at: string;
}

interface UseCollectionFieldsReturn {
  fields: Field[];
  loading: boolean;
  error: string | null;
}

/**
 * Hook for fetching fields for a specific collection.
 *
 * @param collectionName - Name of the collection to fetch fields for
 * @returns Fields array, loading state, and error
 */
export function useCollectionFields(
  collectionName: string
): UseCollectionFieldsReturn {
  const [fields, setFields] = useState<Field[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchFields = async () => {
      setLoading(true);
      try {
        const response = await fetchWithAuth(
          `/_/api/collections/${collectionName}/fields`
        );
        const data = await response.json();
        setFields(data);
        setError(null);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    };

    fetchFields();
  }, [collectionName]);

  return { fields, loading, error };
}
