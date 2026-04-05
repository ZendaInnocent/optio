"use client";

import React from "react";
import { cn } from "@/lib/utils";

const MODE_OPTIONS = [
  { value: "", label: "All modes" },
  { value: "autonomous", label: "Autonomous" },
  { value: "supervised", label: "Supervised" },
  { value: "interactive", label: "Interactive" },
];

const STATE_OPTIONS = [
  { value: "", label: "All states" },
  { value: "pending", label: "Pending" },
  { value: "queued", label: "Queued" },
  { value: "provisioning", label: "Setup" },
  { value: "running", label: "Running" },
  { value: "needs_attention", label: "Needs Attention" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
];

export function AgentRunFilterBar({
  mode = "",
  state = "",
  onFilterChange,
}: {
  mode: string;
  state: string;
  onFilterChange: (filters: { mode?: string; state?: string }) => void;
}) {
  const handleModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onFilterChange({ mode: e.target.value, state });
  };

  const handleStateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onFilterChange({ mode, state: e.target.value });
  };

  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="flex items-center gap-1.5">
        <label className="text-xs text-text-muted">Mode:</label>
        <select
          value={mode}
          onChange={handleModeChange}
          className="px-2 py-1.5 rounded-md text-[13px] font-medium bg-bg-card border border-border text-text cursor-pointer focus:outline-none focus:border-primary transition-colors"
        >
          {MODE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-1.5">
        <label className="text-xs text-text-muted">State:</label>
        <select
          value={state}
          onChange={handleStateChange}
          className="px-2 py-1.5 rounded-md text-[13px] font-medium bg-bg-card border border-border text-text cursor-pointer focus:outline-none focus:border-primary transition-colors"
        >
          {STATE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
