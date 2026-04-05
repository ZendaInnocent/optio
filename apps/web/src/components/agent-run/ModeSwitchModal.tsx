"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { toast } from "sonner";

interface ModeSwitchModalProps {
  open: boolean;
  onClose: () => void;
  runId: string;
  currentMode: string;
  onSuccess: () => void;
}

export function ModeSwitchModal({
  open,
  onClose,
  runId,
  currentMode,
  onSuccess,
}: ModeSwitchModalProps) {
  const [selectedMode, setSelectedMode] = useState(currentMode);
  const [loading, setLoading] = useState(false);

  const handleSwitch = async () => {
    if (selectedMode === currentMode) {
      onClose();
      return;
    }
    setLoading(true);
    try {
      await api.switchAgentRunMode(runId, selectedMode);
      toast.success(`Mode switched to ${selectedMode}`);
      onSuccess();
      onClose();
    } catch {
      toast.error("Failed to switch mode");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-bg-card border border-border rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl">
        <h3 className="font-semibold text-sm mb-4">Switch Run Mode</h3>
        <div className="space-y-3 mb-4">
          {(["autonomous", "supervised", "interactive"] as const).map((mode) => (
            <label
              key={mode}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                selectedMode === mode
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/30"
              }`}
            >
              <input
                type="radio"
                name="mode"
                value={mode}
                checked={selectedMode === mode}
                onChange={(e) => setSelectedMode(e.target.value as typeof currentMode)}
                className="accent-primary"
              />
              <span className="capitalize text-sm">{mode}</span>
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-2 text-xs font-medium rounded-lg border border-border text-text-muted hover:text-text transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSwitch}
            disabled={loading || selectedMode === currentMode}
            className="px-3 py-2 text-xs font-medium rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Switching..." : "Switch"}
          </button>
        </div>
      </div>
    </div>
  );
}
