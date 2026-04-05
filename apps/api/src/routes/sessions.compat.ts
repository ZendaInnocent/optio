import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as agentRunService from "../services/agent-run-service.js";
import { getRepoByUrl } from "../services/repo-service.js";

export async function registerCompatSessionRoutes(fastify: FastifyInstance) {
  // Define authRequired if not present
  if (!fastify.authRequired) {
    fastify.authRequired = async (req: any, reply: any) => {
      if (!req.user) {
        return reply.code(401).send({ error: "Authentication required" });
      }
    };
  }

  // GET /api/sessions/:id -> redirect to agent-runs detail
  fastify.get("/api/sessions/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    reply.redirect(`/api/agent-runs/${id}`, 301);
  });

  // GET /api/sessions -> redirect to list with mode=interactive
  fastify.get("/api/sessions", async (request, reply) => {
    reply.redirect("/api/agent-runs?mode=interactive", 302);
  });

  // POST /api/sessions -> create agent run (interactive)
  const createSessionSchema = z.object({
    repoUrl: z.string().url(),
    workspaceId: z.string().uuid(),
    agentType: z.string(),
    model: z.string().optional(),
    maxTurns: z.number().optional(),
  });

  fastify.post("/api/sessions", { preValidation: fastify.authRequired }, async (request, reply) => {
    const parsed = createSessionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }
    const body = parsed.data;

    // Resolve repoId from repoUrl and user's workspace
    const repo = await getRepoByUrl(body.repoUrl, request.user?.workspaceId);
    if (!repo) {
      return reply.code(404).send({ error: "Repository not found" });
    }

    // Create agent run with mode=interactive
    const run = await agentRunService.createAgentRun({
      title: "Interactive session",
      initialPrompt: "", // sessions start empty
      repoId: repo.id,
      workspaceId: body.workspaceId,
      agentType: body.agentType,
      model: body.model,
      mode: "interactive",
      maxTurns: body.maxTurns ?? 100,
    });
    reply.code(201).send(run);
  });
}
