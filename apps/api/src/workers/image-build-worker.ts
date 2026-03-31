import { Worker, Queue } from "bullmq";
import { db } from "../db/client.js";
import { customImages } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { DockerfileGenerator } from "@optio/image-builder";
import { logger } from "../logger.js";
import { publishEvent } from "../services/event-bus.js";
import type { BuildStatusChangedEvent } from "@optio/shared";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const connectionOpts = { url: redisUrl, maxRetriesPerRequest: null };

export const buildQueue = new Queue("image-builds", { connection: connectionOpts });

const namespace = process.env.OPTIO_NAMESPACE ?? "default";
const builderImage = process.env.OPTIO_BUILDER_IMAGE ?? "optio/builder:latest";
const registryUrl = process.env.OPTIO_REGISTRY_URL ?? "localhost:5000";

/**
 * Image Build Worker processor
 */
async function processBuildJob(job: any): Promise<void> {
  const { customImageId } = job.data;

  logger.info({ customImageId, jobId: job.id }, "Starting image build");

  // Fetch the custom image record
  const [record] = await db.select().from(customImages).where(eq(customImages.id, customImageId));

  if (!record) {
    throw new Error(`Custom image not found: ${customImageId}`);
  }

  // Update status to building
  await db
    .update(customImages)
    .set({ buildStatus: "building" })
    .where(eq(customImages.id, customImageId));

  // Publish building event
  const buildingEvent: BuildStatusChangedEvent = {
    type: "build:status_changed",
    buildId: customImageId,
    fromStatus: "pending",
    toStatus: "building",
    repoUrl: record.repoUrl,
    imageTag: record.imageTag,
    timestamp: new Date().toISOString(),
  };
  await publishEvent(buildingEvent);

  try {
    // Generate Dockerfile using DockerfileGenerator
    const generator = new DockerfileGenerator();
    const dockerfile = await generator.generate({
      agentTypes: record.agentTypes as any,
      languagePreset: record.languagePreset as any,
      customDockerfile: record.customDockerfile ?? undefined,
    });

    const jobName = `optio-build-${customImageId.slice(0, 8)}`;

    // Create ConfigMap with the generated Dockerfile
    const configMapManifest = {
      apiVersion: "v1",
      kind: "ConfigMap",
      metadata: {
        name: `dockerfile-${customImageId}`,
        namespace,
        labels: {
          app: "optio",
          component: "image-builder",
          customImageId,
        },
      },
      data: {
        Dockerfile: dockerfile,
      },
    };

    await applyKubectl(configMapManifest, "configmap");

    // Build the Kubernetes Job spec
    const jobManifest = {
      apiVersion: "batch/v1",
      kind: "Job",
      metadata: {
        name: jobName,
        namespace,
        labels: {
          app: "optio",
          component: "image-builder",
          customImageId,
        },
      },
      spec: {
        ttlSecondsAfterFinished: 3600,
        backoffLimit: 2,
        template: {
          metadata: {
            labels: { app: "optio-image-builder" },
          },
          spec: {
            restartPolicy: "Never",
            serviceAccountName: "optio-builder",
            containers: [
              {
                name: "dind",
                image: "docker:dind",
                securityContext: {
                  privileged: true,
                  capabilities: { add: ["SYS_ADMIN"] },
                },
                env: [
                  { name: "DOCKER_TLS_CERTDIR", value: "" },
                  { name: "DOCKER_DRIVER", value: "overlay2" },
                ],
                ports: [{ containerPort: 2375 }],
                volumeMounts: [{ name: "docker", mountPath: "/var/lib/docker" }],
              },
              {
                name: "builder",
                image: builderImage,
                env: [
                  { name: "DOCKER_HOST", value: "localhost:2375" },
                  { name: "REGISTRY_URL", value: registryUrl },
                  { name: "IMAGE_TAG", value: record.imageTag },
                ],
                volumeMounts: [
                  { name: "docker", mountPath: "/var/lib/docker" },
                  { name: "build-logs", mountPath: "/logs" },
                  { name: "dockerfile", mountPath: "/dockerfile" },
                ],
                command: ["/bin/sh", "/scripts/build.sh"],
              },
            ],
            volumes: [
              { name: "docker", emptyDir: {} },
              { name: "build-logs", emptyDir: {} },
              {
                name: "dockerfile",
                configMap: {
                  name: `dockerfile-${customImageId}`,
                  items: [{ key: "Dockerfile", path: "Dockerfile" }],
                },
              },
            ],
          },
        },
      },
    };

    await applyKubectl(jobManifest, "job");

    // Wait for job completion (with timeout)
    const timeoutMs = 30 * 60 * 1000; // 30 minutes
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const jobStatus = await getJobStatus(jobName, namespace);

      if (!jobStatus) {
        throw new Error(`Job ${jobName} not found`);
      }

      const conditions = jobStatus.status?.conditions;
      if (conditions) {
        const completed = conditions.find((c: any) => c.type === "Complete" || c.type === "Failed");
        if (completed) {
          if (completed.type === "Complete" && completed.status === "True") {
            await handleBuildSuccess(record.imageTag, customImageId, namespace, jobName);
            return;
          } else if (completed.type === "Failed" && completed.status === "True") {
            await handleBuildFailure(customImageId, namespace, jobName);
            return;
          }
        }
      }

      if (
        jobStatus.status?.conditions?.some((c: any) => c.type === "Failed" && c.status === "True")
      ) {
        await handleBuildFailure(customImageId, namespace, jobName);
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    throw new Error("Build job timed out after 30 minutes");
  } catch (error) {
    logger.error({ customImageId, error } as any, "Build job failed");

    // Fetch record for repoUrl before updating
    const [record] = await db
      .select({ repoUrl: customImages.repoUrl, imageTag: customImages.imageTag })
      .from(customImages)
      .where(eq(customImages.id, customImageId));

    await db
      .update(customImages)
      .set({
        buildStatus: "failed",
        buildLogs: error instanceof Error ? error.message : String(error),
      })
      .where(eq(customImages.id, customImageId));

    // Publish failure event
    const failureEvent: BuildStatusChangedEvent = {
      type: "build:status_changed",
      buildId: customImageId,
      fromStatus: "building",
      toStatus: "failed",
      repoUrl: record?.repoUrl ?? null,
      imageTag: record?.imageTag ?? "",
      timestamp: new Date().toISOString(),
    };
    await publishEvent(failureEvent);

    throw error;
  }
}

/**
 * Apply a Kubernetes manifest using kubectl.
 */
async function applyKubectl(manifest: any, resourceType: string): Promise<void> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);

  const manifestJson = JSON.stringify(manifest);
  try {
    await execFileAsync("bash", [
      "-c",
      `echo ${JSON.stringify(manifestJson)} | kubectl apply -f - -n ${namespace}`,
    ]);
    logger.info({ resourceType, name: manifest.metadata.name }, "Applied Kubernetes manifest");
  } catch (error) {
    logger.error(
      { resourceType, name: manifest.metadata.name, error } as any,
      "Failed to apply manifest",
    );
    throw error;
  }
}

