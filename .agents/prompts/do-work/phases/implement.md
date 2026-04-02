# Phase 2: Implement

## Goal

Implement features using TDD with vertical slices - one behavior at a time.
**Leverage subagents** for parallel development and validation tasks.

## TDD Loop

For each behavior:

1. **Write failing test** - Test the behavior first
2. **Implement behavior** - Make the test pass
3. **Refactor** - Clean up code (config: `min_refactor_passes`)
4. **Verify tests pass** - Ensure all tests green
5. **Run pre-commit hooks** - Lint + typecheck (config: `require_lint_pass`, `require_typecheck_pass`)
6. **Move to next behavior**

## Subagent Delegation (if enabled)

If `use_subagent_orchestration` is `true`:

### Parallel Implementation

When implementing multiple independent components:

- Delegate each to separate sub-agents
- Provide clear interface contracts
- Reintegrate results after verification

### Test Development

Delegate test writing for complex scenarios:

- Generate test cases from specification
- Write behavioral/integration tests
- Verify edge case coverage

### Quality Checks

Delegate to sub-agents for:

- Code review style checks
- Performance analysis
- Security vulnerability scanning
- Accessibility compliance

Use `context-mode_ctx_batch_execute()` for running test suites with verbose output.

## Standard TDD

Without subagent delegation:

### Backend (config: `require_*_tests`)

- **Unit tests**: Test individual functions/methods in isolation
- **Integration tests**: Test API endpoints with real HTTP calls
- **Schema tests**: Verify database columns/types match models
- **Config tests**: Verify config values are used, not hardcoded

### Frontend (config: `require_*_tests`)

- **Unit tests**: Test components in isolation
- **Behavioral tests**: Test user interactions
- **Integration tests**: Test flows end-to-end

## Progress Tracking

- Mark each behavior as: `pending` → `in_progress` → `completed`
- Update todo list in real-time
- Never have more than one behavior `in_progress`

## Anti-Patterns (Forbidden)

- Writing implementation before tests
- Skipping any test type
- Hardcoding configuration values
- Proceeding without passing tests
- Committing without subagent verification (when enabled)
