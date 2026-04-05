import type { FastifyInstance } from "fastify";

export async function registerCompatTaskRoutes(fastify: FastifyInstance) {
  // Define authRequired if not present (copied from agent-runs.ts)
  if (!fastify.authRequired) {
    fastify.authRequired = async (req: any, reply: any) => {
      if (!req.user) {
        return reply.code(401).send({ error: "Authentication required" });
      }
    };
  }

  // All legacy task endpoints now return 410 Gone
  fastify.get("/api/tasks/:id", async (_request, reply) => {
    reply.code(410).send({ error: "Endpoint deprecated. Use /api/agent-runs/:id" });
  });

  fastify.get("/api/tasks", async (_request, reply) => {
    reply.code(410).send({ error: "Endpoint deprecated. Use /api/agent-runs?mode=autonomous" });
  });

  fastify.post("/api/tasks", { preValidation: fastify.authRequired }, async (_request, reply) => {
    reply.code(410).send({ error: "Endpoint deprecated. Use POST /api/agent-runs" });
  });
}
