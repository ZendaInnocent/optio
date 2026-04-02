# Post-Phase Hook

Custom behavior to run after each phase execution.

## Usage

This file is included via `INCLUDE:` in main.md after each phase.

## Default Behavior

### After Phase 1: Explore & Plan

- Validate plan file created
- Confirm each task has test coverage
- Update todo list with tasks

### After Phase 2: Implement

- Confirm all tests pass
- Confirm pre-commit hooks pass
- Update todo list progress

### After Phase 3: Verify

- Confirm all checks passed
- Log verification summary
- Update todo list status

### After Phase 4: Commit

- Confirm commit successful
- Update git log
- Archive completed plan

## Customization

Edit this file to add custom post-phase behavior. Use markdown includes for:

- Reporting
- Documentation
- Cleanup
