import type { FastifyInstance } from "fastify";
import { getRuntime } from "../services/container-service.js";
import { getSession, addSessionPr } from "../services/interactive-session-service.js";
import { db } from "../db/client.js";
import { repoPods } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { logger } from "../logger.js";
import type { ContainerHandle, ExecSession } from "@optio/shared";
import { authenticateWs } from "./ws-auth.js";

const PR_URL_REGEX = /https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/g;

export async function sessionTerminalWs(app: FastifyInstance) {
  app.get("/ws/sessions/:sessionId/terminal", { websocket: true }, async (socket, req) => {
    const { sessionId } = req.params as { sessionId: string };
    const log = logger.child({ sessionId });

    // Authenticate the WebSocket connection
    const user = await authenticateWs(socket, req);
    if (!user) return;

    const session = await getSession(sessionId);
    if (!session) {
      socket.send(JSON.stringify({ error: "Session not found" }));
      socket.close();
      return;
    }

    // Ownership check: if session has a userId, it must match the authenticated user
    if (session.userId && session.userId !== user.id) {
      socket.send(JSON.stringify({ error: "Unauthorized: you do not own this session" }));
      socket.close();
      return;
    }

    if (session.state !== "active") {
      socket.send(JSON.stringify({ error: "Session is not active" }));
      socket.close();
      return;
    }

    if (!session.podId) {
      socket.send(JSON.stringify({ error: "Session has no pod assigned" }));
      socket.close();
      return;
    }

    // Get pod info
    const [pod] = await db.select().from(repoPods).where(eq(repoPods.id, session.podId));
    if (!pod || !pod.podName) {
      socket.send(JSON.stringify({ error: "Pod not found or not ready" }));
      socket.close();
      return;
    }

    const rt = getRuntime();
    const handle: ContainerHandle = { id: pod.podId ?? pod.podName, name: pod.podName };

    // Verify pod container is actually running before attempting exec
    try {
      const status = await rt.status(handle);
      if (status.state !== "running") {
        const message = `Pod is not running (state: ${status.state})${status.reason ? `: ${status.reason}` : ""}`;
        socket.send(JSON.stringify({ error: message }));
        socket.close();
        return;
      }
    } catch (err) {
      log.error({ err }, "Failed to check pod status");
      socket.send(JSON.stringify({ error: "Failed to check pod status" }));
      socket.close();
      return;
    }

    // Set up worktree and launch shell
    const worktreePath = session.worktreePath ?? "/workspace/repo";
    const branch = session.branch;
    const repoUrl = session.repoUrl;

    const setupScript = [
      "set -e",
      // Wait for repo to be ready
      "for i in $(seq 1 60); do [ -f /workspace/.ready ] && break; sleep 1; done",
      '[ -f /workspace/.ready ] || { echo "Repo not ready"; exit 1; }',
      // Create worktree parent directory if it doesn't exist
      `mkdir -p "$(dirname "${worktreePath}")"`,
      // Acquire repo lock for worktree setup
      "exec 9>/workspace/.repo-lock",
      "flock 9",
      "cd /workspace/repo",
      "git fetch origin 2>/dev/null || true",
      // Create worktree if not exists
      `if [ ! -d "${worktreePath}" ]; then`,
      `  git branch -D "${branch}" 2>/dev/null || true`,
      `  git worktree add "${worktreePath}" -b "${branch}" origin/$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null || echo main) 2>/dev/null || git worktree add "${worktreePath}" -b "${branch}" HEAD || {`,
      `    echo "ERROR: Failed to create worktree at ${worktreePath}"; exit 1; }`,
      `fi`,
      `[ -d "${worktreePath}" ] || { echo "ERROR: Worktree not created at ${worktreePath}"; exit 1; }`,
      "flock -u 9",
      "exec 9>&-",
      // Launch interactive shell in worktree (non-login to avoid .bashrc env var dump)
      `cd "${worktreePath}"`,
      "exec bash",
    ].join("\n");

    let execSession: ExecSession | null = null;
    const detectedPrs = new Set<number>();

    // Scan a chunk of terminal output for GitHub PR URLs and register them
    const scanForPrUrls = (chunk: Buffer) => {
      const text = chunk.toString("utf-8");
      for (const match of text.matchAll(PR_URL_REGEX)) {
        const prNumber = parseInt(match[1], 10);
        if (!detectedPrs.has(prNumber)) {
          detectedPrs.add(prNumber);
          const prUrl = match[0];
          addSessionPr(sessionId, prUrl, prNumber).catch((err) => {
            log.warn({ err, prUrl }, "Failed to register session PR");
          });
          log.info({ prUrl, prNumber }, "Detected PR from session terminal");
        }
      }
    };

    try {
      execSession = await rt.exec(handle, ["bash", "-c", setupScript], { tty: true });

      // Pipe exec stdout → WebSocket + scan for PR URLs
      execSession.stdout.on("data", (chunk: Buffer) => {
        if (socket.readyState === 1) {
          socket.send(chunk);
        }
        scanForPrUrls(chunk);
      });

      execSession.stderr.on("data", (chunk: Buffer) => {
        if (socket.readyState === 1) {
          socket.send(chunk);
        }
        scanForPrUrls(chunk);
      });

      // Pipe WebSocket → exec stdin
      socket.on("message", (data: Buffer | string) => {
        const str = typeof data === "string" ? data : data.toString("utf-8");

        // Check for resize messages
        try {
          const parsed = JSON.parse(str);
          if (parsed.type === "resize" && parsed.cols && parsed.rows) {
            execSession?.resize(parsed.cols, parsed.rows);
            return;
          }
        } catch {
          // Not JSON, treat as terminal input
        }

        execSession?.stdin.write(typeof data === "string" ? data : data);
      });

      // Handle exec session end
      execSession.stdout.on("end", () => {
        if (socket.readyState === 1) {
          socket.close();
        }
      });

      // Handle WebSocket close
      socket.on("close", () => {
        log.info("Session terminal disconnected");
        execSession?.close();
      });
    } catch (err) {
      log.error({ err }, "Failed to start terminal exec session");
      socket.send(JSON.stringify({ error: "Failed to start terminal" }));
      socket.close();
    }
  });
}
