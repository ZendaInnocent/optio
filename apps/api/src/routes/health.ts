import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import { checkRuntimeHealth } from "../services/container-service.js";
import { validateSchema, getMissingColumnsMessage } from "../services/schema-validator.js";
import { sql } from "drizzle-orm";

let cachedRuntimeHealth: boolean | null = null;
let cachedRuntimeHealthAt = 0;
const RUNTIME_HEALTH_TTL_MS = 30_000;

let cachedSchemaHealth: { valid: boolean; message: string } | null = null;
let cachedSchemaHealthAt = 0;
const SCHEMA_HEALTH_TTL_MS = 60_000;

export async function healthRoutes(app: FastifyInstance) {
  app.get("/api/health", async (_req, reply) => {
    const checks: Record<string, boolean> = {};

    try {
      await db.execute(sql`SELECT 1`);
      checks.database = true;
    } catch {
      checks.database = false;
    }

    if (
      cachedRuntimeHealth !== null &&
      Date.now() - cachedRuntimeHealthAt < RUNTIME_HEALTH_TTL_MS
    ) {
      checks.containerRuntime = cachedRuntimeHealth;
    } else {
      try {
        checks.containerRuntime = await checkRuntimeHealth();
      } catch {
        checks.containerRuntime = false;
      }
      cachedRuntimeHealth = checks.containerRuntime;
      cachedRuntimeHealthAt = Date.now();
    }

    const healthy = Object.values(checks).every(Boolean);
    const maxConcurrent = parseInt(process.env.OPTIO_MAX_CONCURRENT ?? "5", 10);
    reply.status(healthy ? 200 : 503).send({ healthy, checks, maxConcurrent });
  });

  app.get("/api/health/schema", async (_req, reply) => {
    if (cachedSchemaHealth !== null && Date.now() - cachedSchemaHealthAt < SCHEMA_HEALTH_TTL_MS) {
      return reply.send(cachedSchemaHealth);
    }

    const result = await validateSchema();
    const message = result.valid ? "Schema OK" : getMissingColumnsMessage(result.issues);

    const response = {
      valid: result.valid,
      message,
      issues: result.issues,
      checkedAt: result.checkedAt,
    };

    cachedSchemaHealth = response;
    cachedSchemaHealthAt = Date.now();

    reply.status(result.valid ? 200 : 503).send(response);
  });
}
