"use client";

import { use, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { useStore } from "@/hooks/use-store";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Hammer,
  Loader2,
  Clock,
  Package,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Copy,
} from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import { toast } from "sonner";

type BuildStatus = "pending" | "building" | "success" | "failed" | "cancelled";

const statusConfig: Record<
  BuildStatus,
  { icon: React.ReactNode; color: string; bg: string; label: string }
> = {
  pending: {
    icon: <Clock className="w-4 h-4" />,
    color: "text-text-muted",
    bg: "bg-bg",
    label: "Pending",
  },
  building: {
    icon: <Loader2 className="w-4 h-4 animate-spin" />,
    color: "text-warning",
    bg: "bg-warning/10",
    label: "Building",
  },
  success: {
    icon: <CheckCircle2 className="w-4 h-4" />,
    color: "text-success",
    bg: "bg-success/10",
    label: "Success",
  },
  failed: {
    icon: <XCircle className="w-4 h-4" />,
    color: "text-error",
    bg: "bg-error/10",
    label: "Failed",
  },
  cancelled: {
    icon: <AlertCircle className="w-4 h-4" />,
    color: "text-text-muted",
    bg: "bg-bg",
    label: "Cancelled",
  },
};

export default function BuildDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const updateBuild = useStore((state) => state.updateBuild);
  const [build, setBuild] = useState<any>(null);
  const [logs, setLogs] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    const fetchBuild = async () => {
      try {
        const res = await api.getBuildStatus(id);
        setBuild(res.build);
        if (res.build.logs) {
          setLogs(res.build.logs);
        }
      } catch {
        toast.error("Failed to load build details");
      } finally {
        setLoading(false);
      }
    };
    fetchBuild();
  }, [id]);

  const handleCancel = async () => {
    if (!confirm("Cancel this build?")) return;
    setCancelling(true);
    try {
      await api.cancelBuild(id);
      updateBuild(id, { buildStatus: "cancelled" });
      setBuild((prev: any) => ({ ...prev, status: "cancelled" }));
      toast.success("Build cancelled");
    } catch (err) {
      toast.error("Failed to cancel build", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setCancelling(false);
    }
  };

  const handleCopyLogs = () => {
    navigator.clipboard.writeText(logs);
    toast.success("Logs copied to clipboard");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...
      </div>
    );
  }

  if (!build) {
    return (
      <div className="flex items-center justify-center h-full text-error">Build not found</div>
    );
  }

  const status = build.status as BuildStatus;
  const config = statusConfig[status];
  const canCancel = status === "pending" || status === "building";

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/builds" className="p-1.5 rounded-md hover:bg-bg-hover text-text-muted">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <Hammer className="w-5 h-5 text-text-muted" />
        <h1 className="text-2xl font-semibold tracking-tight">Build Details</h1>
        <div className="flex-1" />
        <div
          className={cn("flex items-center gap-2 px-3 py-1.5 rounded-md", config.bg, config.color)}
        >
          {config.icon}
          <span className="text-sm font-medium">{config.label}</span>
        </div>
      </div>

      {/* Build info */}
      <div className="p-5 rounded-xl border border-border/50 bg-bg-card space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-text-muted text-xs">Build ID</span>
            <p className="font-mono text-xs mt-0.5">{build.id}</p>
          </div>
          <div>
            <span className="text-text-muted text-xs">Status</span>
            <p className={cn("mt-0.5 font-medium", config.color)}>{config.label}</p>
          </div>
          {build.startedAt && (
            <div>
              <span className="text-text-muted text-xs">Started</span>
              <p className="mt-0.5">{formatRelativeTime(build.startedAt)}</p>
            </div>
          )}
          {build.finishedAt && (
            <div>
              <span className="text-text-muted text-xs">Finished</span>
              <p className="mt-0.5">{formatRelativeTime(build.finishedAt)}</p>
            </div>
          )}
        </div>
        {canCancel && (
          <div className="flex justify-end pt-2 border-t border-border">
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-error/10 text-error text-xs hover:bg-error/20 disabled:opacity-50"
            >
              {cancelling ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <XCircle className="w-3.5 h-3.5" />
              )}
              {cancelling ? "Cancelling..." : "Cancel Build"}
            </button>
          </div>
        )}
      </div>

      {/* Logs */}
      <div className="rounded-xl border border-border/50 bg-bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-bg">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-text-muted" />
            <span className="text-sm font-medium">Build Logs</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="w-3.5 h-3.5 rounded"
              />
              Auto-scroll
            </label>
            <button
              onClick={handleCopyLogs}
              className="p-1.5 rounded hover:bg-bg-hover text-text-muted"
              title="Copy logs"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="relative">
          <pre
            className={cn(
              "p-4 text-xs font-mono overflow-auto max-h-[600px] leading-relaxed",
              "text-text-muted whitespace-pre-wrap break-all",
            )}
          >
            {logs || (
              <span className="text-text-muted/40">
                {status === "pending"
                  ? "Build is queued. Logs will appear once the build starts..."
                  : status === "building"
                    ? "Build in progress. Logs will appear here..."
                    : "No logs available for this build."}
              </span>
            )}
          </pre>
        </div>
      </div>
    </div>
  );
}
