import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { customImages } from "../db/schema.js";
import { buildQueue } from "../workers/image-build-worker.js";
import type { ImageConfig } from "@optio/image-builder";
import { logger } from "../logger.js";
import { publishEvent } from "./event-bus.js";
import type { BuildStatusChangedEvent } from "@optio/shared";

export interface BuildJob {
  id: string;
  status: "pending" | "building" | "success" | "failed" | "cancelled";
  logs?: string;
  startedAt?: Date;
  finishedAt?: Date;
}

/**
 * Manages the lifecycle of custom image builds.
 * - Submits build jobs to a Kubernetes-based builder
 * - Tracks status in the custom_images table
 * - Captures and stores build logs
 */
export class BuildJobManager {
  /**
   * Submit a new image build job.
   * @param config - Dockerfile generation configuration
   * @param workspaceId - Workspace owning the image
   * @param repoUrl - Repository URL (null for workspace-wide images)
   * @param userId - User who initiated the build
   * @returns BuildJob with initial pending status
   */
  async submitBuild(
    config: ImageConfig,
    workspaceId: string,
    repoUrl: string | null,
    userId: string,
  ): Promise<BuildJob> {
    // Generate a unique ID for this custom image
    const customImageId = randomUUID();

    // Build the image tag: optio/{workspaceId}/custom-{id}:latest
    const imageTag = `optio/${workspaceId}/custom-${customImageId}:latest`;

    try {
      // Create the record in custom_images table
      const [record] = await db
        .insert(customImages)
        .values({
          id: customImageId,
          workspaceId,
          repoUrl,
          imageTag,
          agentTypes: config.agentTypes,
          languagePreset: config.languagePreset,
          customDockerfile: config.customDockerfile ?? null,
          buildStatus: "pending",
          buildLogs: null,
          builtBy: userId,
        })
        .returning();

      // Queue the actual build job
      await buildQueue.add(
        "build",
        { customImageId },
        {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 30000,
          },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      );

      logger.info({ customImageId, workspaceId, repoUrl, imageTag }, "Build job submitted");

      // Publish WebSocket event
      const statusEvent: BuildStatusChangedEvent = {
        type: "build:status_changed",
        buildId: customImageId,
        fromStatus: "pending",
        toStatus: "pending",
        repoUrl,
        imageTag,
        timestamp: new Date().toISOString(),
      };
      await publishEvent(statusEvent);

      return {
        id: record.id,
        status: record.buildStatus as BuildJob["status"],
        logs: record.buildLogs ?? undefined,
        startedAt: record.builtAt ?? undefined,
        finishedAt: undefined,
      };
    } catch (err) {
      logger.error({ customImageId, error: err }, "Failed to submit build job");
      // If DB insert succeeded but queue failed, mark as failed
      try {
        await db
          .update(customImages)
          .set({
            buildStatus: "failed",
            buildLogs: `Failed to queue build: ${err instanceof Error ? err.message : String(err)}`,
          })
          .where(eq(customImages.id, customImageId));
      } catch {
        // Ignore cleanup errors
      }
      throw err;
    }
  }

  /**
   * Get the current status of a build.
   */
  async getBuildStatus(customImageId: string): Promise<BuildJob | null> {
    const [record] = await db
      .select({
        id: customImages.id,
        buildStatus: customImages.buildStatus,
        buildLogs: customImages.buildLogs,
        builtAt: customImages.builtAt,
      })
      .from(customImages)
      .where(eq(customImages.id, customImageId));

    if (!record) {
      return null;
    }

    return {
      id: record.id,
      status: record.buildStatus as BuildJob["status"],
      logs: record.buildLogs ?? undefined,
      startedAt: record.builtAt ?? undefined,
      finishedAt: undefined, // We don't have separate finishedAt, using builtAt as completion time
    };
  }

  /**
   * Get the build logs for a specific build.
   */
  async getBuildLogs(customImageId: string): Promise<string | null> {
    const [record] = await db
      .select({ buildLogs: customImages.buildLogs })
      .from(customImages)
      .where(eq(customImages.id, customImageId));

    return record?.buildLogs ?? null;
  }

  /**
   * Cancel a pending or running build.
   */
  async cancelBuild(customImageId: string): Promise<boolean> {
    // Check current status
    const [record] = await db
      .select({ buildStatus: customImages.buildStatus })
      .from(customImages)
      .where(eq(customImages.id, customImageId));

    if (!record) {
      return false;
    }

    const status = record.buildStatus;
    if (status === "pending" || status === "building") {
      // Update to cancelled
      await db
        .update(customImages)
        .set({ buildStatus: "cancelled" })
        .where(eq(customImages.id, customImageId));

      // Publish cancellation event
      const cancelEvent: BuildStatusChangedEvent = {
        type: "build:status_changed",
        buildId: customImageId,
        fromStatus: status as BuildStatusChangedEvent["fromStatus"],
        toStatus: "cancelled",
        repoUrl: null,
        imageTag: "",
        timestamp: new Date().toISOString(),
      };
      await publishEvent(cancelEvent);

      logger.info({ customImageId }, "Build cancelled");
      return true;
    }

    return false;
  }
}

export const buildJobManager = new BuildJobManager();
