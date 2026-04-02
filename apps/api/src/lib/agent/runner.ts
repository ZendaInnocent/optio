import { threadRepository, type AgentThread } from "./repository.js";
import { contextManager } from "./context/index.js";
import type { ContextConfig } from "./context/index.js";
import { promptLoader } from "./prompt-loader.js";
import type { PromptVariables } from "./prompt-loader.js";
import { handlers } from "./handlers/index.js";
import { logger } from "../../logger.js";

export interface AgentRunConfig {
  workspaceId: string;
  promptType: "do-work" | "plan" | "review";
  promptPhase?: string;
  agentType?: string;
  contextConfig?: Partial<ContextConfig>;
  maxRetries?: number;
  metadata?: Record<string, unknown>;
}

export interface AgentRunOptions {
  threadId?: string;
  prompt?: string;
  instructions?: string;
  ragDocs?: string[];
  memory?: string[];
  variables?: PromptVariables;
}

export interface AgentRunResult {
  threadId: string;
  status: string;
  phase: string | null;
  events: number;
  duration: number;
  error?: string;
}

export class AgentRunner {
  private running = new Map<string, boolean>();

  async start(config: AgentRunConfig, options: AgentRunOptions = {}): Promise<AgentRunResult> {
    const startTime = Date.now();

    let thread: AgentThread;
    if (options.threadId) {
      const existing = await threadRepository.getThread(options.threadId);
      if (!existing) {
        throw new Error(`Thread ${options.threadId} not found`);
      }
      thread = existing;
    } else {
      thread = await threadRepository.createThread({
        workspaceId: config.workspaceId,
        agentType: config.agentType ?? "do-work",
        metadata: config.metadata,
      });
    }

    if (config.contextConfig) {
      contextManager.updateConfig(config.contextConfig);
    }

    this.running.set(thread.id, true);

    try {
      const prompt = await promptLoader.load({
        type: config.promptType,
        phase: config.promptPhase,
      });

      const renderedPrompt = options.prompt
        ? options.prompt
        : promptLoader.render(prompt.content, options.variables ?? {});

      await threadRepository.emitEvent({
        threadId: thread.id,
        eventType: "ThreadStarted",
        payload: {
          agentType: config.promptType,
          workspaceId: config.workspaceId,
          initialContext: {
            prompt: prompt.type,
            phase: config.promptPhase,
          },
        },
      });

      const context = await contextManager.buildContext(thread.id, {
        prompt: renderedPrompt,
        instructions: options.instructions,
        ragDocs: options.ragDocs,
        memory: options.memory,
      });

      await threadRepository.emitEvent({
        threadId: thread.id,
        eventType: "PhaseStarted",
        payload: {
          phase: config.promptPhase ?? "explore",
          tasks: [],
        },
      });

      const serializedContext = contextManager.serializeContext(context);
      logger.info({ threadId: thread.id, tokens: context.totalTokens }, "Context built");

      const result = await this.executeThread(thread.id, config.maxRetries ?? 3);

      const duration = Date.now() - startTime;
      this.running.delete(thread.id);

      return {
        threadId: thread.id,
        status: result.status,
        phase: result.phase,
        events: result.events,
        duration,
        error: result.error,
      };
    } catch (error) {
      this.running.delete(thread.id);

      await threadRepository.emitEvent({
        threadId: thread.id,
        eventType: "ThreadFailed",
        payload: {
          error: error instanceof Error ? error.message : String(error),
          lastPhase: config.promptPhase ?? "unknown",
        },
      });

      await threadRepository.updateThreadStatus(thread.id, "failed");

      return {
        threadId: thread.id,
        status: "failed",
        phase: config.promptPhase ?? null,
        events: 0,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async executeThread(
    threadId: string,
    maxRetries: number,
  ): Promise<{ status: string; phase: string | null; events: number; error?: string }> {
    const thread = await threadRepository.getThread(threadId);
    if (!thread) {
      return { status: "failed", phase: null, events: 0, error: "Thread not found" };
    }

    let events = await threadRepository.getThreadEvents(threadId);
    const maxEvents = 1000;

    while (events.length < maxEvents && this.running.get(threadId)) {
      const lastEvent = events[events.length - 1];
      if (!lastEvent) break;

      const handler = handlers[lastEvent.eventType];
      if (!handler) {
        logger.warn({ eventType: lastEvent.eventType }, "No handler for event");
        break;
      }

      try {
        const result = await handler({
          threadId,
          event: lastEvent,
        });

        if (result.nextEvent) {
          await threadRepository.emitEvent({
            threadId,
            eventType: result.nextEvent,
            payload: result.state ?? {},
          });
        }

        if (!result.success && !result.nextEvent) {
          if (events.length < maxRetries * 10) {
            await threadRepository.emitEvent({
              threadId,
              eventType: "CheckRetrying",
              payload: {
                checkType: lastEvent.eventType,
                attempt: events.length,
                maxAttempts: maxRetries,
              },
            });
          } else {
            await threadRepository.emitEvent({
              threadId,
              eventType: "ThreadFailed",
              payload: {
                error: result.error ?? "Handler failed",
                lastPhase: thread.currentPhase,
              },
            });
            return {
              status: "failed",
              phase: thread.currentPhase,
              events: events.length,
              error: result.error,
            };
          }
        }
      } catch (error) {
        logger.error({ threadId, error }, "Handler execution failed");
        await threadRepository.emitEvent({
          threadId,
          eventType: "ThreadPaused",
          payload: {
            reason: error instanceof Error ? error.message : String(error),
          },
        });
        return {
          status: "paused",
          phase: thread.currentPhase,
          events: events.length,
          error: error instanceof Error ? error.message : String(error),
        };
      }

      events = await threadRepository.getThreadEvents(threadId);

      const currentThread = await threadRepository.getThread(threadId);
      if (currentThread?.status === "completed" || currentThread?.status === "failed") {
        return {
          status: currentThread.status,
          phase: currentThread.currentPhase,
          events: events.length,
        };
      }
    }

    const finalThread = await threadRepository.getThread(threadId);
    return {
      status: finalThread?.status ?? "unknown",
      phase: finalThread?.currentPhase ?? null,
      events: events.length,
    };
  }

  async pause(threadId: string, reason?: string): Promise<void> {
    this.running.set(threadId, false);

    await threadRepository.emitEvent({
      threadId,
      eventType: "ThreadPaused",
      payload: { reason: reason ?? "Manual pause" },
    });

    await threadRepository.updateThreadStatus(threadId, "paused");
  }

  async resume(threadId: string): Promise<AgentRunResult> {
    const thread = await threadRepository.getThread(threadId);
    if (!thread) {
      throw new Error(`Thread ${threadId} not found`);
    }

    await threadRepository.emitEvent({
      threadId,
      eventType: "ThreadResumed",
      payload: {},
    });

    await threadRepository.updateThreadStatus(threadId, "running");

    this.running.set(threadId, true);

    const result = await this.executeThread(threadId, 3);

    return {
      threadId,
      status: result.status,
      phase: result.phase,
      events: result.events,
      duration: 0,
      error: result.error,
    };
  }

  async fork(
    threadId: string,
    metadata?: Record<string, unknown>,
  ): Promise<{ newThreadId: string }> {
    const newThread = await threadRepository.forkThread(threadId, metadata);

    await threadRepository.emitEvent({
      threadId: newThread.id,
      eventType: "ThreadForked",
      payload: {
        newThreadId: newThread.id,
        parentThreadId: threadId,
      },
    });

    return { newThreadId: newThread.id };
  }

  isRunning(threadId: string): boolean {
    return this.running.get(threadId) ?? false;
  }
}

export const agentRunner = new AgentRunner();
