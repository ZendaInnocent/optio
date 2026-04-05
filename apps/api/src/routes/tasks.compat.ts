import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as agentRunService from "../services/agent-run-service.js";
import { getRepoByUrl } from "../services/repo-service.js";

export async function registerCompatTaskRoutes(fastify: FastifyInstance) {
  // Define authRequired if not present (copied from agent-runs.ts)
  if (!fastify.authRequired) {
    fastify.authRequired = async (req: any, reply: any) => {
      if (!req.user) {
        return reply.code(401).send({ error: "Authentication required" });
      }
    };
  }

  // GET /api/tasks/:id -> redirect to agent-runs detail
  fastify.get("/api/tasks/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    reply.redirect(`/api/agent-runs/${id}`, 301);
  });

  // GET /api/tasks -> redirect to list with mode=autonomous
  fastify.get("/api/tasks", async (request, reply) => {
    reply.redirect("/api/agent-runs?mode=autonomous", 302);
  });

  // POST /api/tasks -> create agent run (autonomous)
  const createTaskSchema = z.object({
    title: z.string().min(1),
    prompt: z.string().min(1),
    repoUrl: z.string().url(),
    workspaceId: z.string().uuid(),
    agentType: z.string(),
    model: z.string().optional(),
    dependsOn: z.array(z.string().uuid()).optional(),
  });

  fastify.post("/api/tasks", { preValidation: fastify.authRequired }, async (request, reply) => {
    const parsed = createTaskSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }
    const body = parsed.data;

    // Resolve repoId from repoUrl and user's workspace
    const repo = await getRepoByUrl(body.repoUrl, request.user?.workspaceId);
    if (!repo) {
      return reply.code(404).send({ error: "Repository not found" });
    }

    // Create agent run with mode=autonomous
    const run = await agentRunService.createAgentRun({
      title: body.title,
      initialPrompt: body.prompt,
      repoId: repo.id,
      workspaceId: body.workspaceId,
      agentType: body.agentType,
      model: body.model,
      mode: "autonomous",
      dependsOn: body.dependsOn,
    });
    reply.code(201).send(run);
  });
}
