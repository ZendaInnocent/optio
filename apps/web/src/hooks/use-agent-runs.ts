"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api-client";

export type AgentRun = {
  id: string;
  title: string;
  mode: "autonomous" | "supervised" | "interactive";
  state: string;
  agentType: string;
  repoId: string;
  repoUrl?: string;
  createdAt: string;
  updatedAt: string;
  costUsd?: string;
  initialPrompt?: string;
  model?: string;
  branchName?: string;
  sessionId?: string;
  prUrl?: string;
  endedAt?: string;
};

export function useAgentRuns(params?: {
  mode?: string;
  state?: string;
  limit?: number;
  offset?: number;
}) {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listAgentRuns(params);
      setRuns(res.runs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch agent runs");
    } finally {
      setLoading(false);
    }
  }, [JSON.stringify(params)]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  return { runs, loading, error, fetchRuns };
}
