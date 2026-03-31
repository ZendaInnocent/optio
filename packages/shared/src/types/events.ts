import type { TaskState } from "./task.js";
import type { InteractiveSessionState } from "./session.js";

export type WsEvent =
  | TaskStateChangedEvent
  | TaskLogEvent
  | TaskCreatedEvent
  | TaskPendingReasonEvent
  | AuthFailedEvent
  | SessionCreatedEvent
  | SessionEndedEvent
  | TaskCommentEvent
  | BuildStatusChangedEvent
  | BuildLogEvent;

export interface TaskStateChangedEvent {
  type: "task:state_changed";
  taskId: string;
  fromState: TaskState;
  toState: TaskState;
  timestamp: string;
  /** Cost/token/model fields — populated on terminal-state transitions */
  costUsd?: string;
  inputTokens?: number;
  outputTokens?: number;
  modelUsed?: string;
  /** Reason the task needs attention or failed — populated on needs_attention/failed transitions */
  errorMessage?: string;
}

export interface TaskLogEvent {
  type: "task:log";
  taskId: string;
  stream: "stdout" | "stderr";
  content: string;
  timestamp: string;
}

export interface TaskCreatedEvent {
  type: "task:created";
  taskId: string;
  title: string;
  timestamp: string;
}

export interface TaskPendingReasonEvent {
  type: "task:pending_reason";
  taskId: string;
  data: { pendingReason: string | null };
}

export interface AuthFailedEvent {
  type: "auth:failed";
  message: string;
  timestamp: string;
}

export interface SessionCreatedEvent {
  type: "session:created";
  sessionId: string;
  repoUrl: string;
  state: InteractiveSessionState;
  timestamp: string;
}

export interface SessionEndedEvent {
  type: "session:ended";
  sessionId: string;
  timestamp: string;
}

export interface TaskCommentEvent {
  type: "task:comment";
  taskId: string;
  commentId: string;
  timestamp: string;
}

export interface BuildStatusChangedEvent {
  type: "build:status_changed";
  buildId: string;
  fromStatus: "pending" | "building" | "success" | "failed" | "cancelled";
  toStatus: "pending" | "building" | "success" | "failed" | "cancelled";
  repoUrl: string | null;
  imageTag: string;
  timestamp: string;
}

export interface BuildLogEvent {
  type: "build:log";
  buildId: string;
  content: string;
  timestamp: string;
}
