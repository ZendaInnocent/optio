"use client";

import React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { StateBadge } from "@/components/state-badge";
import { formatRelativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

export type AgentRunSummary = {
  id: string;
  title: string;
  mode: "autonomous" | "supervised" | "interactive";
  state: string;
  agentType: string;
  repoUrl?: string;
  createdAt: string;
  updatedAt: string;
  costUsd?: string;
  initialPrompt?: string;
  model?: string;
  prUrl?: string;
};

interface AgentRunCardProps {
  run: AgentRunSummary;
}

export function AgentRunCard({ run }: AgentRunCardProps) {
  const repoName = run.repoUrl
    ? run.repoUrl.replace(/.*\/\/[^/]+\//, "").replace(/\.git$/, "")
    : "";
  const [owner, repo] = repoName.includes("/") ? repoName.split("/") : ["", repoName];

  return (
    <Link
      href={`/agent-runs/${run.id}`}
      className="block rounded-md border border-border bg-bg-card cursor-pointer overflow-hidden card-hover"
    >
      <div className="p-5">
        {/* Top row: title + badges */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-sm tracking-tight truncate">{run.title}</h3>
            {/* Metadata row */}
            <div className="flex items-center gap-1.5 mt-2 text-xs text-text-muted">
              {owner && <span className="text-text-muted/50">{owner}/</span>}
              <span>{repo}</span>
              <span className="text-text-muted/30 mx-1">&middot;</span>
              <Badge
                variant={
                  run.mode === "autonomous"
                    ? "default"
                    : run.mode === "supervised"
                      ? "secondary"
                      : "outline"
                }
                className="capitalize"
              >
                {run.mode}
              </Badge>
              {run.model && (
                <>
                  <span className="text-text-muted/30 mx-1">&middot;</span>
                  <span>{run.model}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {run.costUsd && (
              <span className="text-[10px] text-text-muted tabular-nums px-2 py-0.5 rounded-full font-medium">
                ${parseFloat(run.costUsd).toFixed(2)}
              </span>
            )}
            <StateBadge state={run.state} />
          </div>
        </div>

        {/* Truncated prompt preview */}
        {run.initialPrompt && (
          <p className="mt-3 text-xs text-text-muted/70 line-clamp-2">
            {run.initialPrompt.length > 150
              ? run.initialPrompt.slice(0, 150) + "..."
              : run.initialPrompt}
          </p>
        )}

        {/* Footer: time + PR link */}
        <div className="flex items-center justify-between mt-4 text-xs text-text-muted/60">
          <span>{formatRelativeTime(run.createdAt)}</span>
          {run.prUrl && (
            <a
              href={run.prUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              className="flex items-center gap-1 text-text-muted hover:text-text transition-colors"
            >
              PR
            </a>
          )}
        </div>
      </div>
    </Link>
  );
}
