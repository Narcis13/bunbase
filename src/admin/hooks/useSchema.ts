/**
 * Hook for managing schema state (fields) for a collection.
 * Provides loading, error handling, and refetch capability.
 */

import { useState, useEffect, useCallback } from "react";
import { fetchFields, type Field } from "@/lib/api";

interface UseSchemaResult {
  fields: Field[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Fetch and manage fields for a collection.
 *
 * @param collection - Collection name
 * @returns Fields array, loading state, error, and refetch function
 */
export function useSchema(collection: string): UseSchemaResult {
  const [fields, setFields] = useState<Field[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFields = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchFields(collection);
      setFields(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [collection]);

  useEffect(() => {
    loadFields();
  }, [loadFields]);

  return {
    fields,
    loading,
    error,
    refetch: loadFields,
  };
}
