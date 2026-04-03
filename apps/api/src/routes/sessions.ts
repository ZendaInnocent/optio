import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import * as sessionService from "../services/interactive-session-service.js";
import { getAvailableModels } from "../services/model-catalog-service.js";
import { db } from "../db/client.js";
import { repos } from "../db/schema.js";

const listSessionsQuerySchema = z.object({
  repoUrl: z.string().optional(),
  state: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const createSessionSchema = z.object({
  repoUrl: z.string().url(),
  agentType: z.enum(["claude-code", "codex", "opencode"]).optional(),
  model: z.string().optional(),
});

export async function sessionRoutes(app: FastifyInstance) {
  // List sessions
  app.get("/api/sessions", async (req, reply) => {
    const parsed = listSessionsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }
    const { repoUrl, state, limit, offset } = parsed.data;
    const sessions = await sessionService.listSessions({
      repoUrl,
      state,
      limit,
      offset,
    });
    const activeCount = await sessionService.getActiveSessionCount(repoUrl);
    reply.send({ sessions, activeCount });
  });

  // Get session — includes model info from repo config
  app.get("/api/sessions/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = await sessionService.getSession(id);
    if (!session) return reply.status(404).send({ error: "Session not found" });

    // Get available models for the user (free + paid based on API keys)
    const userId = req.user?.id ?? null;
    const availableModels = await getAvailableModels(userId);

    // Return session with model config
    reply.send({
      session,
      modelConfig: {
        currentModel: session.model ?? null,
        availableModels,
      },
    });
  });

  // Create session
  app.post("/api/sessions", async (req, reply) => {
    const input = createSessionSchema.parse(req.body);
    const userId = req.user?.id;
    const session = await sessionService.createSession({
      repoUrl: input.repoUrl,
      userId,
      agentType: input.agentType,
      model: input.model,
    });
    reply.status(201).send({ session });
  });

  // End session
  app.post("/api/sessions/:id/end", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const session = await sessionService.endSession(id);
      reply.send({ session });
    } catch (err) {
      reply.status(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // List PRs for a session
  app.get("/api/sessions/:id/prs", async (req, reply) => {
    const { id } = req.params as { id: string };
    const prs = await sessionService.getSessionPrs(id);
    reply.send({ prs });
  });

  // Add a PR to a session
  app.post("/api/sessions/:id/prs", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { prUrl: string; prNumber: number };
    if (!body.prUrl || !body.prNumber) {
      return reply.status(400).send({ error: "prUrl and prNumber required" });
    }
    const pr = await sessionService.addSessionPr(id, body.prUrl, body.prNumber);
    reply.status(201).send({ pr });
  });

  // Get active session count
  app.get("/api/sessions/active-count", async (req, reply) => {
    const { repoUrl } = req.query as { repoUrl?: string };
    const count = await sessionService.getActiveSessionCount(repoUrl);
    reply.send({ count });
  });

  // Get session messages (last 100 by default)
  app.get("/api/sessions/:id/messages", async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = await sessionService.getSession(id);
    if (!session) return reply.status(404).send({ error: "Session not found" });

    const queryLimit = req.query as { limit?: string };
    const limit = queryLimit.limit ? Math.min(parseInt(queryLimit.limit, 10), 1000) : 100;

    const messages = await sessionService.getSessionMessages(id, limit);
    reply.send({ messages });
  });

  // Add a message to a session (for resumability / manual injection)
  app.post("/api/sessions/:id/messages", async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = await sessionService.getSession(id);
    if (!session) return reply.status(404).send({ error: "Session not found" });

    const bodySchema = z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().min(1),
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const message = await sessionService.addSessionMessage(
      id,
      parsed.data.role,
      parsed.data.content,
    );
    reply.status(201).send({ message });
  });
}
