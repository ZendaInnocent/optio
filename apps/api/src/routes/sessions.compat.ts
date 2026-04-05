import type { FastifyInstance } from "fastify";

export async function registerCompatSessionRoutes(fastify: FastifyInstance) {
  // Define authRequired if not present
  if (!fastify.authRequired) {
    fastify.authRequired = async (req: any, reply: any) => {
      if (!req.user) {
        return reply.code(401).send({ error: "Authentication required" });
      }
    };
  }

  // All legacy session endpoints now return 410 Gone
  fastify.get("/api/sessions/:id", async (_request, reply) => {
    reply.code(410).send({ error: "Endpoint deprecated. Use /api/agent-runs/:id" });
  });

  fastify.get("/api/sessions", async (_request, reply) => {
    reply.code(410).send({ error: "Endpoint deprecated. Use /api/agent-runs?mode=interactive" });
  });

  fastify.post(
    "/api/sessions",
    { preValidation: fastify.authRequired },
    async (_request, reply) => {
      reply.code(410).send({ error: "Endpoint deprecated. Use POST /api/agent-runs" });
    },
  );
}
