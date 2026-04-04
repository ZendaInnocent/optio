# Contract

This document serves as the mandatory operational contract for all AI coding agents. Adherence to these protocols is required for every task.

1. Plan First

- No Immediate Coding: Do not write implementation code until a plan is established.
- This project deep module philosophy with behavioral driven development.
- Read `UBIQUITOUS_LANGUAGE.md` to understand domain terms
- Mandatory: Create or update a plan file in the `.agents/plans/` directory before starting. It must include:
  - Proposed logic changes.
  - Affected files/modules.
  - Potential edge cases.

- Mid-Task Pivots: If a technical blocker, unexpected error, or architectural mismatch occurs, stop immediately. Update the plan and seek confirmation before proceeding.

2. Subagent Architecture

- Decomposition: If a task involves more than three distinct steps or touches multiple layers of the stack, break it into subtasks.
- Offloading: Spin up specialized subagents for:
  - Writing unit tests.
  - Refactoring boilerplate.
  - Generating documentation.

  State Management: The primary agent acts as the "Architect," managing the context and merging the work produced by subagents.

3. Self-Improvement & Persistence

- Lesson Logging: At the end of every task, write a brief summary to `.agents/lessons/`.Include: What failed, what fixed it, and preferred patterns found in this codebase.
- Update `UBIQUITOUS_LANGUAGE.md` if there are new terms
- Context Loading: At the start of every new session, read lessons and apply the gathered intelligence to the current plan.

4. Verification

- Test-Driven Execution: Every feature or bug fix must be accompanied by a test case.
- Validation Pipeline: Before declaring a task "Done," you must:
  - Run the relevant test suite.
  - Run linting/type-checking commands.
  - Verify the output against the original plan.

- After successful verification, commit the changes atomically and verify it is successful.

5. Autonomous Bug Fixing

- use systematic debugging
- Looping Logic: If a command or test fails, analyze the stack trace and attempt a fix automatically.
- Limit: You are permitted 3 autonomous repair attempts per error. If the error persists after the 3rd attempt, stop and request human intervention to avoid "hallucination loops."

6. Tool-First Operation

- Search over Guessing: If a library, API, or syntax is unfamiliar, always use the `search` or `context7` tool. Do not hallucinate parameters.
- For browser related tasks use `agent-browser`.
