import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AGENT_DEFINITIONS, PRESET_IMAGES } from "@optio/shared";
import { buildJobManager } from "../services/build-job-manager.js";
import * as repoService from "../services/repo-service.js";
import { db } from "../db/client.js";
import { customImages, workspaceMembers } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import type { ImageConfig } from "@optio/image-builder";

// ─── Zod schemas ───

const agentTypeEnum = z.enum(["claude-code", "codex", "opencode"]);
const languagePresetEnum = z.enum(["base", "node", "python", "go", "rust", "full", "dind"]);

const imageConfigSchema = z.object({
  agentTypes: z.array(agentTypeEnum).min(1, "At least one agent type is required"),
  languagePreset: languagePresetEnum,
  customDockerfile: z.string().optional(),
});

const updateImageConfigSchema = z.object({
  agentTypes: z.array(agentTypeEnum).min(1, "At least one agent type is required").optional(),
  languagePreset: languagePresetEnum.optional(),
  customDockerfile: z.string().nullable().optional(),
});

// ─── Helpers ───

async function checkCanBuild(workspaceId: string, userId: string): Promise<boolean> {
  const [member] = await db
    .select({ canBuild: workspaceMembers.canBuild })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)));
  return member?.canBuild ?? false;
}

function getUserId(req: { user?: { id?: string } }): string {
  return req.user?.id ?? "anonymous";
}

// ─── Routes ───

