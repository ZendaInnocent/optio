# Phase 2: Implement

## Goal

Implement features using TDD with vertical slices - one behavior at a time.

## TDD Loop

For each behavior:

1. **Write failing test** - Test the behavior first
2. **Implement behavior** - Make the test pass
3. **Refactor** - Clean up code (config: `min_refactor_passes`)
4. **Verify tests pass** - Ensure all tests green
5. **Run pre-commit hooks** - Lint + typecheck (config: `require_lint_pass`, `require_typecheck_pass`)
6. **Move to next behavior**

## Testing Requirements

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
