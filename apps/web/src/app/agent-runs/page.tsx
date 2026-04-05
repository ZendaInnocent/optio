"use client";

import { useState } from "react";
import { useAgentRuns, type AgentRun } from "@/hooks/use-agent-runs";
import { AgentRunFilterBar } from "@/components/AgentRunFilterBar";
import { AgentRunCard, type AgentRunSummary } from "@/components/agent-run/AgentRunCard";
import { usePageTitle } from "@/hooks/use-page-title";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export default function AgentRunsPage() {
  usePageTitle("Agent Runs");
  const [mode, setMode] = useState("");
  const [state, setState] = useState("");

  const { runs, loading, error, fetchRuns } = useAgentRuns({
    mode: mode || undefined,
    state: state || undefined,
  });

  const handleFilterChange = (filters: { mode?: string; state?: string }) => {
    if (filters.mode !== undefined) setMode(filters.mode);
    if (filters.state !== undefined) setState(filters.state);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex flex-col gap-3 mb-8 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Agent Runs</h1>
      </div>

      <AgentRunFilterBar mode={mode} state={state} onFilterChange={handleFilterChange} />

      {loading ? (
        <div className="flex items-center justify-center py-16 text-text-muted">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading agent runs...
        </div>
      ) : error ? (
        <div className="text-center py-12 text-text-muted border border-dashed border-border rounded-lg">
          <p className="text-sm font-medium">Error loading agent runs</p>
          <p className="text-xs mt-1 text-text-muted">{error}</p>
        </div>
      ) : runs.length === 0 ? (
        <div className="text-center py-12 text-text-muted border border-dashed border-border rounded-lg">
          <p>No agent runs found</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {runs.map((run: AgentRun) => (
            <AgentRunCard key={run.id} run={run as AgentRunSummary} />
          ))}
        </div>
      )}
    </div>
  );
}
