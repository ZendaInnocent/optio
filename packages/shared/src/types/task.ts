export enum TaskState {
  PENDING = "pending",
  WAITING_ON_DEPS = "waiting_on_deps",
  QUEUED = "queued",
  PROVISIONING = "provisioning",
  RUNNING = "running",
  NEEDS_ATTENTION = "needs_attention",
  PR_OPENED = "pr_opened",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELLED = "cancelled",
}

export type WorkflowType = "do-work" | "plan" | "review";

export type TaskType = "coding" | "review";

export interface Task {
  id: string;
  title: string;
  prompt: string;
  repoUrl: string;
  repoBranch: string;
  state: TaskState;
  agentType: string;
  workflowType: WorkflowType;
  containerId?: string | null;
  sessionId?: string | null;
  prUrl?: string | null;
  prNumber?: number | null;
  prState?: string | null;
  prChecksStatus?: string | null;
  prReviewStatus?: string | null;
  prReviewComments?: string | null;
  resultSummary?: string | null;
  costUsd?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  modelUsed?: string | null;
  errorMessage?: string | null;
  ticketSource?: string | null;
  ticketExternalId?: string | null;
  metadata?: Record<string, unknown> | null;
  retryCount: number;
  maxRetries: number;
  priority?: number | null;
  parentTaskId?: string | null;
  taskType: TaskType;
  subtaskOrder?: number | null;
  blocksParent?: boolean | null;
  worktreeState?: string | null;
  lastPodId?: string | null;
  workflowRunId?: string | null;
  createdBy?: string | null;
  ignoreOffPeak?: boolean | null;
  workspaceId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date | null;
  completedAt?: Date | null;
}

export interface TaskEvent {
  id: string;
  taskId: string;
  fromState?: TaskState;
  toState: TaskState;
  trigger: string;
  message?: string;
  userId?: string;
  createdAt: Date;
}

export interface TaskComment {
  id: string;
  taskId: string;
  userId?: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  user?: {
    id: string;
    displayName: string;
    avatarUrl?: string;
  };
}

export interface CreateTaskInput {
  title: string;
  prompt: string;
  repoUrl: string;
  repoBranch?: string;
  agentType?: string;
  workflowType?: WorkflowType;
  ticketSource?: string;
  ticketExternalId?: string;
  metadata?: Record<string, unknown>;
  maxRetries?: number;
  priority?: number;
  dependsOn?: string[];
}

export interface WorkflowStep {
  id: string;
  title: string;
  prompt: string;
  repoUrl?: string;
  agentType?: string;
  dependsOn?: string[];
  condition?: {
    type: "always" | "if_pr_opened" | "if_ci_passes" | "if_cost_under";
    value?: string;
  };
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description?: string;
  workspaceId?: string;
  steps: WorkflowStep[];
  status: "draft" | "active" | "archived";
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowRun {
  id: string;
  workflowTemplateId: string;
  workspaceId?: string;
  status: "running" | "paused" | "completed" | "failed" | "cancelled";
  taskMapping?: Record<string, string>;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}
