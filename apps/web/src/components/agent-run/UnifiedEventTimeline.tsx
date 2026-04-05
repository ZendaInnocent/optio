"use client";

import { useEffect, useRef } from "react";
import { api } from "@/lib/api-client";
import { useAgentRunEvents } from "@/hooks/use-agent-run-events";

interface UnifiedEventTimelineProps {
  runId: string;
}

export function UnifiedEventTimeline({ runId }: UnifiedEventTimelineProps) {
  const { events, loading } = useAgentRunEvents(runId);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length]);

  if (loading) {
    return <div className="p-4 text-text-muted">Loading events...</div>;
  }

  return (
    <div className="h-full overflow-auto p-4 space-y-2">
      {events.map((evt, idx) => (
        <div key={idx} className="flex gap-3 text-sm">
          <span className="text-text-muted shrink-0">[{evt.type}]</span>
          <span className="text-text">{evt.content}</span>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}
