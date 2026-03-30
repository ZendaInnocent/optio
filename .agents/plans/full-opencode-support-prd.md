# Full OpenCode Support in Optio

## Problem Statement

Optio aims to support multiple AI coding agents, but the current OpenCode integration is incomplete and not production-ready. While basic scaffolding exists (agent adapter registration, Docker image installation, UI dropdown option), critical gaps prevent reliable use:

- **No dedicated event parser** - OpenCode output is parsed using Claude Code's parser, assuming identical NDJSON format without verification
- **Missing repository configuration** - OpenCode-specific settings (model, temperature, top_p) exist in the database but are not exposed in the UI or API schema
- **No authentication setup** - The setup wizard doesn't support OpenCode API key configuration or validation
- **Uncertain CLI usage** - The entrypoint uses `opencode --prompt` but the official CLI is `opencode run`; the output format and `--json` flag behavior are not documented/verified
- **No cost calculation fallback** - Unlike Codex adapter, there's no pricing model if `total_cost_usd` isn't provided
- **Lack of testing** - The adapter tests exist but there's no integration testing with real OpenCode output
- **Documentation gap** - OpenCode is not mentioned in README or CHANGELOG

Without completing this integration, users cannot reliably select OpenCode as their agent, leading to broken tasks and unclear error states.

## Solution

Complete the OpenCode integration to achieve feature parity with Claude Code and Codex adapters:

1. **Verify and implement correct CLI invocation** - Use `opencode run` with appropriate flags for JSON output
2. **Create dedicated event parser** - Parse OpenCode's actual output format (whether NDJSON, SSE, or plain text) into structured log entries
3. **Add full configuration support** - Expose model, temperature, and top_p settings in repository settings UI and API
4. **Implement authentication** - Support OPENCODE_API_KEY and provider-specific credentials via secrets management
5. **Add cost tracking** - Either parse from output or calculate based on token usage with pricing data
6. **Update entrypoint script** - Handle OpenCode auth, config file creation, and proper argument passing
7. **Comprehensive testing** - Unit tests, parser tests with sample output, and integration tests
8. **Documentation** - Update README, CHANGELOG, and in-app help text

## User Stories

1. As an Optio user, I want to select OpenCode as my agent when creating a task, so that I can use this AI provider for my coding workflows
2. As a repository administrator, I want to configure the OpenCode model (e.g., `anthropic/claude-sonnet-4-20250514`) for my repository, so that tasks use the appropriate model for my needs
3. As a user, I want to set the temperature and top_p for OpenCode tasks, so that I can control response creativity and determinism
4. As a user, I want to provide my OpenCode API key during setup, so that the system can authenticate with the OpenCode service
5. As a user, I want to see accurate token usage and cost information for OpenCode tasks, so that I can monitor and control spending
6. As a developer, I want OpenCode's output to be correctly parsed into structured logs (text, tool use, thinking, errors), so that I can follow the agent's reasoning in real-time
7. As a user, I want OpenCode tasks to automatically create PRs when complete, so that I can review and merge the changes
8. As a developer, I want the OpenCode adapter to fail gracefully with clear error messages when misconfigured, so that I can troubleshoot quickly
9. As a system administrator, I want the OpenCode container image to include the correct CLI package (`opencode-ai`), so that tasks execute without missing dependencies
10. As a user, I want OpenCode to be listed as an available agent in the web UI with proper display name and description
11. As a developer, I want comprehensive unit and integration tests for the OpenCode adapter, so that changes don't break functionality
12. As a documentation writer, I want OpenCode support to be documented in README and CHANGELOG, so that users know this agent is available and how to configure it

## Implementation Decisions

### Modules to Build/Modify

**1. Agent Adapter: `packages/agent-adapters/src/opencode.ts`**

Current implementation needs review and potential restructuring:

- Verify `buildContainerConfig` creates `.opencode/opencode.json` correctly
- Add support for authentication via OPENCODE_API_KEY or provider-specific env vars (ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.)
- Consider adding `maxTurns` or timeout settings if needed
- Update `parseResult` to handle actual OpenCode output format; may need to implement NDJSON parsing, SSE detection, or plain text fallback
- Add cost calculation fallback using token usage + known pricing if `total_cost_usd` not provided
- Extract model information from output reliably

