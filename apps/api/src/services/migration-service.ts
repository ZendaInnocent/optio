import { db } from "../db/client.js";
import {
  tasks,
  interactiveSessions,
  taskLogs,
  sessionMessages,
  sessionPrs,
  taskDependencies,
  repos,
  workspaces,
} from "../db/schema.js";
import { agentRuns } from "../db/schema/agent-runs.js";
import { agentRunEvents } from "../db/schema/agent-run-events.js";
import { agentRunPrs } from "../db/schema/agent-run-prs.js";
import { eq, sql } from "drizzle-orm";

/**
 * Migration service to migrate legacy data (tasks, interactive_sessions) to unified agent_runs.
 */
export class MigrationService {
  private logger = console; // Use proper logger in production

  /**
   * Migrate all legacy data to the new unified agent_runs schema.
   *
   * Migration order:
   * 1. Tasks (workflowType !== "plan") → agent_runs
   * 2. Interactive sessions → agent_runs
   * 3. Task dependencies → agent_runs.metadata.dependsOn
   * 4. Task logs → agent_run_events (type: "log")
   * 5. Session messages → agent_run_events (type: "message")
   * 6. Session PRs → agent_run_prs
   */
  async migrateAll() {
    this.logger.info("Starting unified agent runs migration");

    // Step 1: Build repoUrl → (repoId, workspaceId) map
    const repoMap = await this.buildRepoMap();

    // Step 2: Build taskId → dependsOn[] map from task_dependencies
    const dependenciesMap = await this.buildDependenciesMap();

    // Step 3: Migrate tasks (excluding plan workflow type)
    await this.migrateTasks(repoMap, dependenciesMap);

    // Step 4: Migrate interactive sessions
    await this.migrateInteractiveSessions(repoMap);

    // Step 5: Migrate task logs to events
    await this.migrateTaskLogs();

    // Step 6: Migrate session messages to events
    await this.migrateSessionMessages();

    // Step 7: Migrate session PRs (tasks have PRs in tasks table directly, not migrated here)
    await this.migrateSessionPrs();

    this.logger.info("Migration completed successfully");
  }

  private async buildRepoMap(): Promise<
    Map<string, { repoId: string; workspaceId: string | null }>
  > {
    const allRepos = await db.select().from(repos);
    const map = new Map<string, { repoId: string; workspaceId: string | null }>();
    for (const repo of allRepos) {
      map.set(repo.repoUrl, { repoId: repo.id, workspaceId: repo.workspaceId });
    }
    return map;
  }

  private async buildDependenciesMap(): Promise<Map<string, string[]>> {
    const deps = await db.select().from(taskDependencies);
    const map = new Map<string, string[]>();

    for (const dep of deps) {
      const existing = map.get(dep.taskId) || [];
      existing.push(dep.dependsOnTaskId);
      map.set(dep.taskId, existing);
    }

    return map;
  }

  private async migrateTasks(
    repoMap: Map<string, { repoId: string; workspaceId: string | null }>,
    dependenciesMap: Map<string, string[]>,
  ) {
    const allTasks = await db.select().from(tasks);
    let migratedCount = 0;

    for (const task of allTasks) {
      // Skip plan workflow tasks
      if (task.workflowType === "plan") {
        continue;
      }

      // Find repo mapping
      const repoInfo = repoMap.get(task.repoUrl);
      if (!repoInfo) {
        this.logger.warn(`Skipping task ${task.id}: repoUrl not found in repos table`, {
          repoUrl: task.repoUrl,
        });
        continue;
      }

      // Map state: taskStateEnum → agentRunState
      // Direct mapping for common states, defaults to "failed" for unmapped
      let state: string;
      switch (task.state) {
        case "pending":
        case "waiting_on_deps":
        case "queued":
        case "provisioning":
        case "running":
        case "needs_attention":
        case "pr_opened":
        case "completed":
        case "failed":
        case "cancelled":
          state = task.state;
          break;
        default:
          this.logger.warn(`Unknown task state ${task.state}, defaulting to failed`, {
            taskId: task.id,
          });
          state = "failed";
      }

      // Parse costUsd from string to number
      const costUsd = this.parseCost(task.costUsd);

      // Get dependsOn array
      const dependsOn = dependenciesMap.get(task.id) || [];

      await db
        .insert(agentRuns)
        .values({
          id: task.id,
          workspaceId:
            repoInfo.workspaceId ||
            task.workspaceId ||
            sql`'00000000-0000-0000-0000-000000000000'::uuid`,
          repoId: repoInfo.repoId,
          title: task.title,
          initialPrompt: task.prompt,
          mode: "autonomous",
          state: state as any,
          agentType: task.agentType,
          model: task.modelUsed,
          branchName: task.repoBranch,
          worktreePath: null,
          sessionId: task.sessionId,
          prUrl: task.prUrl || null,
          costUsd: costUsd.toString(),
          maxTurns: 50,
          metadata: { dependsOn },
          createdAt: task.createdAt,
          updatedAt: task.updatedAt,
          endedAt: task.completedAt,
        } as any)
        .onConflictDoNothing();

      migratedCount++;
    }

    this.logger.info(`Migrated ${migratedCount} tasks to agent_runs`);
  }

