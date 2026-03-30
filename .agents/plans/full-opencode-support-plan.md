# Plan: Full OpenCode Support in Optio

> Source PRD: `.agents/plans/full-opencode-support-prd.md`

## Architectural decisions

Durable decisions that apply across all phases:

- **Routes**: Agent dispatch via case statements in `scripts/agent-entrypoint.sh` and `apps/api/src/workers/task-worker.ts`
- **Schema**: Database already has `opencodeModel`, `opencodeTemperature`, `opencodeTopP` columns in `repos` table (schema.ts lines 214-216)
- **Key models**: `OpencodeAdapter` class in `packages/agent-adapters/src/opencode.ts`, new `parseOpencodeEvent` function
- **Authentication**: GITHUB_TOKEN required; OPENCODE_API_KEY or provider-specific keys (ANTHROPIC_API_KEY, OPENAI_API_KEY) optional
- **Event parsing**: Similar pattern to `codex-event-parser.ts` - parse NDJSON lines into structured log entries

---

## Phase 1: CLI Verification & Entrypoint Fix

**User stories**: #9 (container image includes correct CLI), #10 (OpenCode listed as available agent)

### What to build

Test OpenCode CLI locally to verify the correct invocation syntax. Fix `scripts/agent-entrypoint.sh` to use `opencode run` instead of `--prompt`. Add support for:

- Environment variable authentication (OPENCODE_API_KEY, provider keys)
- Optional config file creation from `.opencode/opencode.json` setup file
- Proper exit code handling

### Acceptance criteria

- [ ] Entrypoint uses correct CLI command (`opencode run "<prompt>"` or equivalent)
- [ ] Entrypoint passes OpenCode API keys from environment
- [ ] Entrypoint handles config file from setupFiles
- [ ] Entrypoint propagates exit codes correctly

---

## Phase 2: Event Parser Implementation

**User stories**: #6 (output correctly parsed into structured logs)

### What to build

Create `apps/api/src/services/opencode-event-parser.ts` following the `codex-event-parser.ts` pattern. Handle multiple possible output formats:

- NDJSON lines (reuse parsing logic if Claude-compatible)
- SSE format (extract from `data:` lines)
- Plain text fallback

Parse into typed log entries: `text`, `tool_use`, `tool_result`, `thinking`, `system`, `error`, `info`. Detect PR URLs, errors, usage data, and model information.

### Acceptance criteria

- [ ] Parser handles JSON lines and extracts structured entries
- [ ] Parser handles plain text output with ANSI escape cleanup
- [ ] Parser detects PR URLs from gh CLI output
- [ ] Parser extracts usage/cost data when present
- [ ] Parser handles error events
- [ ] Unit tests pass with sample outputs

---

## Phase 3: API Schema Exposure

**User stories**: #2 (configure OpenCode model), #3 (set temperature and top_p)

### What to build

Add OpenCode configuration fields to the repo update schema in `apps/api/src/routes/repos.ts`:

- `opencodeModel?: z.string()`
- `opencodeTemperature?: z.number().min(0).max(1)`
- `opencodeTopP?: z.number().min(0).max(1).optional()`

Verify these fields are persisted via `repo-service.ts`.

### Acceptance criteria

- [ ] API accepts opencodeModel, opencodeTemperature, opencodeTopP in update request
- [ ] Fields are validated (model required string, temp/top_p numeric ranges)
- [ ] Repo service persists fields to database
- [ ] Repo retrieval returns OpenCode settings

---

## Phase 4: Repository Settings UI

**User stories**: #2, #3

### What to build

Add form fields for OpenCode settings to the repository settings page (`apps/web/src/app/repos/[id]/page.tsx`):

- Model input (text field)
- Temperature slider (0-1)
- Top P input (optional, 0-1)
- Save via existing repo update API

### Acceptance criteria

- [ ] Form displays OpenCode configuration section
- [ ] User can input/select model name
- [ ] User can set temperature and top_p
- [ ] Settings persist after save
- [ ] Settings load correctly on page refresh

---

## Phase 5: Setup Wizard Integration

**User stories**: #4 (provide OpenCode API key during setup)

### What to build

Add OpenCode configuration to the setup wizard (`apps/web/src/app/setup/page.tsx`):

- Input field for OPENCODE_API_KEY with validation
- Option to skip/disable OpenCode if not desired
- Store API key as secret using existing secret service

### Acceptance criteria

- [ ] Setup wizard has OpenCode API key input (or integrates into existing Keys step)
- [ ] API key is validated before saving
- [ ] Key is stored as encrypted secret
- [ ] User can skip OpenCode configuration

---

## Phase 6: Adapter Enhancement

**User stories**: #1 (select OpenCode as agent), #5 (accurate token/cost info), #7 (auto-create PRs), #8 (fail gracefully)

### What to build

Enhance `packages/agent-adapters/src/opencode.ts`:

- Add cost calculation fallback using token pricing (similar to Codex adapter)
- Add prompt builder fallback when no rendered prompt available
- Update `validateSecrets` to accept OPENCODE_API_KEY or provider keys
- Ensure PR URL detection works
- Add proper error handling

Also update `task-worker.ts` to dispatch to `parseOpencodeEvent` when `agentType === "opencode"`.

### Acceptance criteria

- [ ] Adapter calculates cost from tokens if not provided in output
- [ ] Adapter builds fallback prompt if needed
- [ ] Adapter validates OPENCODE_API_KEY or provider keys
- [ ] Task worker uses OpenCode event parser for logs
- [ ] Exit code and errors handled properly

---

## Phase 7: Testing

**User stories**: #11 (comprehensive tests)

### What to build

Add test coverage:

- Update `opencode.test.ts` with config generation tests and validation
- Create `opencode-event-parser.test.ts` with diverse sample outputs
- Run existing adapter tests to ensure no regressions

### Acceptance criteria

- [ ] OpencodeAdapter unit tests pass
- [ ] OpencodeEventParser unit tests pass with sample outputs (NDJSON, plain text, errors)
- [ ] Existing adapter tests still pass
- [ ] API schema tests include new fields

---

## Phase 8: Documentation

**User stories**: #12 (document in README and CHANGELOG)

### What to build

Update documentation:

- Add OpenCode to README.md as supported agent
- Update CHANGELOG.md with OpenCode support
- Verify in-app help text if present

### Acceptance criteria

- [ ] README lists OpenCode as supported agent
- [ ] CHANGELOG mentions OpenCode integration
- [ ] Version number updated if applicable

---

## Out of Scope

- Custom image building (separate initiative)
- Real-time model validation against provider API
- Multi-provider auth management UI
- Telemetry beyond existing captures
- Windows native execution (Optio runs in Linux containers)
