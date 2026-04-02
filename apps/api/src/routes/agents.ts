import type { FastifyInstance } from "fastify";
import { threadRepository } from "../lib/agent/repository.js";
import { promptLoader } from "../lib/agent/prompt-loader.js";
import { contextManager } from "../lib/agent/context/index.js";
import { logger } from "../logger.js";
import { requireRole } from "../plugins/auth.js";

export async function agentRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", requireRole("viewer"));

  fastify.post("/agents/run", async (request, reply) => {
    const body = request.body as {
      workspaceId: string;
      promptType: "do-work" | "plan" | "review";
      promptPhase?: string;
      agentType?: string;
      variables?: Record<string, string>;
      instructions?: string;
      ragDocs?: string[];
      memory?: string[];
      contextConfig?: Record<string, unknown>;
    };

    if (!body.workspaceId) {
      return reply.code(400).send({ error: "workspaceId required" });
    }
    if (!body.promptType) {
      return reply.code(400).send({ error: "promptType required" });
    }

    try {
      const prompt = await promptLoader.load({
        type: body.promptType,
        phase: body.promptPhase,
      });

      const renderedPrompt = promptLoader.render(prompt.content, body.variables ?? {});

      const thread = await threadRepository.createThread({
        workspaceId: body.workspaceId,
        agentType: body.agentType ?? body.promptType,
        metadata: {
          promptType: body.promptType,
          promptPhase: body.promptPhase,
        },
      });

      await threadRepository.emitEvent({
        threadId: thread.id,
        eventType: "ThreadStarted",
        payload: {
          agentType: body.promptType,
          workspaceId: body.workspaceId,
          initialContext: {
            prompt: prompt.type,
            phase: body.promptPhase,
          },
        },
      });

      if (body.contextConfig) {
        contextManager.updateConfig(body.contextConfig);
      }

      const context = await contextManager.buildContext(thread.id, {
        prompt: renderedPrompt,
        instructions: body.instructions,
        ragDocs: body.ragDocs,
        memory: body.memory,
      });

      await threadRepository.emitEvent({
        threadId: thread.id,
        eventType: "PhaseStarted",
        payload: {
          phase: body.promptPhase ?? "explore",
          tasks: [],
        },
      });

      const serializedContext = contextManager.serializeContext(context);

      logger.info(
        { threadId: thread.id, tokens: context.totalTokens, promptType: body.promptType },
        "Agent run started",
      );

      return reply.code(201).send({
        threadId: thread.id,
        status: thread.status,
        prompt: {
          type: prompt.type,
          phase: prompt.phase,
          length: renderedPrompt.length,
        },
        context: {
          tokens: context.totalTokens,
          format: contextManager.getConfig().format,
        },
        serializedContext,
      });
    } catch (error) {
      logger.error({ error }, "Failed to start agent run");
      return reply.code(500).send({
        error: "Failed to start agent run",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  fastify.get("/agents/:threadId", async (request, reply) => {
    const { threadId } = request.params as { threadId: string };

    const thread = await threadRepository.getThread(threadId);
    if (!thread) {
      return reply.code(404).send({ error: "Thread not found" });
    }

    const events = await threadRepository.getThreadEvents(threadId);
    const snapshot = await threadRepository.getLatestSnapshot(threadId);

    return reply.send({
      thread,
      events: events.length,
      snapshot: snapshot
        ? {
            phase: snapshot.phase,
            eventIndex: snapshot.eventIndex,
            createdAt: snapshot.createdAt,
          }
        : null,
    });
  });

  fastify.get("/agents/:threadId/history", async (request, reply) => {
    const { threadId } = request.params as { threadId: string };

    const thread = await threadRepository.getThread(threadId);
    if (!thread) {
      return reply.code(404).send({ error: "Thread not found" });
    }

    const events = await threadRepository.getThreadHistory(threadId);

    return reply.send({
      threadId,
      events,
    });
  });

  fastify.post("/agents/:threadId/pause", async (request, reply) => {
    const { threadId } = request.params as { threadId: string };
    const body = request.body as { reason?: string };

    const thread = await threadRepository.getThread(threadId);
    if (!thread) {
      return reply.code(404).send({ error: "Thread not found" });
    }

    await threadRepository.emitEvent({
      threadId,
      eventType: "ThreadPaused",
      payload: { reason: body?.reason ?? "Manual pause" },
    });

    await threadRepository.updateThreadStatus(threadId, "paused");

    return reply.send({ status: "paused" });
  });

  fastify.post("/agents/:threadId/resume", async (request, reply) => {
    const { threadId } = request.params as { threadId: string };

    const thread = await threadRepository.getThread(threadId);
    if (!thread) {
      return reply.code(404).send({ error: "Thread not found" });
    }

    await threadRepository.emitEvent({
      threadId,
      eventType: "ThreadResumed",
      payload: {},
    });

    await threadRepository.updateThreadStatus(threadId, "running");

    return reply.send({ status: "running" });
  });

  fastify.post("/agents/:threadId/fork", async (request, reply) => {
    const { threadId } = request.params as { threadId: string };
    const body = request.body as { metadata?: Record<string, unknown> };

    const thread = await threadRepository.getThread(threadId);
    if (!thread) {
      return reply.code(404).send({ error: "Thread not found" });
    }

    const newThread = await threadRepository.forkThread(threadId, body?.metadata);

    await threadRepository.emitEvent({
      threadId: newThread.id,
      eventType: "ThreadForked",
      payload: {
        newThreadId: newThread.id,
        parentThreadId: threadId,
      },
    });

    return reply.code(201).send({
      threadId: newThread.id,
      parentId: threadId,
      status: newThread.status,
    });
  });

  fastify.get("/agents", async (request, reply) => {
    const query = request.query as {
      workspaceId?: string;
      status?: string;
      limit?: string;
      offset?: string;
    };

    if (!query.workspaceId) {
      return reply.code(400).send({ error: "workspaceId required" });
    }

    const threads = await threadRepository.listThreads(query.workspaceId, {
      status: query.status as any,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
      offset: query.offset ? parseInt(query.offset, 10) : undefined,
    });

    return reply.send({
      threads: threads.map((t) => ({
        id: t.id,
        status: t.status,
        agentType: t.agentType,
        currentPhase: t.currentPhase,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
    });
  });

  fastify.post("/agents/:threadId/context", async (request, reply) => {
    const { threadId } = request.params as { threadId: string };
    const body = request.body as {
      prompt?: string;
      instructions?: string;
      ragDocs?: string[];
      memory?: string[];
    };

    const thread = await threadRepository.getThread(threadId);
    if (!thread) {
      return reply.code(404).send({ error: "Thread not found" });
    }

    const context = await contextManager.buildContext(threadId, {
      prompt: body?.prompt,
      instructions: body?.instructions,
      ragDocs: body?.ragDocs,
      memory: body?.memory,
    });

    return reply.send({
      threadId,
      tokens: context.totalTokens,
      format: contextManager.getConfig().format,
      serialized: contextManager.serializeContext(context),
    });
  });
}
