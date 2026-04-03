# Ubiquitous Language

## Core System Concepts

| Term                  | Definition                                                                                                     | Aliases to avoid                 |
| --------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| **Optio**             | Workflow orchestration system that turns coding tasks into merged pull requests                                | The system, platform, service    |
| **Task**              | A unit of work to be executed by an AI agent, representing a coding assignment                                 | Job, work item, issue            |
| **Agent**             | An AI coding assistant that executes tasks (e.g., Claude Code, Codex, OpenCode)                                | AI, model, assistant, executor   |
| **Agent Type**        | The specific kind of agent used for a task (claude-code, codex, opencode)                                      | Agent variant, provider          |
| **Agent Adapter**     | A pluggable module that adapts a specific agent's CLI and output format to Optio's interface                   | Adapter, integration             |
| **Task State**        | The current lifecycle phase of a task (pending, queued, running, etc.)                                         | Status, lifecycle stage          |
| **Feedback Loop**     | The automatic mechanism that resumes an agent when CI fails, review requests changes, or merge conflicts occur | Retry loop, auto-resume          |
| **Pod**               | An isolated Kubernetes container environment where an agent executes tasks                                     | Container, execution environment |
| **Worktree**          | An isolated Git working directory within a pod where the agent makes changes                                   | Workspace, checkout              |
| **Container Runtime** | The backend system (Docker or Kubernetes) that executes agent containers                                       | Runtime, executor                |
| **Agent Event**       | A structured log entry emitted by an agent during execution (text, tool_use, error, etc.)                      | Log entry, event                 |

## OpenCode Integration

| Term                 | Definition                                                                                         | Aliases to avoid            |
| -------------------- | -------------------------------------------------------------------------------------------------- | --------------------------- |
| **OpenCode**         | The AI coding agent integrated into Optio (opackage: opencode-ai, CLI: opencode)                   | Opencode AI, opencode-ai    |
| **OpenCode CLI**     | The command-line interface for OpenCode (`opencode` binary)                                        | CLI, command                |
| **opencode run**     | The subcommand used to execute a task non-interactively (`opencode run "<prompt>"`)                | run command                 |
| **opencode serve**   | The headless server mode that runs OpenCode as a persistent daemon                                 | serve mode, server          |
| **NDJSON**           | Newline-delimited JSON format used by agents for structured event streaming                        | NDJSON, line-delimited JSON |
| **SSE**              | Server-Sent Events, an alternative streaming format OpenCode can emit                              | Event stream                |
| **OPENCODE_API_KEY** | The primary authentication credential for OpenCode service                                         | API key, token              |
| **Provider Key**     | Authentication credential for a specific AI provider (ANTHROPIC_API_KEY, OPENAI_API_KEY)           | Provider-specific key       |
| **opencode.json**    | Configuration file that specifies model, temperature, and agent settings                           | Config file                 |
| **Model**            | The AI model identifier in format `provider/model-id` (e.g., `anthropic/claude-sonnet-4-20250514`) | LLM, AI model               |
| **Temperature**      | A parameter (0-1) controlling response randomness; lower is deterministic, higher is creative      | Temp                        |
| **top_p**            | An alternative sampling parameter that controls diversity via cumulative probability               | nucleus sampling            |
| **Agent Mode**       | A predefined configuration for specific tasks (plan, build, analyze, brainstorm)                   | Mode, agent configuration   |
| **ACP**              | Agent Client Protocol, a standardized protocol for agent communication                             | Protocol                    |
| **TUI**              | Terminal User Interface, the interactive mode of OpenCode (not used by Optio)                      | Interactive mode            |

## OpenCode Zen Models

| Term               | Definition                                                                   | Aliases to avoid |
| ------------------ | ---------------------------------------------------------------------------- | ---------------- |
| **Free Model**     | An OpenCode Zen model that can be used without an API key                    | -                |
| **Paid Model**     | An OpenCode Zen model that requires a provider-specific API key              | -                |
| **Enabled Models** | The set of OpenCode Zen models a user has enabled for use in their workspace | -                |

## Repository & Configuration

| Term                   | Definition                                                                   | Aliases to avoid            |
| ---------------------- | ---------------------------------------------------------------------------- | --------------------------- |
| **Repository**         | A Git codebase that Optio works on and creates pull requests for             | Repo, project, codebase     |
| **Workspace**          | An organizational unit in Optio containing users, repositories, and settings | Organization, team, account |
| **Prompt Template**    | A reusable system prompt that can include variables and conditionals         | Template, system prompt     |
| **Secrets Management** | The encrypted storage and controlled access to API keys and tokens           | Secrets, credentials        |
| **Container Image**    | A Docker image that provides the execution environment with necessary tools  | Image, Docker image         |
| **Entrypoint Script**  | The shell script that initializes the container and launches the agent       | Entrypoint, startup script  |
| **Setup Wizard**       | The interactive web UI flow that configures Optio for first use              | Wizard, setup flow          |