**2. Event Parser: `apps/api/src/services/opencode-event-parser.ts` (NEW)**

Create a dedicated parser module similar to `codex-event-parser.ts` and `agent-event-parser.ts`:

- Input: raw line from stdout, taskId
- Output: `{ entries: AgentLogEntry[], sessionId?: string }`
- Handle multiple possible output formats:
  - If NDJSON with Claude-compatible events, reuse some logic from `agent-event-parser`
  - If SSE format, extract data from `data:` lines
  - If plain text, filter control sequences and emit as text entries
- Detect PR URLs, errors, usage data, and model information
- Return typed log entries: `text`, `tool_use`, `tool_result`, `thinking`, `system`, `error`, `info`

**3. Entrypoint Script: `scripts/agent-entrypoint.sh`**

Update the case statement for `opencode`:

- Use correct command: `opencode run` (not `--prompt`)
- Determine if `--json` flag exists and what it does; if it outputs NDJSON, use it; if not, consider alternatives like `--verbose` or using the ACP server mode
- Set up authentication: source OPENCODE_API_KEY or provider-specific API keys from environment
- Optionally write opencode.json configuration to worktree if parameters provided
- Consider using `opencode serve` in background and connecting via `--attach` for persistent session benefits
- Ensure proper exit code propagation
- Add better error handling and diagnostic output

**4. API Schema: `apps/api/src/routes/repos.ts`**

Extend `updateRepoSchema` to include OpenCode configuration:

- `opencodeModel?: z.string()`
- `opencodeTemperature?: z.number().min(0).max(1)`
- `opencodeTopP?: z.number().min(0).max(1).optional()`
- Also add to the `RepoRecord` type in `repo-service.ts`

**5. Web UI: `apps/web/src/app/repos/[id]/page.tsx`**

Add form fields for OpenCode settings:

- Model input (text, with suggestions from an API endpoint listing known models like `anthropic/claude-sonnet-4-20250514`, `openai/gpt-4.1`, etc.)
- Temperature slider (0-1)
- Top P input (optional)
- Save these along with other repo settings via the existing API

**6. Web UI: `apps/web/src/app/setup/page.tsx`**

Add OpenCode configuration step or integrate into Agent Keys step:

- Input field for OPENCODE_API_KEY with validation (call existing `/api/auth/validate-opencode` or similar)
- Option to skip/disable OpenCode if not desired
- Store the API key as a secret using existing secret service

**7. API Routes: OpenCode Auth Validation (NEW)**

Create endpoint (or reuse generic provider validation):

- `POST /api/auth/validate-opencode` - takes API key, tests it against OpenCode provider or models list, returns validity
- Could also have `GET /api/agents/opencode/models` to list available models for the authenticated provider

**8. Task Worker: `apps/api/src/workers/task-worker.ts`**

- Import and use `parseOpencodeEvent` in the event parsing logic (add case for `task.agentType === "opencode"`)
- Consider if OpenCode needs special handling for turn limits or session management
- Update PR detection if OpenCode uses different PR output format
- Ensure needed secrets (OPENCODE_API_KEY or provider keys) are injected into the container

**9. Codex Adapter Parity Review**

Review `codex.ts` to see if it should be used as a template for improving opencode.ts:

- Codex has a `parseLogs` method with cost calculation fallback
- Codex uses `buildPrompt` fallback when no rendered prompt; opencode currently doesn't have a fallback builder
- Consider adding similar fallback prompt construction to opencode adapter

**10. Tests**

- Update `opencode.test.ts` to cover all edge cases, including config generation with temperature/top_p, validation of required secrets
- Add `opencode-event-parser.test.ts` with sample outputs covering:
  - NDJSON lines with usage, model, errors
  - PR URL extraction
  - Tool use/result formatting
  - Session ID detection
- Add integration tests for the full task lifecycle with opencode (may use mocks for the agent execution)
- Ensure existing adapter tests pass

**11. Documentation**

- Update `README.md` to list OpenCode as a supported agent
- Update `CHANGELOG.md` with "Added OpenCode agent support" or "Completed OpenCode integration"
- Update in-app help text or tooltips if present
- Consider adding a note in `AGENTS.md` about context-mode if relevant

### Technical Clarifications