/**
 * Get the status of a Kubernetes Job.
 */
async function getJobStatus(jobName: string, namespace: string): Promise<any> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);

  try {
    const output = await execFileAsync("kubectl", [
      "get",
      "job",
      jobName,
      "-n",
      namespace,
      "-o",
      "json",
    ]);
    const job = JSON.parse(output.stdout);
    return job;
  } catch (error: any) {
    if (error.stdout?.includes("NotFound")) {
      return null;
    }
    throw error;
  }
}

/**
 * Get logs from the builder container.
 */
async function getBuilderLogs(jobName: string, namespace: string): Promise<string | null> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);

  try {
    const output = await execFileAsync("kubectl", [
      "logs",
      "job/" + jobName,
      "-c",
      "builder",
      "-n",
      namespace,
      "--tail=500",
    ]);
    return output.stdout;
  } catch (error) {
    logger.error({ jobName, error } as any, "Failed to get builder logs");
    return null;
  }
}

/**
 * Handle successful build.
 */
async function handleBuildSuccess(
  imageTag: string,
  customImageId: string,
  _namespace: string,
  _jobName: string,
) {
  logger.info({ customImageId, imageTag }, "Build succeeded");

  // Fetch record for repoUrl
  const [record] = await db
    .select({ repoUrl: customImages.repoUrl, imageTag: customImages.imageTag })
    .from(customImages)
    .where(eq(customImages.id, customImageId));

  await db
    .update(customImages)
    .set({
      buildStatus: "success",
      builtAt: new Date(),
    })
    .where(eq(customImages.id, customImageId));

  // Publish success event
  const successEvent: BuildStatusChangedEvent = {
    type: "build:status_changed",
    buildId: customImageId,
    fromStatus: "building",
    toStatus: "success",
    repoUrl: record?.repoUrl ?? null,
    imageTag: record?.imageTag ?? imageTag,
    timestamp: new Date().toISOString(),
  };
  await publishEvent(successEvent);

  logger.info({ customImageId, imageTag }, "Image build completed successfully");
}

/**
 * Handle build failure.
 */
async function handleBuildFailure(customImageId: string, namespace: string, jobName: string) {
  logger.error({ customImageId, jobName }, "Build failed, capturing logs");

  // Fetch record for repoUrl before updating
  const [record] = await db
    .select({ repoUrl: customImages.repoUrl, imageTag: customImages.imageTag })
    .from(customImages)
    .where(eq(customImages.id, customImageId));

  try {
    const logs = await getBuilderLogs(jobName, namespace);
    if (logs) {
      const truncated =
        logs.length > 1_048_576 ? logs.slice(0, 1_048_576) + "\n[LOG TRUNCATED]" : logs;

      await db
        .update(customImages)
        .set({
          buildStatus: "failed",
          buildLogs: truncated,
        })
        .where(eq(customImages.id, customImageId));
    } else {
      await db
        .update(customImages)
        .set({ buildStatus: "failed" })
        .where(eq(customImages.id, customImageId));
    }
  } catch (logErr) {
    logger.error({ customImageId, error: logErr }, "Failed to capture build logs");
    await db
      .update(customImages)
      .set({ buildStatus: "failed" })
      .where(eq(customImages.id, customImageId));
  }

  // Publish failure event
  const failureEvent: BuildStatusChangedEvent = {
    type: "build:status_changed",
    buildId: customImageId,
    fromStatus: "building",
    toStatus: "failed",
    repoUrl: record?.repoUrl ?? null,
    imageTag: record?.imageTag ?? "",
    timestamp: new Date().toISOString(),
  };
  await publishEvent(failureEvent);

  // Clean up the job
  try {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);
    await execFileAsync("kubectl", [
      "delete",
      "job",
      jobName,
      "-n",
      namespace,
      "--ignore-not-found",
    ]);
  } catch (cleanupErr) {
    logger.warn({ jobName, error: cleanupErr } as any, "Failed to cleanup job");
  }
}

/**
 * Start the image build worker.
 */
export function startImageBuildWorker() {
  return new Worker("image-builds", processBuildJob, { connection: connectionOpts });
}

// Note: Do NOT auto-start. Call startImageBuildWorker() from app bootstrap.
