"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface AgentRunHeaderProps {
  run: any;
  onModeSwitch?: () => void;
  onInterrupt?: () => void;
  onEnd?: () => void;
}

export function AgentRunHeader({ run, onModeSwitch, onInterrupt, onEnd }: AgentRunHeaderProps) {
  const [loading, setLoading] = useState(false);

  const isInteractive = run.mode === "interactive";
  const isActive = run.state === "running" || run.state === "needs_attention";

  const handleEnd = async () => {
    if (!confirm("Are you sure you want to end this run?")) return;
    setLoading(true);
    try {
      await api.endAgentRun(run.id);
      onEnd?.();
      toast.success("Run ended");
    } catch {
      toast.error("Failed to end run");
    } finally {
      setLoading(false);
    }
  };

  const handleInterrupt = async () => {
    setLoading(true);
    try {
      await api.interruptAgentRun(run.id);
      onInterrupt?.();
      toast.success("Run interrupted");
    } catch {
      toast.error("Failed to interrupt run");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-bg">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{run.title}</h1>
          <div className="flex items-center gap-3 mt-1 text-xs text-text-muted">
            <Badge variant="outline" className="capitalize">
              {run.mode}
            </Badge>
            <span className="capitalize">{run.state}</span>
            <span>{run.agentType}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {isActive && !isInteractive && (
          <button
            onClick={handleInterrupt}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-text-muted hover:text-text hover:border-primary/50 disabled:opacity-50"
          >
            Interrupt
          </button>
        )}

        {isInteractive && (
          <button
            onClick={handleEnd}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-text-muted hover:text-error hover:border-error/50 disabled:opacity-50"
          >
            End
          </button>
        )}

        {run.state !== "completed" && run.state !== "failed" && run.state !== "cancelled" && (
          <button
            onClick={onModeSwitch}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-white hover:bg-primary/90"
          >
            Switch Mode
          </button>
        )}
      </div>
    </div>
  );
}
