import { TaskContext, PhaseError } from "./task-orchestrator-types.js";
import { TaskState } from "@optio/shared";
import { resolveAgentImage, getOrCreateRepoPod } from "../services/repo-pool-service.js";
import { updateTaskContainer, transitionTask } from "../services/task-service.js";

export interface ProvisioningResult {
  success: boolean;
  error?: string;
}

export async function runProvisioning(ctx: TaskContext): Promise<ProvisioningResult> {
  const { task, repo, log, taskId } = ctx;

  try {
    // Resolve agent image
    const imageTag = await resolveAgentImage(task.repoUrl, task.workspaceId);
    ctx.agentImage = imageTag;

    // Get or create repo pod
    const isRetry = (task.retryCount ?? 0) > 0;
    const maxAgentsPerPod = repo.maxAgentsPerPod ?? 2;
    const maxPodInstances = repo.maxPodInstances ?? 1;

    const pod = await getOrCreateRepoPod(
      task.repoUrl,
      task.repoBranch,
      {},
      { customImage: imageTag },
      {
        preferredPodId: isRetry ? ((task as any).lastPodId ?? undefined) : undefined,
        maxAgentsPerPod,
        maxPodInstances,
        networkPolicy: repo.networkPolicy ?? "unrestricted",
        cpuRequest: repo.cpuRequest,
        cpuLimit: repo.cpuLimit,
        memoryRequest: repo.memoryRequest,
        memoryLimit: repo.memoryLimit,
        dockerInDocker: repo.dockerInDocker ?? false,
        secretProxy: repo.secretProxy ?? false,
      },
    );

    ctx.pod = pod;
    log.info({ podName: pod.podName, instanceIndex: pod.instanceIndex }, "Repo pod ready");

    await updateTaskContainer(taskId, pod.podName ?? pod.podId ?? pod.id);
    await transitionTask(taskId, TaskState.RUNNING, "worktree_created");
    log.info("Running agent in worktree");

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err }, "Pod provisioning failed");
    return { success: false, error: message };
  }
}
