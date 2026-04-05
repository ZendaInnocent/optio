#!/usr/bin/env tsx-node

import { migrationService } from "../src/services/migration-service.js";
import { logger } from "../src/logger.js";

async function main() {
  try {
    logger.info("=== Starting Unified Agent Runs Migration ===");
    await migrationService.migrateAll();
    logger.info("=== Migration completed successfully ===");
    process.exit(0);
  } catch (error) {
    logger.error({ error }, "Migration failed");
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

main();