**OpenCode CLI Invocation**: After research, the correct command should be `opencode run "<prompt>"` with optional `--json` flag (exact semantics TBD). The entrypoint will be updated accordingly. If `--json` provides NDJSON, we'll use that. If not, we may need to rely on verbose output or use the ACP server mode (`opencode serve` + `opencode run --attach`) for structured events.

**Authentication Models**: OpenCode supports multiple providers via `opencode auth`. For headless operation, we can either:

- Set `OPENCODE_API_KEY` for a default provider (likely Anthropic)
- Set provider-specific env vars like `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.
  The adapter's `validateSecrets` should accept either `OPENCODE_API_KEY` or one of the provider keys. We may want to allow users to configure which provider they use via the model name prefix (e.g., `anthropic/` vs `openai/`).

**Model Specification**: Model names follow the format `provider/model-id` (e.g., `anthropic/claude-sonnet-4-20250514`). The adapter should pass this through to the config or CLI args. We should validate that the model string contains a `/`.

**Cost Calculation**: If OpenCode does not emit `total_cost_usd`, we need a pricing table similar to Codex. Research pricing for supported models (Anthropic, OpenAI, etc.) and implement fallback calculation based on input/output tokens. Use per-1M token pricing.

**PR Detection**: OpenCode is GitHub-aware and typically creates PRs via `gh` CLI. The output should contain the PR URL. We'll parse it the same way as Claude Code. We need to verify that `gh pr create` output includes the URL and that it appears in stdout/stderr.

**Session ID**: OpenCode may not emit a session_id like Claude Code. The task worker's session tracking may remain optional; we can skip setting `sessionId` if not available.

**Tool Calls**: OpenCode's tool use format may differ from Claude Code's. The event parser must adapt to whatever format is emitted. We'll analyze real output to determine the structure.

### Deep Modules

1. **`OpencodeEventParser`** (standalone, no external deps)
   - Input: raw stdout lines + taskId
   - Output: array of structured log entries
   - Testable with sample output fixtures
   - Replace `parseOpencodeEvent` as implementation

2. **`OpencodeAdapter`** (depends on shared types)
   - Encapsulates all OpenCode-specific behavior
   - Testable in isolation with mocked input
   - Can evolve independently if OpenCode changes its CLI

3. **`OpenCodeConfig`** (data module)
   - Constant definitions: supported model names, pricing map, default temperature
   - Validation functions for model strings and numeric ranges
   - Testable without side effects

## Testing Decisions

### What Makes a Good Test

- Test external behavior, not implementation details
- For the adapter: given certain input fields, `buildContainerConfig` produces expected env vars and setup files
- For the parser: given sample stdout lines, it extracts correct entries, PR URLs, errors, and usage
- For the UI: form submission and validation work (using existing pattern)
- Tests should be deterministic, not rely on external API calls (mock secrets service)

### Which Modules Will Be Tested

- `packages/agent-adapters/src/opencode.ts` - unit tests (already exist but need review/enhancement)
- `apps/api/src/services/opencode-event-parser.ts` - new unit tests with diverse sample outputs
- `apps/api/src/routes/repos.ts` - ensure schema validation includes opencode fields (existing test coverage can be extended)
- `apps/api/src/workers/task-worker.ts` - integration test for agent type dispatch to parser (mocked exec)
- UI components: `apps/web/src/app/repos/[id]/page.tsx` - existing tests updated to include new fields

### Prior Art for Tests

- **Adapter tests**: Follow pattern in `opencode.test.ts`, `codex.test.ts` (if exists), or `claude-code` tests (there is a test file pattern in agent-adapters)
- **Parser tests**: Follow pattern in `agent-event-parser.test.ts` and `codex-event-parser.test.ts`
- **API route tests**: Follow existing test files like `repos.test.ts`, `tasks.test.ts`
- **Worker tests**: See `task-worker.test.ts` for mocking patterns

### Integration Testing

- Run a task with agentType `opencode` in a controlled environment (Docker/K8s) with a mock repository and simple fix task
- Verify: container builds, agent runs, logs are parsed, PR URL captured, task transitions to completed
- Can use a fake OpenCode binary that outputs predetermined NDJSON for testing

## Out of Scope

- **Custom image building**: The agent-language-selection PRD (`.agents/plans/agent-language-selection-prd.md`) is a separate initiative; OpenCode will use the existing container images that already include `opencode-ai` via the base image
- **Provider UI for selecting specific AI providers** beyond model name input; users must know their model strings
- **Model validation against provider API in real-time** (too expensive/slow); we'll rely on user-provided correct model names
- **Multi-provider auth management in UI** (like the `opencode auth` command); we'll store API keys as secrets and let OpenCode pick them up from environment
- **Editing opencode.json advanced config beyond model/temp/top_p**; users can use custom Dockerfile or setup scripts if they need more control
- **Telemetry for OpenCode-specific metrics** beyond what's already captured (tokens, cost, logs)
- **Support for OpenCode TUI mode or interactive sessions**; Optio only uses non-interactive mode
- **Windows native execution**; Optio runs in Linux containers, OpenCode runs in WSL2 context if needed

## Further Notes

### Research Findings

- OpenCode is installable via `npm install -g opencode-ai` (package name differs from CLI command `opencode`)
- Recommended invocation for automation is `opencode run "<prompt>"` or `opencode serve` + `--attach`
- Authentication: `opencode auth login` stores credentials in `~/.local/share/opencode/auth.json`; for containers, we can set environment variables like `OPENCODE_API_KEY` or provider-specific keys
- Configuration: supports `opencode.json` (or `.opencode/opencode.json`) with model, temperature, agent modes, etc.
- Event streaming: OpenCode has server mode with SSE events; client-server architecture exists but may be overkill for one-off tasks
- OpenCode includes gh CLI integration for PR creation, matching our current workflow

### Open Questions to Resolve During Implementation

1. **Exact stdout format of `opencode run --json`**: Need to test locally or find definitive docs. If it doesn't provide NDJSON, we may need to:
   - Use `opencode serve` in background and `opencode run --attach` to get SSE events
   - Parse verbose plain output with regex (fragile)
   - Patch opencode or request a structured output mode

2. **Session continuity**: OpenCode may have session concepts; not needed for single-run tasks

3. **Tool calling conventions**: Need to confirm OpenCode uses the same tool names (Bash, Read, Write, Edit, etc.) as Claude Code. Likely yes since it's designed to be compatible.

4. **Token usage reporting**: Does OpenCode emit usage tokens in its output? If not, we may need to rely on cost field only or approximate.

5. **Exit code semantics**: Should return 0 on success, non-zero on failure; need to verify that PR creation errors cause non-zero exit

6. **Default model**: What model should be used if none specified? The system default from OpenCode's config or Anthropic Sonnet? We'll require explicit model in repo config initially.

### Migration Path

Once implemented, existing tasks using agentType `opencode` will automatically use the new adapter and parser. No database migration is required for basic support because the `repos` table already has `opencodeModel`, `opencodeTemperature`, `opencodeTopP` fields (schema.ts lines 214-216). However, we may want to backfill defaults for existing repos if they didn't have these set.

### Performance Considerations

- OpenCode CLI startup time may be slower than Claude Code due to MCP server initialization; consider using `--attach` to reused server to avoid cold starts
- The entrypoint script could start `opencode serve` in background and connect with `--attach` if multiple turns are expected, but for single-run tasks this is unnecessary overhead

### Security

- OPENCODE_API_KEY is sensitive; store in encrypted secrets like other API keys
- OpenCode may write credentials to `~/.local/share/opencode/auth.json`; ensure this is not persisted or leaked between tasks (cleanup after run)

### Dependencies

The Docker images already install `opencode-ai` globally (base.Dockerfile line 32). No changes needed there.

### Next Steps After PRD Approval

1. **Spike**: Test OpenCode CLI locally to determine exact output format and required flags (1-2 days)
2. **Implement opencode-event-parser.ts** based on findings (2-3 days)
3. **Update entrypoint.sh** with proper command and auth (1 day)
4. **Add API schema fields and validation** (1 day)
5. **Update repository settings UI** (2-3 days)
6. **Add auth setup to wizard** (1-2 days)
7. **Update adapter** if needed (prompt fallback, cost calculation) (1-2 days)
8. **Testing** - unit, integration, manual (3-4 days)
9. **Documentation** - README, CHANGELOG, in-app (1 day)
10. **Code review and iteration** (2-3 days)

Total estimated: 2-3 weeks
