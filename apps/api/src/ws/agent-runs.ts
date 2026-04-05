import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { agentRunEvents } from "../db/schema/agent-run-events.js";
import {
  getAgentRun,
  transitionState,
  switchMode,
  recordEvent,
} from "../services/agent-run-service.js";
import { getAdapter } from "@optio/agent-adapters";
import { getRuntime } from "../services/container-service.js";
import { authenticateWs } from "./ws-auth.js";
import { logger } from "../logger.js";

export async function registerAgentRunWebSocket(fastify: FastifyInstance) {
  fastify.get("/ws/agent-runs/:runId", { websocket: true }, async (ws, request) => {
    const { runId } = request.params as { runId: string };
    const log = logger.child({ runId, ws: "agent-runs" });

    // Authenticate
    const authUser = await authenticateWs(ws, request);
    if (!authUser) return;
    (request as any).user = authUser;

    // Load agent run via service
    const run = await getAgentRun(runId);
    if (!run) {
      ws.send(JSON.stringify({ type: "error", message: "Agent run not found" }));
      ws.close();
      return;
    }

    const isInteractive = (run.mode as string) === "interactive";

    // Start polling for events
    let lastEventId = 0n;
    const pollInterval = setInterval(async () => {
      try {
        const events = await db
          .select()
          .from(agentRunEvents)
          .where(eq(agentRunEvents.agentRunId, runId))
          .orderBy(agentRunEvents.id);

        for (const event of events) {
          if (event.id > lastEventId) {
            ws.send(
              JSON.stringify({
                type: "event",
                event: {
                  id: event.id,
                  type: event.type,
                  content: event.content,
                  timestamp: event.timestamp,
                  turn: event.turn,
                },
              }),
            );
            lastEventId = event.id;
          }
        }

        // Check terminal state
        const current = await getAgentRun(runId);
        if (!current || ["completed", "failed", "cancelled"].includes(current.state)) {
          clearInterval(pollInterval);
          ws.close();
        }
      } catch (err) {
        log.error({ err }, "Poll error");
      }
    }, 1000);

    // Message handling
    ws.on("message", async (raw: Buffer | string) => {
      const str = typeof raw === "string" ? raw : raw.toString("utf-8");
      let msg: { type: string; content?: string; mode?: string };
      try {
        msg = JSON.parse(str);
      } catch {
        ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
        return;
      }

      switch (msg.type) {
        case "message":
          if (!isInteractive) {
            ws.send(
              JSON.stringify({ type: "error", message: "Cannot send messages in this mode" }),
            );
            return;
          }
          if (!msg.content?.trim()) {
            ws.send(JSON.stringify({ type: "error", message: "Empty message" }));
            return;
          }
          await handleInteractiveMessage(run, msg.content, ws);
          break;

        case "interrupt":
          try {
            await transitionState(runId, "needs_attention");
            ws.send(JSON.stringify({ type: "state_changed", state: "needs_attention" }));
          } catch {
            ws.send(JSON.stringify({ type: "error", message: "Failed to interrupt" }));
          }
          break;

        case "mode_switch":
          if (!msg.mode || !["interactive", "supervised", "autonomous"].includes(msg.mode)) {
            ws.send(JSON.stringify({ type: "error", message: "Invalid mode" }));
            return;
          }
          try {
            await switchMode(runId, msg.mode as any);
            ws.send(JSON.stringify({ type: "mode_changed", mode: msg.mode }));
          } catch {
            ws.send(JSON.stringify({ type: "error", message: "Failed to switch mode" }));
          }
          break;

        case "end":
          try {
            await transitionState(runId, "completed");
            clearInterval(pollInterval);
            ws.close();
          } catch {
            ws.send(JSON.stringify({ type: "error", message: "Failed to end run" }));
          }
          break;

        case "terminal_input":
          ws.send(JSON.stringify({ type: "ack", message: "Not implemented" }));
          break;

        default:
          ws.send(JSON.stringify({ type: "error", message: `Unknown type: ${msg.type}` }));
      }
    });

    ws.on("close", () => clearInterval(pollInterval));
    ws.on("error", (err: any) => log.error({ err }, "WebSocket error"));
  });
}

async function handleInteractiveMessage(run: any, content: string, ws: any) {
  const log = logger.child({ runId: run.id });
  try {
    const adapter = getAdapter(run.agentType);
    const rt = getRuntime();
    const handle: any = { id: run.id, name: run.podName || run.id };
    const worktree = run.worktreePath || "/workspace/repo";

    // Build prompt with context
    const prompt = `Continue: ${run.title}\n${run.initialPrompt || ""}\nUser: ${content}`;

    const execCmd = adapter.getExecCommand(prompt, run.model || undefined, {});
    const script = [
      "set -e",
      `cd "${worktree}"`,
      `${execCmd.command} ${execCmd.args.join(" ")}`,
    ].join("\n");

    const execSession = await rt.exec(handle, ["bash", "-c", script], { tty: false });

    let buffer = "";
    execSession.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const { entries } = adapter.parseEvent(line, run.id);
        for (const entry of entries) {
          ws.send(JSON.stringify({ type: "event", event: entry }));
        }
      }
    });

    execSession.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (text)
        ws.send(
          JSON.stringify({
            type: "event",
            event: { type: "error", content: text, timestamp: new Date().toISOString() },
          }),
        );
    });

    await new Promise<void>((resolve) => {
      execSession.stdout.on("end", () => {
        if (buffer.trim()) {
          const { entries } = adapter.parseEvent(buffer, run.id);
          for (const entry of entries) ws.send(JSON.stringify({ type: "event", event: entry }));
        }
        resolve();
      });
    });

    ws.send(JSON.stringify({ type: "status", status: "idle" }));
  } catch (err) {
    log.error({ err }, "Interactive message failed");
    ws.send(JSON.stringify({ type: "error", message: "Execution failed" }));
    ws.send(JSON.stringify({ type: "status", status: "error" }));
  }
}
