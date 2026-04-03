"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api-client";
import { Loader2, ChevronDown, Bot, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";

export function AgentSelector({
  value,
  onChange,
  disabled = false,
  className,
}: {
  value: string;
  onChange: (agentType: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const agents = [
    { value: "claude-code", label: "Claude Code", description: "Anthropic's agent" },
    { value: "codex", label: "OpenAI Codex", description: "OpenAI's agent" },
    { value: "opencode", label: "OpenCode AI", description: "OpenCode Zen agent" },
  ];

  return (
    <div className={cn("relative", className)}>
      <label className="block text-xs text-text-muted mb-1.5">Agent</label>
      <button
        type="button"
        onClick={() => {}}
        disabled={disabled}
        className={cn(
          "w-full flex items-center justify-between px-3 py-2 rounded-lg bg-bg-card border border-border text-sm focus:outline-none focus:border-primary transition-colors",
          disabled && "opacity-50 cursor-not-allowed",
        )}
      >
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-text-muted" />
          <span>{agents.find((a) => a.value === value)?.label || value}</span>
        </div>
        <ChevronDown className="w-4 h-4 text-text-muted" />
      </button>
      {/* Dropdown could be implemented with a popover - for simplicity, using select for now */}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      >
        {agents.map((agent) => (
          <option key={agent.value} value={agent.value}>
            {agent.label} - {agent.description}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ModelSelector({
  value,
  onChange,
  disabled = false,
  className,
}: {
  value: string;
  onChange: (modelId: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [models, setModels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchModels() {
      try {
        const res = await api.getAvailableModels();
        setModels(res.models);
      } catch (err) {
        console.error("Failed to fetch models", err);
      } finally {
        setLoading(false);
      }
    }
    fetchModels();
  }, []);

  if (loading) {
    return (
      <div className={cn("flex items-center gap-2 py-2", className)}>
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm text-text-muted">Loading models...</span>
      </div>
    );
  }

  return (
    <div className={cn("relative", className)}>
      <label className="block text-xs text-text-muted mb-1.5">Model</label>
      <div className="flex items-center gap-2">
        <Bot className="w-4 h-4 text-text-muted shrink-0" />
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={cn(
            "flex-1 px-3 py-2 rounded-lg bg-bg-card border border-border text-sm focus:outline-none focus:border-primary transition-colors appearance-none",
            disabled && "opacity-50 cursor-not-allowed",
          )}
        >
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name} ({model.provider}){model.isFree ? " - Free" : " - Paid"}
            </option>
          ))}
        </select>
        <ChevronDown className="w-4 h-4 text-text-muted shrink-0 pointer-events-none" />
      </div>
    </div>
  );
}
