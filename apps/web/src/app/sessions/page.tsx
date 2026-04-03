"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import Link from "next/link";
import { cn, formatRelativeTime, formatDuration } from "@/lib/utils";
import { Plus, Terminal, Loader2, FolderGit2, CircleDot, StopCircle, X } from "lucide-react";
import { AgentSelector, ModelSelector } from "@/components/agent-model-selector";

export default function SessionsPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active" | "ended">("all");
  const [repos, setRepos] = useState<any[]>([]);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [creating, setCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSessionAgent, setNewSessionAgent] = useState("opencode");
  const [newSessionModel, setNewSessionModel] = useState<string>("");

  useEffect(() => {
    api
      .listRepos()
      .then((res) => setRepos(res.repos))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    api
      .listSessions({
        state: filter === "all" ? undefined : filter,
        repoUrl: selectedRepo || undefined,
      })
      .then((res) => {
        setSessions(res.sessions);
        setActiveCount(res.activeCount);
      })
      .catch(() => toast.error("Failed to load sessions"))
      .finally(() => setLoading(false));
  }, [filter, selectedRepo]);

  const handleCreate = async () => {
    if (repos.length === 0) {
      toast.error("Add a repo first");
      return;
    }
    // Open modal to configure agent and model
    setShowCreateModal(true);
  };

  const handleConfirmCreate = async () => {
    const repoUrl = selectedRepo || repos[0]?.repoUrl;
    if (!repoUrl) return;
    setCreating(true);
    try {
      const res = await api.createSession({
        repoUrl,
        agentType: newSessionAgent,
        model: newSessionModel || undefined,
      });
      toast.success("Session created");
      setSessions((prev) => [res.session, ...prev]);
      setActiveCount((c) => c + 1);
      setShowCreateModal(false);
      // Navigate to the new session
      window.location.href = `/sessions/${res.session.id}`;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create session");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sessions</h1>
          <p className="text-sm text-text-muted mt-1">
            Interactive workspaces connected to repo pods
            {activeCount > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-primary">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                {activeCount} active
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {repos.length > 1 && (
            <select
              value={selectedRepo}
              onChange={(e) => setSelectedRepo(e.target.value)}
              className="px-3 py-2 rounded-lg bg-bg-card border border-border text-sm focus:outline-none focus:border-primary"
            >
              <option value="">All repos</option>
              {repos.map((r: any) => (
                <option key={r.id} value={r.repoUrl}>
                  {r.fullName}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={handleCreate}
            disabled={creating || repos.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            New Session
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-0 border-b border-border mb-6">
        {(["all", "active", "ended"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={cn(
              "px-5 py-3 text-[13px] font-medium border-b-2 transition-colors capitalize",
              filter === tab
                ? "border-primary text-text"
                : "border-transparent text-text-muted hover:text-text",
            )}
          >
            {tab}
          </button>
        ))}
      </div>
      {/* Create Session Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowCreateModal(false)} />
          <div className="relative z-10 w-full max-w-lg p-6 rounded-xl border border-border/50 bg-bg-card shadow-xl">
            <button
              onClick={() => setShowCreateModal(false)}
              className="absolute top-4 right-4 p-1 rounded-md text-text-muted hover:text-text hover:bg-bg-hover transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-semibold mb-1">New Session Configuration</h3>
            <p className="text-sm text-text-muted mb-4">
              Configure the agent and model for this interactive session.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <AgentSelector
                value={newSessionAgent}
                onChange={(agent) => setNewSessionAgent(agent)}
              />
              <div className="relative">
                <ModelSelector
                  value={newSessionModel}
                  onChange={(model) => setNewSessionModel(model)}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 mt-6 justify-end">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-bg border border-border text-text-muted hover:text-text hover:bg-bg-hover transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmCreate}
                disabled={creating}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
              >
                {creating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                Create Session
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-text-muted">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading sessions...
        </div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-16 text-text-muted border border-dashed border-border rounded-lg">
          <Terminal className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No sessions found</p>
          <p className="text-xs mt-1">
            Start a new session to get an interactive terminal connected to a repo pod.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map((session: any) => (
            <SessionCard key={session.id} session={session} />
          ))}
        </div>
      )}
    </div>
  );
}

function SessionCard({ session }: { session: any }) {
  const isActive = session.state === "active";
  const repoName = session.repoUrl ? session.repoUrl.replace("https://github.com/", "") : "Unknown";

  return (
    <Link
      href={`/sessions/${session.id}`}
      className="block p-4 rounded-lg border border-border bg-bg-card hover:border-primary/30 hover:bg-bg-hover transition-colors"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
              isActive ? "bg-primary/10 text-primary" : "bg-bg text-text-muted",
            )}
          >
            <Terminal className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate">
                {session.branch ?? `Session ${session.id.slice(0, 8)}`}
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium tracking-wide uppercase",
                  isActive ? "text-primary" : "text-text-muted",
                )}
              >
                <span
                  className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    isActive ? "bg-primary animate-pulse" : "bg-text-muted",
                  )}
                />
                {session.state}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-text-muted">
              <span className="flex items-center gap-1">
                <FolderGit2 className="w-3 h-3" />
                {repoName}
              </span>
              <span>Started {formatRelativeTime(session.createdAt)}</span>
              {isActive && (
                <span className="text-primary">{formatDuration(session.createdAt)}</span>
              )}
              {session.endedAt && (
                <span>Duration: {formatDuration(session.createdAt, session.endedAt)}</span>
              )}
            </div>
          </div>
        </div>
        {isActive && (
          <div className="shrink-0">
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary/10 text-primary text-xs font-medium">
              <CircleDot className="w-3 h-3" />
              Connect
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
