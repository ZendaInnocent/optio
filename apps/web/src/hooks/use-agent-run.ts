import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";

export function useAgentRun(id: string) {
  const [run, setRun] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchRun = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getAgentRun(id);
      setRun(res.run);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch run"));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      fetchRun();
    }
  }, [id, fetchRun]);

  return { run, loading, error, refetch: fetchRun };
}
