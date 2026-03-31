"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api-client";
import { useStore } from "@/hooks/use-store";
import Link from "next/link";
import {
  Hammer,
  Loader2,
  Filter,
  Clock,
  Package,
  XCircle,
  CheckCircle2,
  AlertCircle,
  Play,
} from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";

type BuildStatus = "pending" | "building" | "success" | "failed" | "cancelled";

const statusConfig: Record<BuildStatus, { icon: React.ReactNode; color: string; bg: string }> = {
  pending: {
    icon: <Clock className="w-3.5 h-3.5" />,
    color: "text-text-muted",
    bg: "bg-bg",
  },
  building: {
    icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />,
    color: "text-warning",
    bg: "bg-warning/10",
  },
  success: {
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    color: "text-success",
    bg: "bg-success/10",
  },
  failed: {
    icon: <XCircle className="w-3.5 h-3.5" />,
    color: "text-error",
    bg: "bg-error/10",
  },
  cancelled: {
    icon: <AlertCircle className="w-3.5 h-3.5" />,
    color: "text-text-muted",
    bg: "bg-bg",
  },
};

export default function BuildsPage() {
  const builds = useStore((state) => state.builds);
  const setBuilds = useStore((state) => state.setBuilds);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | BuildStatus>("all");
  const [repoFilter, setRepoFilter] = useState<string>("");
  const [repos, setRepos] = useState<Array<{ repoUrl: string }>>([]);

  useEffect(() => {
    api
      .listRepos()
      .then((res) => setRepos(res.repos))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params: { status?: string; repo?: string } = {};
    if (filter !== "all") params.status = filter;
    if (repoFilter) params.repo = repoFilter;

    api
      .listBuilds(params)
      .then((res) => {
        const mapped = res.builds.map((b) => ({
          id: b.id,
          repoUrl: b.repoUrl,
          imageTag: b.imageTag,
          agentTypes: b.agentTypes,
          languagePreset: b.languagePreset,
          buildStatus: b.buildStatus as BuildStatus,
          builtAt: b.builtAt,
          createdAt: b.createdAt,
        }));
        setBuilds(mapped);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filter, repoFilter, setBuilds]);

  const filteredBuilds = builds.filter((b) => {
    if (filter !== "all" && b.buildStatus !== filter) return false;
    if (repoFilter && b.repoUrl !== repoFilter) return false;
    return true;
  });

  if (loading && builds.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Hammer className="w-6 h-6 text-primary" />
            Image Builds
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Monitor build progress and view build history
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <Filter className="w-3.5 h-3.5" />
          <span>Status:</span>
        </div>
        {(["all", "pending", "building", "success", "failed", "cancelled"] as const).map(
          (status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                filter === status
                  ? "bg-primary text-white"
                  : "bg-bg border border-border text-text-muted hover:border-text-muted",
              )}
            >
              {status === "all" ? "All" : status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ),
        )}
        {repos.length > 0 && (
          <>
            <div className="w-px h-4 bg-border mx-2" />
            <select
              value={repoFilter}
              onChange={(e) => setRepoFilter(e.target.value)}
              className="text-xs px-2 py-1 rounded border border-border bg-bg focus:outline-none focus:border-primary"
            >
              <option value="">All repos</option>
              {repos.map((r) => (
                <option key={r.repoUrl} value={r.repoUrl}>
                  {r.repoUrl.replace("https://github.com/", "")}
                </option>
              ))}
            </select>
            {repoFilter && (
              <button
                onClick={() => setRepoFilter("")}
                className="p-1 rounded hover:bg-bg-hover text-text-muted"
              >
                <XCircle className="w-3.5 h-3.5" />
              </button>
            )}
          </>
        )}
      </div>

      {/* Build list */}
      {filteredBuilds.length === 0 ? (
        <div className="p-8 rounded-xl border border-border/50 bg-bg-card text-center">
          <Hammer className="w-8 h-8 text-text-muted mx-auto mb-3" />
          <p className="text-sm text-text-muted">No builds found</p>
          <p className="text-xs text-text-muted/60 mt-1">
            Trigger a build from the repository settings page
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredBuilds.map((build) => {
            const config = statusConfig[build.buildStatus];
            const repoName = build.repoUrl
              ? build.repoUrl.replace("https://github.com/", "")
              : "Workspace-wide";

            return (
              <Link
                key={build.id}
                href={`/builds/${build.id}`}
                className="block p-4 rounded-xl border border-border/50 bg-bg-card hover:border-primary/30 transition-colors"
              >
                <div className="flex items-start gap-4">
                  {/* Status icon */}
                  <div className={cn("mt-0.5 p-1.5 rounded-md shrink-0", config.bg, config.color)}>
                    {config.icon}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium truncate">{repoName}</span>
                      <span
                        className={cn(
                          "px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide",
                          config.bg,
                          config.color,
                        )}
                      >
                        {build.buildStatus}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-text-muted">
                      <span className="flex items-center gap-1">
                        <Package className="w-3 h-3" />
                        {build.imageTag}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatRelativeTime(build.createdAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      {build.agentTypes.map((agent) => (
                        <span
                          key={agent}
                          className="px-1.5 py-0.5 rounded bg-bg border border-border text-[10px] text-text-muted"
                        >
                          {agent}
                        </span>
                      ))}
                      <span className="px-1.5 py-0.5 rounded bg-bg border border-border text-[10px] text-text-muted">
                        {build.languagePreset}
                      </span>
                    </div>
                  </div>

                  {/* Arrow */}
                  <div className="text-text-muted/40 shrink-0">
                    <Play className="w-3.5 h-3.5" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
