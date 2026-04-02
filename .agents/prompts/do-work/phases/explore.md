# Phase 1: Explore & Plan

## Goal

Understand the domain and prepare a clear implementation plan before writing code.
**Use subagent orchestration** to accelerate analysis and parallelize research.

## Subagent Delegation (if enabled)

If `use_subagent_orchestration` is `true`:

### 1.1 Codebase Understanding

Delegate to specialized sub-agents:

- **codebase-locator**: Find existing components, patterns, and related files
  - Query: "Where are similar features implemented?"
  - Query: "Find authentication-related code"
  - Query: "Show API endpoint patterns"

- **codebase-analyzer**: Deep dive into architecture and dependencies
  - Query: "Analyze the data flow for X feature"
  - Query: "What are the dependencies between modules A and B?"

Run these sub-agents **in parallel** when independent. Collect their results.

### 1.2 Requirements Analysis

After sub-agents return:

- Review all findings
- Identify gaps requiring additional research
- Deploy follow-up sub-agents if needed
- Synthesize comprehensive understanding

### 1.3 Plan Creation

Break down into vertical slices (tracer bullets).
Each task must have at least one validation test.
Save plan to `.agents/plans/<feature-name>.md`.

**Use sub-agents for**:

- Identifying test scenarios
- Estimating complexity
- Spotting edge cases

## Standard Steps (without subagent delegation)

If `use_subagent_orchestration` is `false`:

### 1.1 Read Domain Knowledge

- Read `UBIQUITOUS_LANGUAGE.md` to understand domain terms
- Read relevant `agent_docs/*.md` files for conventions and context

### 1.2 Analyze Requirements

- Understand the feature/bug from user request
- Identify dependencies and constraints
- Determine test strategy

### 1.3 Create Implementation Plan

- Break down into vertical slices (tracer bullets)
- Each task must have at least one test
- Save plan to `.agents/plans/<feature-name>.md`

## Validation

- [ ] UBIQUITOUS_LANGUAGE.md read (if exists)
- [ ] All agent_docs relevant to task read
- [ ] Codebase analysis performed (subagents or manual)
- [ ] Plan file created with test coverage for each task
- [ ] Plan reviewed for feasibility
