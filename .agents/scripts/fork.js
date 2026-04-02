#!/usr/bin/env node

const { threadRepository } = require("../../apps/api/src/lib/agent/repository.js");

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const threadId = args[1];

  if (!command) {
    console.log("Usage:");
    console.log("  node fork.js fork <thread-id>     - Fork a thread");
    console.log("  node fork.js list <thread-id>     - List child threads");
    console.log("  node fork.js history <thread-id>  - Show thread history");
    console.log("  node fork.js snapshot <thread-id> - Show latest snapshot");
    process.exit(1);
  }

  switch (command) {
    case "fork": {
      if (!threadId) {
        console.error("Error: thread-id required for fork");
        process.exit(1);
      }

      const metadata = args[2] ? JSON.parse(args[2]) : {};
      const newThread = await threadRepository.forkThread(threadId, metadata);
      console.log(`Forked thread ${threadId} -> ${newThread.id}`);
      console.log(`Status: ${newThread.status}`);
      console.log(`Phase: ${newThread.currentPhase}`);
      break;
    }

    case "list": {
      if (!threadId) {
        console.error("Error: thread-id required for list");
        process.exit(1);
      }

      const children = await threadRepository.getChildThreads(threadId);
      if (children.length === 0) {
        console.log("No child threads found");
      } else {
        console.log(`Child threads of ${threadId}:`);
        for (const child of children) {
          console.log(`  - ${child.id} (${child.status}) - Phase: ${child.currentPhase}`);
        }
      }
      break;
    }

    case "history": {
      if (!threadId) {
        console.error("Error: thread-id required for history");
        process.exit(1);
      }

      const history = await threadRepository.getThreadHistory(threadId);
      console.log(`Thread ${threadId} history (${history.length} events):`);
      for (const event of history) {
        console.log(`  [${event.createdAt.toISOString()}] ${event.eventType}`);
      }
      break;
    }

    case "snapshot": {
      if (!threadId) {
        console.error("Error: thread-id required for snapshot");
        process.exit(1);
      }

      const snapshot = await threadRepository.getLatestSnapshot(threadId);
      if (!snapshot) {
        console.log("No snapshots found");
      } else {
        console.log(`Latest snapshot for ${threadId}:`);
        console.log(`  Phase: ${snapshot.phase}`);
        console.log(`  Event Index: ${snapshot.eventIndex}`);
        console.log(`  Created: ${snapshot.createdAt.toISOString()}`);
      }
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