  private async migrateInteractiveSessions(
    repoMap: Map<string, { repoId: string; workspaceId: string | null }>,
  ) {
    const allSessions = await db.select().from(interactiveSessions);
    let migratedCount = 0;

    for (const session of allSessions) {
      const repoInfo = repoMap.get(session.repoUrl);
      if (!repoInfo) {
        this.logger.warn(`Skipping session ${session.id}: repoUrl not found in repos table`, {
          repoUrl: session.repoUrl,
        });
        continue;
      }

      // Determine state: if endedAt is set, use "completed"
      const state = session.endedAt ? "completed" : "running";

      const costUsd = this.parseCost(session.costUsd);

      await db
        .insert(agentRuns)
        .values({
          id: session.id,
          workspaceId: repoInfo.workspaceId || sql`'00000000-0000-0000-0000-000000000000'::uuid`,
          repoId: repoInfo.repoId,
          title: `Interactive session ${session.id}`,
          initialPrompt: "",
          mode: "interactive",
          state: state as any,
          agentType: session.agentType,
          model: session.model,
          worktreePath: session.worktreePath || null,
          branchName: session.branch,
          sessionId: null,
          prUrl: null,
          costUsd: costUsd.toString(),
          maxTurns: 100,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          endedAt: session.endedAt,
        } as any)
        .onConflictDoNothing();

      migratedCount++;
    }

    this.logger.info(`Migrated ${migratedCount} interactive sessions to agent_runs`);
  }

  private async migrateTaskLogs() {
    const logs = await db.select().from(taskLogs);

    for (const log of logs) {
      await db
        .insert(agentRunEvents)
        .values({
          agentRunId: log.taskId,
          timestamp: log.timestamp,
          type: "log",
          content: {
            type: "log",
            text: log.content,
            stream: log.stream,
            logType: log.logType || "text",
          },
          turn: null,
        } as any)
        .onConflictDoNothing();
    }

    this.logger.info(`Migrated ${logs.length} task logs to agent_run_events`);
  }

  private async migrateSessionMessages() {
    const messages = await db.select().from(sessionMessages);

    for (const msg of messages) {
      await db
        .insert(agentRunEvents)
        .values({
          agentRunId: msg.sessionId,
          timestamp: msg.timestamp,
          type: "message",
          content: { type: "message", role: this.mapRole(msg.role), content: msg.content },
          turn: null,
        } as any)
        .onConflictDoNothing();
    }

    this.logger.info(`Migrated ${messages.length} session messages to agent_run_events`);
  }

  private async migrateSessionPrs() {
    const prs = await db.select().from(sessionPrs);

    for (const spr of prs) {
      // Generate new ID for agent_run_prs
      await db.insert(agentRunPrs).values({
        id: sql`gen_random_uuid()`, // Generate new UUID
        agentRunId: spr.sessionId,
        prUrl: spr.prUrl,
        prNumber: spr.prNumber,
        title: null,
        state: spr.prState || null,
        createdAt: spr.createdAt,
      } as any);
    }

    this.logger.info(`Migrated ${prs.length} session PRs to agent_run_prs`);
  }

  private parseCost(cost: string | null | undefined): number {
    if (!cost) return 0;
    const parsed = parseFloat(cost);
    return isNaN(parsed) ? 0 : parsed;
  }

  private mapRole(role: string): "user" | "assistant" {
    if (role === "user") return "user";
    if (role === "assistant") return "assistant";
    // Map any other role to user as fallback
    return "user";
  }
}

export const migrationService = new MigrationService();
