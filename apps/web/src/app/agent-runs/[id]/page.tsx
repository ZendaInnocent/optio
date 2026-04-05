"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useAgentRun } from "@/hooks/use-agent-run";
import { AgentRunHeader } from "@/components/agent-run/AgentRunHeader";
import { UnifiedEventTimeline } from "@/components/agent-run/UnifiedEventTimeline";
import { ModeSwitchModal } from "@/components/agent-run/ModeSwitchModal";
import { InteractiveChatPane } from "@/components/agent-run/InteractiveChatPane";
import { TerminalPane } from "@/components/agent-run/TerminalPane";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

export default function AgentRunDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { run, loading, error, refetch } = useAgentRun(id);
  const [activeTab, setActiveTab] = useState("overview");
  const [showModeModal, setShowModeModal] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted">
        Agent run not found
      </div>
    );
  }

  const isInteractive = run.mode === "interactive";

  const handleModeSwitch = async () => {
    setShowModeModal(true);
  };

  const handleModeSwitchSuccess = () => {
    refetch();
  };

  return (
    <div className="h-full flex flex-col">
      <AgentRunHeader
        run={run}
        onModeSwitch={handleModeSwitch}
        onInterrupt={refetch}
        onEnd={refetch}
      />

      <div className="flex-1 min-h-0">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
            {isInteractive && (
              <>
                <TabsTrigger value="chat">Chat</TabsTrigger>
                <TabsTrigger value="terminal">Terminal</TabsTrigger>
              </>
            )}
          </TabsList>

          <TabsContent value="overview">
            <div className="p-6">
              <h3 className="font-semibold mb-4">Pull Requests</h3>
              {run.prUrl ? (
                <a
                  href={run.prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  View PR #{run.prNumber || ""}
                </a>
              ) : (
                <p className="text-text-muted text-sm">No PR created yet</p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="logs">
            <UnifiedEventTimeline runId={run.id} />
          </TabsContent>

          {isInteractive && (
            <TabsContent value="chat">
              <InteractiveChatPane runId={run.id} />
            </TabsContent>
          )}

          {isInteractive && (
            <TabsContent value="terminal">
              <TerminalPane runId={run.id} />
            </TabsContent>
          )}
        </Tabs>
      </div>

      <ModeSwitchModal
        open={showModeModal}
        onClose={() => setShowModeModal(false)}
        runId={run.id}
        currentMode={run.mode}
        onSuccess={handleModeSwitchSuccess}
      />
    </div>
  );
}
