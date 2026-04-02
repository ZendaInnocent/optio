import { eq, desc, asc, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
  agentThreads,
  threadEvents,
  threadSnapshots,
  eventCorrections,
  type AgentThread as AgentThreadType,
  type ThreadEvent as ThreadEventType,
  type ThreadSnapshot as ThreadSnapshotType,
} from "../../db/schema.js";

export type ThreadStatus = "pending" | "running" | "paused" | "completed" | "failed" | "forked";
export type ThreadPhase = string;
export type AgentThread = AgentThreadType;
export type ThreadEvent = ThreadEventType;
export type ThreadSnapshot = ThreadSnapshotType;

export interface ThreadState {
  phase: ThreadPhase | null;
  tasks: TaskState[];
  currentTaskIndex: number;
  context: Record<string, unknown>;
  checkpoints: Checkpoint[];
}

export interface TaskState {
  id: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  tests: string[];
  error?: string;
}

export interface Checkpoint {
  eventIndex: number;
  phase: string;
  snapshot: Record<string, unknown>;
  createdAt: Date;
}

export interface CreateThreadParams {
  workspaceId: string;
  agentType?: string;
  metadata?: Record<string, unknown>;
}

export interface EmitEventParams {
  threadId: string;
  eventType: string;
  payload: Record<string, unknown>;
}

export class ThreadRepository {
  async createThread(params: CreateThreadParams): Promise<AgentThread> {
    const [thread] = await db
      .insert(agentThreads)
      .values({
        workspaceId: params.workspaceId,
        agentType: params.agentType ?? "do-work",
        status: "pending",
        metadata: params.metadata ?? {},
      })
      .returning();
    return thread;
  }

  async getThread(id: string): Promise<AgentThread | null> {
    const result = await db.select().from(agentThreads).where(eq(agentThreads.id, id));
    return result[0] ?? null;
  }

  async updateThreadStatus(id: string, status: ThreadStatus, phase?: string): Promise<void> {
    await db
      .update(agentThreads)
      .set({
        status,
        currentPhase: phase,
      })
      .where(eq(agentThreads.id, id));
  }

  async emitEvent(params: EmitEventParams): Promise<ThreadEvent> {
    const [event] = await db
      .insert(threadEvents)
      .values({
        threadId: params.threadId,
        eventType: params.eventType,
        payload: params.payload,
      })
      .returning();

    await db
      .update(agentThreads)
      .set({ updatedAt: new Date() })
      .where(eq(agentThreads.id, params.threadId));

    return event;
  }

  async getThreadEvents(threadId: string, limit?: number): Promise<ThreadEvent[]> {
    const query = db
      .select()
      .from(threadEvents)
      .where(eq(threadEvents.threadId, threadId))
      .orderBy(asc(threadEvents.createdAt));

    if (limit) {
      return query.limit(limit);
    }
    return query;
  }

  async getEventCount(threadId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(threadEvents)
      .where(eq(threadEvents.threadId, threadId));
    return result[0]?.count ?? 0;
  }

  async createSnapshot(
    threadId: string,
    phase: string,
    state: Record<string, unknown>,
  ): Promise<ThreadSnapshot> {
    const eventCount = await this.getEventCount(threadId);
    const [snapshot] = await db
      .insert(threadSnapshots)
      .values({
        threadId,
        eventIndex: eventCount,
        phase,
        state,
      })
      .returning();
    return snapshot;
  }

  async getLatestSnapshot(threadId: string): Promise<ThreadSnapshot | null> {
    const result = await db
      .select()
      .from(threadSnapshots)
      .where(eq(threadSnapshots.threadId, threadId))
      .orderBy(desc(threadSnapshots.eventIndex))
      .limit(1);
    return result[0] ?? null;
  }

  async restoreSnapshot(threadId: string): Promise<Record<string, unknown> | null> {
    const snapshot = await this.getLatestSnapshot(threadId);
    return snapshot?.state ?? null;
  }

  async getThreadHistory(threadId: string): Promise<ThreadEvent[]> {
    return db
      .select()
      .from(threadEvents)
      .where(eq(threadEvents.threadId, threadId))
      .orderBy(asc(threadEvents.createdAt));
  }

  async forkThread(parentId: string, metadata?: Record<string, unknown>): Promise<AgentThread> {
    const parent = await this.getThread(parentId);
    if (!parent) {
      throw new Error(`Parent thread ${parentId} not found`);
    }

    const [newThread] = await db
      .insert(agentThreads)
      .values({
        parentId,
        workspaceId: parent.workspaceId,
        agentType: parent.agentType,
        status: "forked",
        currentPhase: parent.currentPhase,
        metadata: metadata ?? {},
      })
      .returning();

    const parentEvents = await this.getThreadHistory(parentId);
    if (parentEvents.length > 0) {
      await db.insert(threadEvents).values(
        parentEvents.map((event) => ({
          threadId: newThread.id,
          eventType: event.eventType,
          eventVersion: event.eventVersion,
          payload: event.payload,
        })),
      );
    }

    const latestSnapshot = await this.getLatestSnapshot(parentId);
    if (latestSnapshot) {
      await db.insert(threadSnapshots).values({
        threadId: newThread.id,
        eventIndex: latestSnapshot.eventIndex,
        phase: latestSnapshot.phase,
        state: latestSnapshot.state,
      });
    }

    return newThread;
  }

  async correctEvent(
    eventId: string,
    correctedPayload: Record<string, unknown>,
    reason: string,
  ): Promise<void> {
    await db.insert(eventCorrections).values({
      originalEventId: eventId,
      correctedPayload,
      reason,
    });

    await db
      .update(threadEvents)
      .set({ payload: correctedPayload })
      .where(eq(threadEvents.id, eventId));
  }

  async listThreads(
    workspaceId: string,
    options?: {
      status?: ThreadStatus;
      limit?: number;
      offset?: number;
    },
  ): Promise<AgentThread[]> {
    const query = db
      .select()
      .from(agentThreads)
      .where(eq(agentThreads.workspaceId, workspaceId))
      .orderBy(desc(agentThreads.updatedAt));

    let result = await query;
    if (options?.status) {
      result = result.filter((t) => t.status === options.status);
    }
    if (options?.offset) {
      result = result.slice(options.offset);
    }
    if (options?.limit) {
      result = result.slice(0, options.limit);
    }
    return result;
  }

  async getChildThreads(parentId: string): Promise<AgentThread[]> {
    return db.select().from(agentThreads).where(eq(agentThreads.parentId, parentId));
  }
}

export const threadRepository = new ThreadRepository();
