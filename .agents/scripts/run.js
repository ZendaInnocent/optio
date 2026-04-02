#!/usr/bin/env node

const { threadRepository } = require("../../apps/api/src/lib/agent/repository.js");
const { handlers } = require("./agents/events/handlers/mechanical/index.js");
const fs = require("fs");
const path = require("path");

const MAX_RETRIES = 3;
const POLL_INTERVAL = 1000;

class EventLoopExecutor {
  constructor(options = {}) {
    this.threadId = options.threadId;
    this.running = false;
    this.currentEventIndex = 0;
    this.retryCounts = {};
    this.maxRetries = options.maxRetries ?? MAX_RETRIES;
    this.onEvent = options.onEvent ?? (() => {});
    this.onError = options.onError ?? console.error;
  }

  async start() {
    if (this.running) {
      throw new Error("Executor already running");
    }

    this.running = true;
    console.log(`Starting event loop for thread ${this.threadId}`);

    const thread = await threadRepository.getThread(this.threadId);
    if (!thread) {
      throw new Error(`Thread ${this.threadId} not found`);
    }

    if (thread.status === "completed") {
      console.log("Thread already completed");
      return;
    }

    if (thread.status === "paused") {
      console.log("Thread paused, resuming...");
      await threadRepository.updateThreadStatus(this.threadId, "running");
    }

    await this.processEvents();
  }

  async stop() {
    this.running = false;
    console.log("Event loop stopped");
  }

  async processEvents() {
    let lastEventCount = 0;
    let idleCount = 0;

    while (this.running) {
      const events = await threadRepository.getThreadEvents(this.threadId);
      const newEvents = events.slice(lastEventCount);

      if (newEvents.length === 0) {
        idleCount++;
        if (idleCount > 10) {
          console.log("No new events, checking thread status...");
          const thread = await threadRepository.getThread(this.threadId);
          if (thread?.status === "completed" || thread?.status === "failed") {
            console.log(`Thread ${thread.status}`);
            break;
          }
          idleCount = 0;
        }
        await this.sleep(POLL_INTERVAL);
        continue;
      }

      idleCount = 0;

      for (const event of newEvents) {
        const result = await this.handleEvent(event);
        lastEventCount++;

        if (result?.nextEvent) {
          await threadRepository.emitEvent({
            threadId: this.threadId,
            eventType: result.nextEvent,
            payload: result.state ?? {},
          });
        }

        if (!result?.success && !result?.nextEvent) {
          await this.handleError(event, result?.error);
        }

        await this.onEvent(event, result);
      }
    }
  }

  async handleEvent(event) {
    const handler = handlers[event.eventType];
    if (!handler) {
      console.log(`No handler for event type: ${event.eventType}`);
      return { success: true };
    }

    const retryKey = `${event.eventType}:${event.id}`;
    const attempt = this.retryCounts[retryKey] ?? 1;
    this.retryCounts[retryKey] = attempt;

    try {
      const result = await handler({
        threadId: this.threadId,
        event,
      });
      return result;
    } catch (error) {
      if (attempt < this.maxRetries) {
        console.log(`Handler failed for ${event.eventType}, retry ${attempt}/${this.maxRetries}`);
        this.retryCounts[retryKey] = attempt + 1;
        await this.sleep(POLL_INTERVAL * attempt);
        return this.handleEvent(event);
      }

      return {
        success: false,
        error: error.message,
      };
    }
  }

  async handleError(event, errorMessage) {
    console.error(`Event ${event.eventType} failed: ${errorMessage}`);

    await threadRepository.emitEvent({
      threadId: this.threadId,
      eventType: "ThreadPaused",
      payload: {
        reason: `Failed to handle ${event.eventType}: ${errorMessage}`,
        failedEventId: event.id,
      },
    });

    await threadRepository.updateThreadStatus(this.threadId, "paused");

    this.onError(event, errorMessage);
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

async function main() {
  const args = process.argv.slice(2);
  const threadId = args[0];

  if (!threadId) {
    console.error("Usage: node run.js <thread-id>");
    process.exit(1);
  }

  const executor = new EventLoopExecutor({
    threadId,
    onEvent: (event, result) => {
      console.log(`[EVENT] ${event.eventType}: ${result?.success ? "OK" : "FAILED"}`);
    },
    onError: (event, error) => {
      console.error(`[ERROR] ${event.eventType}: ${error}`);
    },
  });

  process.on("SIGINT", async () => {
    console.log("\nStopping executor...");
    await executor.stop();
    process.exit(0);
  });

  await executor.start();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { EventLoopExecutor };
