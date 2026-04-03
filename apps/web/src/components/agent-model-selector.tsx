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
      <div className="relative flex items-center">
        <Bot className="w-4 h-4 text-text-muted absolute left-3 pointer-events-none" />
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={cn(
            "w-full pl-9 pr-8 py-2 rounded-lg bg-bg border border-border text-sm text-text focus:outline-none focus:border-primary transition-colors appearance-none cursor-pointer",
            disabled && "opacity-50 cursor-not-allowed",
          )}
          style={{ colorScheme: "dark" }}
        >
          {agents.map((agent) => (
            <option key={agent.value} value={agent.value} className="bg-bg text-text">
              {agent.label} - {agent.description}
            </option>
          ))}
        </select>
        <ChevronDown className="w-4 h-4 text-text-muted absolute right-2 pointer-events-none" />
      </div>
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
      <div className={cn("relative", className)}>
        <label className="block text-xs text-text-muted mb-1.5">Model</label>
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-text-muted shrink-0" />
          <span className="text-sm text-text-muted">Loading models...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("relative", className)}>
      <label className="block text-xs text-text-muted mb-1.5">Model</label>
      <div className="flex items-center gap-2 min-w-0">
        <Bot className="w-4 h-4 text-text-muted shrink-0" />
        <div className="relative flex-1 min-w-0">
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className={cn(
              "w-full px-3 py-2 pr-8 rounded-lg bg-bg border border-border text-sm text-text focus:outline-none focus:border-primary transition-colors appearance-none truncate",
              disabled && "opacity-50 cursor-not-allowed",
            )}
            style={{ colorScheme: "dark" }}
          >
            {models.map((model) => (
              <option key={model.id} value={model.id} className="bg-bg text-text">
                {model.name} ({model.provider}){model.isFree ? " - Free" : " - Paid"}
              </option>
            ))}
          </select>
          <ChevronDown className="w-4 h-4 text-text-muted absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>
    </div>
  );
}
