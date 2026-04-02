# Agent System Architecture

The agent system is organized into modular components:

## Key Directories

- **Prompts**: `.agents/prompts/` — Modular prompt files (do-work, plan, review)
- **Events**: `.agents/events/schema.json` — 18 event types for state machine
- **Handlers**: `apps/api/src/lib/agent/handlers/` — Event handlers (TypeScript)
- **Context**: `apps/api/src/lib/agent/context/` — Context management with safety filtering
- **Repository**: `apps/api/src/lib/agent/repository.ts` — DB operations for threads/events
- **Runner**: `apps/api/src/lib/agent/runner.ts` — Event loop executor

The system uses a state machine driven by events, with each handler processing specific event types and transitioning the thread state accordingly.
