# Plan: Remove Enforced Setup Wizard

> Source PRD: `.agents/plans/remove-enforced-setup.md` (this file serves as both PRD and plan)

## Architectural decisions

Durable decisions that apply across all phases:

- **Routes**: No new routes required. `/setup` becomes an optional page (can keep for reference but not enforced).
- **Schema**: No database schema changes. Uses existing secrets storage for agent keys.
- **Key models**: No new data models. Uses existing `secrets` table for storing GITHUB_TOKEN, ANTHROPIC_API_KEY, OPENAI_API_KEY.
- **Authentication**: Unchanged. Auth middleware continues to protect routes.
- **Secrets storage**: Existing secret service already supports listing/creating secrets with scopes (global, repo-specific).

---

## Phase 1: Remove Setup Enforcement

**User stories**:

- Remove the enforced setup wizard redirect
- Reset all users to a clean state (remove isSetUp tracking)
- Users land directly on dashboard (`/`) on first visit

### What to build

Remove the SetupCheck component that forces redirect to `/setup`. After this phase:

- Users land on dashboard (`/`) immediately after login
- Dashboard shows empty state instead of "complete your setup" banner
- The `/setup` route can remain accessible but is not required

### Acceptance criteria

- [ ] New user lands on dashboard (not `/setup`) after login
- [ ] No automatic redirect to `/setup` occurs
- [ ] Dashboard shows empty state: "No tasks yet. Add a repo to get started."
- [ ] `/setup` page accessible manually (not removed, just not enforced)

---

## Phase 2: GitHub Token - Conditional Requirement

**User stories**:

- GitHub token required only for adding repos
- When user tries to add a repository, validate GitHub token exists

### What to build

Add GitHub token validation at the point of adding a repository. After this phase:

- Users can browse dashboard, repos list, settings without GitHub token
- When user clicks "Add Repository" (navigates to `/repos/new`):
  - Check if GITHUB_TOKEN exists in secrets
  - If missing, show inline error with link to Secrets page
- Secrets page validates GitHub token on save (already exists in API)

### Acceptance criteria

- [ ] GitHub token not required to view dashboard
- [ ] GitHub token not required to view repos list
- [ ] Adding repository shows inline error if GitHub token missing
- [ ] Error message includes link to Secrets page
- [ ] Token validation happens on Secrets page save (existing behavior)

---

## Phase 3: Agent Configuration UI

**User stories**:

- Allow users to choose their default agent
- Enable/disable toggle for each agent (claude-code, codex, opencode)
- Display required secrets for each enabled agent

### What to build

Add Agent Configuration section to Settings page. After this phase:

- Settings page has new "Agent Configuration" section
- List available agents: claude-code (Anthropic), codex (OpenAI), opencode
- Each agent has enable/disable toggle
- Default agent dropdown to select which agent to use by default
- Show required secrets for each enabled agent

### Acceptance criteria

- [ ] Settings page has Agent Configuration section
- [ ] List shows all available agents (claude-code, codex, opencode)
- [ ] Enable/disable toggle works for each agent
- [ ] Default agent dropdown allows selection
- [ ] Required secrets displayed for each enabled agent
- [ ] Quick link to Secrets page for adding missing keys

---

## Phase 4: Agent Keys - Conditional Requirement

**User stories**:

- Agent keys optional by default
- Agent keys required when using agent that needs them

### What to build

Add agent key validation at point of use. After this phase:

- Users can browse dashboard, settings, templates without agent keys
- When creating a task, template, or schedule:
  - User selects which agent to use (from enabled agents)
  - If selected agent requires API key AND no key is configured → show inline error
- Error message includes link to Secrets page

### Acceptance criteria

- [ ] Creating task without agent key shows inline error if selected agent needs one
- [ ] Creating template without agent key shows inline error if selected agent needs one
- [ ] Creating schedule without agent key shows inline error if selected agent needs one
- [ ] Error message includes link to Secrets page
- [ ] User can add key in Secrets and return to complete action

---

## Phase 5: Secrets Page Enhancement

**User stories**:

- Secrets page: Show which keys are needed based on enabled agents

### What to build

Enhance Secrets page to show which secrets are needed. After this phase:

- Secrets page displays which agent keys are needed based on enabled agents in Settings
- Visual indicator for which secrets are present vs missing
- Quick guidance on what each secret is used for

### Acceptance criteria

- [ ] Secrets page shows which agent keys are needed (based on enabled agents)
- [ ] Visual distinction between present and missing secrets
- [ ] Helper text explaining what each required secret is for

---

## Out of Scope (v1)

- Multi-agent support in single task
- Per-repo agent override
- Setup wizard as optional guided tour