export async function customImagesRoutes(app: FastifyInstance) {
  // GET /api/v1/agents — return agent catalog
  app.get("/api/v1/agents", async (_req, reply) => {
    const agents = Object.entries(AGENT_DEFINITIONS).map(([id, def]) => ({
      id,
      label: def.name,
      description: def.description,
      installCommand: def.installCommand,
      requiredSecrets: def.requiredSecrets,
    }));
    reply.send({ agents });
  });

  // GET /api/v1/languages — return language presets
  app.get("/api/v1/languages", async (_req, reply) => {
    const languages = Object.entries(PRESET_IMAGES).map(([id, preset]) => ({
      id,
      label: preset.label,
      description: preset.description,
      languages: preset.languages,
    }));
    reply.send({ languages });
  });

  // GET /api/v1/repos/:repoId/image-config — return current image config for a repo
  app.get("/api/v1/repos/:repoId/image-config", async (req, reply) => {
    const { repoId } = req.params as { repoId: string };
    const workspaceId = req.user?.workspaceId;

    const repo = await repoService.getRepo(repoId);
    if (!repo) {
      return reply.status(404).send({ error: "Repo not found" });
    }
    if (workspaceId && repo.workspaceId !== workspaceId) {
      return reply.status(403).send({ error: "Forbidden: repo not in your workspace" });
    }

    const config = {
      agentTypes: (repo as any).agentTypes ?? [],
      languagePreset: (repo as any).languagePreset ?? (repo as any).imagePreset ?? null,
      customDockerfile: (repo as any).customDockerfile ?? null,
    };

    reply.send({ config, repo: { id: repo.id, fullName: repo.fullName, repoUrl: repo.repoUrl } });
  });

  // PUT /api/v1/repos/:repoId/image-config — update repo image config
  app.put("/api/v1/repos/:repoId/image-config", async (req, reply) => {
    const { repoId } = req.params as { repoId: string };
    const workspaceId = req.user?.workspaceId;
    const userId = getUserId(req);

    // Validate input first
    const body = updateImageConfigSchema.parse(req.body);

    const repo = await repoService.getRepo(repoId);
    if (!repo) {
      return reply.status(404).send({ error: "Repo not found" });
    }
    if (workspaceId && repo.workspaceId !== workspaceId) {
      return reply.status(403).send({ error: "Forbidden: repo not in your workspace" });
    }

    const canBuild = await checkCanBuild(workspaceId!, userId);
    if (!canBuild) {
      return reply.status(403).send({ error: "Forbidden: requires can_build permission" });
    }

    const updateData: Record<string, unknown> = {};
    if (body.agentTypes !== undefined) updateData.agentTypes = body.agentTypes;
    if (body.languagePreset !== undefined) updateData.languagePreset = body.languagePreset;
    if (body.customDockerfile !== undefined) updateData.customDockerfile = body.customDockerfile;

    const updated = await repoService.updateRepo(repoId, updateData);
    if (!updated) {
      return reply.status(404).send({ error: "Repo not found" });
    }

    const config = {
      agentTypes: (updated as any).agentTypes ?? body.agentTypes ?? [],
      languagePreset: (updated as any).languagePreset ?? body.languagePreset ?? null,
      customDockerfile: (updated as any).customDockerfile ?? body.customDockerfile ?? null,
    };

    reply.send({ config });
  });

  // POST /api/v1/repos/:repoId/build-image — trigger image build
  app.post("/api/v1/repos/:repoId/build-image", async (req, reply) => {
    const { repoId } = req.params as { repoId: string };
    const workspaceId = req.user?.workspaceId;
    const userId = getUserId(req);

    // Validate input first
    const body = imageConfigSchema.parse(req.body);

    const repo = await repoService.getRepo(repoId);
    if (!repo) {
      return reply.status(404).send({ error: "Repo not found" });
    }
    if (workspaceId && repo.workspaceId !== workspaceId) {
      return reply.status(403).send({ error: "Forbidden: repo not in your workspace" });
    }

    const canBuild = await checkCanBuild(workspaceId!, userId);
    if (!canBuild) {
      return reply.status(403).send({ error: "Forbidden: requires can_build permission" });
    }

    const config: ImageConfig = {
      agentTypes: body.agentTypes,
      languagePreset: body.languagePreset,
      customDockerfile: body.customDockerfile,
    };

    const build = await buildJobManager.submitBuild(config, workspaceId!, repo.repoUrl, userId);

    reply.status(202).send({ buildId: build.id, status: build.status });
  });

  // GET /api/v1/builds — list builds with optional filtering
  app.get("/api/v1/builds", async (req, reply) => {
    const workspaceId = req.user?.workspaceId;
    const { status, repo } = req.query as Record<string, string | undefined>;

    let query = db.select().from(customImages).where(eq(customImages.workspaceId, workspaceId!));

    if (status) {
      query = db
        .select()
        .from(customImages)
        .where(
          and(eq(customImages.workspaceId, workspaceId!), eq(customImages.buildStatus, status)),
        );
    }
    if (repo) {
      query = db
        .select()
        .from(customImages)
        .where(and(eq(customImages.workspaceId, workspaceId!), eq(customImages.repoUrl, repo)));
    }

    const builds = await query;

    reply.send({
      builds: builds.map((b) => ({
        id: b.id,
        repoUrl: b.repoUrl,
        imageTag: b.imageTag,
        agentTypes: b.agentTypes,
        languagePreset: b.languagePreset,
        buildStatus: b.buildStatus,
        builtAt: b.builtAt,
        createdAt: b.createdAt,
      })),
    });
  });

  // GET /api/v1/builds/:buildId — get build details
  app.get("/api/v1/builds/:buildId", async (req, reply) => {
    const { buildId } = req.params as { buildId: string };

    const build = await buildJobManager.getBuildStatus(buildId);
    if (!build) {
      return reply.status(404).send({ error: "Build not found" });
    }

    reply.send({ build });
  });

  // DELETE /api/v1/builds/:buildId — cancel a build
  app.delete("/api/v1/builds/:buildId", async (req, reply) => {
    const { buildId } = req.params as { buildId: string };

    const cancelled = await buildJobManager.cancelBuild(buildId);
    if (!cancelled) {
      return reply.status(404).send({ error: "Build not found or cannot be cancelled" });
    }

    reply.send({ message: "Build cancelled" });
  });
}
