import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as agentRunService from "../services/agent-run-service.js";

declare module "fastify" {
  interface FastifyInstance {
    authRequired: (req: any, reply: any) => Promise<void> | void;
  }
}

const createAgentRunSchema = z.object({
  title: z.string(),
  initialPrompt: z.string(),
  repoId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  agentType: z.string(),
  model: z.string().optional(),
  mode: z.enum(["autonomous", "supervised", "interactive"]),
  maxTurns: z.number().optional(),
  dependsOn: z.array(z.string().uuid()).optional(),
});

const modeSwitchSchema = z.object({
  mode: z.enum(["autonomous", "supervised", "interactive"]),
});

const resumeSchema = z.object({
  prompt: z.string().optional(),
});

const registerPrSchema = z.object({
  prUrl: z.string().url(),
  prNumber: z.number().optional(),
  title: z.string().optional(),
});

export async function agentRunRoutes(app: FastifyInstance) {
  // Define authRequired check
  if (!app.authRequired) {
    app.authRequired = async (req: any, reply: any) => {
      if (!req.user) {
        return reply.code(401).send({ error: "Authentication required" });
      }
    };
  }

  // POST /api/agent-runs - create a new agent run
  app.post("/api/agent-runs", { preValidation: app.authRequired }, async (req: any, reply: any) => {
    const parsed = createAgentRunSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }
    const run = await agentRunService.createAgentRun(parsed.data);
    reply.code(201).send(run);
  });

  // GET /api/agent-runs/:id - get agent run by id
  app.get(
    "/api/agent-runs/:id",
    { preValidation: app.authRequired },
    async (req: any, reply: any) => {
      const { id } = req.params as { id: string };
      const run = await agentRunService.getAgentRun(id);
      if (!run) return reply.code(404).send({ error: "Not found" });
      reply.send(run);
    },
  );

  // POST /api/agent-runs/:id/mode - switch mode
  app.post(
    "/api/agent-runs/:id/mode",
    { preValidation: app.authRequired },
    async (req: any, reply: any) => {
      const { id } = req.params as { id: string };
      const run = await agentRunService.getAgentRun(id);
      if (!run) return reply.code(404).send({ error: "Not found" });
      const parsed = modeSwitchSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0].message });
      }
      const result = await agentRunService.switchMode(id, parsed.data.mode);
      reply.send(result);
    },
  );

  // POST /api/agent-runs/:id/interrupt - transition to needs_attention
  app.post(
    "/api/agent-runs/:id/interrupt",
    { preValidation: app.authRequired },
    async (req: any, reply: any) => {
      const { id } = req.params as { id: string };
      const run = await agentRunService.getAgentRun(id);
      if (!run) return reply.code(404).send({ error: "Not found" });
      const result = await agentRunService.transitionState(id, "needs_attention");
      reply.send(result);
    },
  );

  // POST /api/agent-runs/:id/resume - transition to running
  app.post(
    "/api/agent-runs/:id/resume",
    { preValidation: app.authRequired },
    async (req: any, reply: any) => {
      const { id } = req.params as { id: string };
      const run = await agentRunService.getAgentRun(id);
      if (!run) return reply.code(404).send({ error: "Not found" });
      // body is optional, ignore validation for now
      const result = await agentRunService.transitionState(id, "running");
      // TODO: enqueue in worker
      reply.send(result);
    },
  );

  // POST /api/agent-runs/:id/end - end interactive session (transition to completed)
  app.post(
    "/api/agent-runs/:id/end",
    { preValidation: app.authRequired },
    async (req: any, reply: any) => {
      const { id } = req.params as { id: string };
      const run = await agentRunService.getAgentRun(id);
      if (!run) return reply.code(404).send({ error: "Not found" });
      const result = await agentRunService.transitionState(id, "completed");
      reply.send(result);
    },
  );

  // GET /api/agent-runs/:id/events - list events (stub)
  app.get(
    "/api/agent-runs/:id/events",
    { preValidation: app.authRequired },
    async (req: any, reply: any) => {
      // TODO: implement pagination from agent_run_events
      reply.send([]);
    },
  );

  // GET /api/agent-runs/:id/prs - list PRs (stub)
  app.get(
    "/api/agent-runs/:id/prs",
    { preValidation: app.authRequired },
    async (req: any, reply: any) => {
      const { id } = req.params as { id: string };
      const run = await agentRunService.getAgentRun(id);
      if (!run) return reply.code(404).send({ error: "Not found" });
      // TODO: fetch from agent_run_prs
      reply.send([]);
    },
  );

  // POST /api/agent-runs/:id/prs - register a PR
  app.post(
    "/api/agent-runs/:id/prs",
    { preValidation: app.authRequired },
    async (req: any, reply: any) => {
      const { id } = req.params as { id: string };
      const run = await agentRunService.getAgentRun(id);
      if (!run) return reply.code(404).send({ error: "Not found" });
      const parsed = registerPrSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0].message });
      }
      await agentRunService.registerPr(
        id,
        parsed.data.prUrl,
        parsed.data.prNumber,
        parsed.data.title,
      );
      reply.code(201).send({ ok: true });
    },
  );
}
