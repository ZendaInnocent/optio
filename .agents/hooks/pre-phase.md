# Pre-Phase Hook

Custom behavior to run before each phase execution.

## Usage

This file is included via `INCLUDE:` in main.md before each phase.

## Default Behavior

### Before Phase 1: Explore & Plan

- Check if UBIQUITOUS_LANGUAGE.md exists
- Load agent_docs context

### Before Phase 2: Implement

- Verify Phase 1 completed (plan file exists)
- Clear any stale todo list

### Before Phase 3: Verify

- Verify Phase 2 completed (tests pass)
- Ensure no uncommitted changes

### Before Phase 4: Commit

- Verify Phase 3 completed (all checks pass)
- Run git status to confirm clean state

## Customization

Edit this file to add custom pre-phase behavior. Use markdown includes for:

- Environment setup
- Context loading
- State validation