## Task Execution

| Term                | Definition                                                                                                 | Aliases to avoid          |
| ------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------- |
| **Build Job**       | A Kubernetes Job that builds a custom Docker image for a workspace or repository                           | Image build, build task   |
| **BuildJobManager** | The service class that submits build jobs, tracks status, and manages the lifecycle of custom image builds | Image builder manager     |
| **Builder Image**   | A lightweight Docker image containing the Docker CLI and build script, used inside the build job           | Build container image     |
| **DinD Sidecar**    | A Docker-in-Docker sidecar container that provides the Docker daemon for the builder container             | Docker sidecar            |
| **Build Status**    | The current state of an image build (pending, building, success, failed, cancelled)                        | Build state               |
| **PR URL**          | The GitHub pull request URL created by an agent upon completion                                            | Pull request URL, PR link |
| **Session ID**      | An identifier for a continuous agent conversation/session                                                  | Conversation ID, session  |
| **Turn**            | A single exchange or iteration within an agent's execution                                                 | Iteration, step           |
| **Token Usage**     | The count of input and output tokens consumed by the AI model                                              | Tokens, usage             |
| **Cost (USD)**      | The monetary cost incurred by an agent's execution, in US dollars                                          | Price, fee, billing       |
| **Tool Use**        | An action where the agent calls a built-in capability (Read, Write, Bash, etc.)                            | Tool call, action         |
| **Tool Result**     | The output returned from executing a tool use                                                              | Tool output, result       |

## Event Types (Structured Logs)

| Term            | Definition                                                                | Aliases to avoid            |
| --------------- | ------------------------------------------------------------------------- | --------------------------- |
| **text**        | A plain text message from the agent or its environment                    | message, output             |
| **tool_use**    | An event indicating the agent is invoking a tool with specific inputs     | action, invocation          |
| **tool_result** | The output or result from a completed tool execution                      | outcome, return             |
| **thinking**    | The agent's reasoning process, often shown as a thinking block            | reasoning, chain of thought |
| **system**      | System-level events like initialization, model loading, tool registration | init, startup               |
| **error**       | An error condition that may or may not fail the task                      | failure, exception          |
| **info**        | Informational metadata like usage statistics, completion summary          | summary, stats              |

## Relationships

- A **Workspace** contains multiple **Repositories** and multiple **Users**
- A **Task** belongs to exactly one **Workspace** and references one **Repository**
- A **Task** is executed by exactly one **Agent** of a specific **Agent Type**
- An **Agent Type** has exactly one **Agent Adapter** implementation
- An **Agent Adapter** produces container configuration and parses agent output
- A **Pod** serves one or more **Repositories** (pod-per-repo architecture)
- An agent runs inside a **Pod** using an isolated **Worktree**
- A **Task** transitions through a well-defined **Task State** machine
- The **Feedback Loop** monitors PRs and CI to decide if a **Task** should be resumed
- An **Agent Event** belongs to exactly one **Task** and has a timestamp
- **Secrets** are scoped to either global or a specific **Workspace** or **Repository**
- **Schema Validation** runs at API startup and fails fast if any **Database Migration** hasn't been applied, preventing cryptic 500 errors

## Example Dialogue

> **Dev:** "When a user creates a **Task** with **Agent Type** `opencode`, what happens?"
> **Domain expert:** "The **Task** enters the `queued` **State**. A **Task Worker** picks it, finds or creates a **Pod** for the **Repository**, and calls the **OpenCode Adapter** to build the container config."
> **Dev:** "Does the adapter set environment variables like `OPTIO_PROMPT` and `OPTIO_AGENT_TYPE`?"
> **Domain expert:** "Yes. The adapter also writes `.opencode/opencode.json` if model/temperature were configured. Then the entrypoint runs `opencode run` with the prompt."
> **Dev:** "How does OpenCode's output get into our logs?"
> **Domain expert:** "OpenCode streams **Agent Events** as NDJSON lines. The **Task Worker** uses the `parseOpencodeEvent` function to convert each line into structured entries like `text`, `tool_use`, and `thinking`. These are appended to `task_logs`."
> **Dev:** "I just reset the database with `tilt down` and now sessions are failing with 500 errors. What happened?"
> **Domain expert:** "That's **Schema Drift** — the database was wiped so `interactive_sessions` is missing columns like `agent_type`. Run `pnpm db:migrate` to apply **Database Migrations**, or check `/api/health/schema` for a diagnostic."
> **Dev:** "Does the health check catch this?"
> **Domain expert:** "Yes! The **Schema Validation** runs at API startup and checks for core tables. If columns are missing, it logs a clear error listing which tables and columns need to be added."
> **Dev:** "And how does cost get calculated if OpenCode doesn't emit `total_cost_usd`?"
> **Domain expert:** "The adapter falls back to a **pricing table** based on the model and token counts. That ensures `costUsd` is always populated for cost tracking."
> **Dev:** "So the **Agent Type** determines which **Agent Adapter** is used, and each adapter handles its own quirks?"
> **Domain expert:** "Exactly. Adding a new agent means implementing the **Agent Adapter** interface and registering it. The rest of the system—queuing, pod management, PR watching—works uniformly."

