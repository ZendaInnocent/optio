import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";

export function useAgentRunEvents(id: string) {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getAgentRunEvents(id);
      setEvents(res.events);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch events"));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      fetchEvents();
    }
  }, [id, fetchEvents]);

  return { events, loading, error, refetch: fetchEvents };
}