| **Session Message** | A persisted chat message in a session, with role (user/assistant), content, and timestamp | Chat message, conversation entry |
| **Message History** | The ordered collection of session messages, limited to the last 100 per session | Chat history, conversation log |

## Database & Infrastructure

| Term                   | Definition                                                                                     | Aliases to avoid          |
| ---------------------- | ---------------------------------------------------------------------------------------------- | ------------------------- |
| **Database Migration** | The process of applying schema changes (new tables, columns) to the database using Drizzle Kit | Migration, schema update  |
| **Schema**             | The database structure: tables, columns, indexes, and constraints                              | Database model, structure |
| **Schema Validation**  | The startup-time check that verifies core tables and required columns exist                    | Schema check, health      |
| **Schema Drift**       | When the database schema doesn't match the code's expected schema (missing tables or columns)  | Schema mismatch           |
| **Missing Table**      | A table that should exist in the schema but doesn't (causes query failures)                    | Table not found           |
| **Missing Column**     | A column that should exist in a table but doesn't (causes insert failures)                     | Column not found          |
| **Health Check**       | An API endpoint that verifies system readiness (database, container runtime, schema integrity) | Status check, ping        |

## Session Resume

| Term                 | Definition                                                                                                  | Aliases to avoid           |
| -------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------- |
| **Session Resume**   | The process of restoring a previous conversation state when a client reconnects to an active session        | Reconnect, session restore |
| **resume_session**   | A client→server WebSocket message type that triggers session history retrieval                              | Resume message             |
| **session_restored** | A server→client WebSocket message containing restored messages and cumulative cost                          | Restored state, catch-up   |
| **Cumulative Cost**  | The total `costUsd` accumulated across all prompts in a session, restored from the session record on resume | Total cost, session cost   |

## Flagged Ambiguities

- **"OpenCode" vs "opencode-ai"**: The npm package is `opencode-ai` but the CLI command is `opencode`. We standardize on "OpenCode" (the product) and "OpenCode CLI" (the command). Avoid referring to the package in conversation.
- **"Agent" overloaded**: Used both to mean the AI assistant (OpenCode/Claude) and the `AgentAdapter` software component. Context resolves: when discussing execution, it's the AI; when discussing code structure, it's the adapter.
- **"Model"**: Could mean the AI model (e.g., `anthropic/claude-sonnet-4`) or the database model/schema. We use "AI model" or "model ID" for the former, and "schema" or "database model" for the latter.
- **"Config"**: Ambiguous between general configuration, the specific `opencode.json` file, or the agent's container configuration. Be specific: "repo settings", "opencode.json", or "container config".
- **"Session"**: In OpenCode, a session is a continuous conversation; in Optio, a task may have a `sessionId` but it's optional. We say "OpenCode session" when referring to their concept, and "task session ID" for Optio's tracking field.
- **"Task" vs "Job"**: The PRD uses "task" consistently; avoid "job" which might confuse with BullMQ jobs or Kubernetes jobs.
- **"Provider"**: In OpenCode context, a provider is Anthropic/OpenAI/etc. In Optio context, provider might mean ticket provider (GitHub/Linear). Use "AI provider" vs "ticket provider".
- **"Setup wizard" vs "setup script"**: The web UI configuration flow is the "setup wizard"; the local dev script is `scripts/setup-local.sh`. Distinguish clearly.
- **"Migration"**: Could mean database schema migrations or BullMQ job migrations. Use "database migration" or "schema migration" for the former.
- **"Health" vs "Schema health"**: The `/api/health` endpoint checks basic connectivity; `/api/health/schema` checks table/column integrity. Keep these distinct.
