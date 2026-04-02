# Phase 3: Verification Loops

## Goal

Ensure all checks pass before moving to commit.

## Enforcement Rule (CRITICAL)

When any check fails:

1. **STOP** - Do not continue
2. **FIX** - Address root cause, not symptoms
3. **RE-RUN** - Verify the check passes
4. **REPEAT** - Until all checks pass
5. **ONLY THEN** - Proceed to next task

## Check Types

### Code Quality

- Run pre-commit hooks (lint, typecheck)
- All tests pass (unit, integration, schema, config)

### Browser Testing (config: `run_browser_tests`)

- For UI features: test using chrome-devtools-mcp
- Verify renders correctly
- Verify interactions work
- Verify no console errors

### Integration

- API endpoints respond correctly
- Database operations work
- External services (if any) respond correctly

## Retry Logic (config: `retry_on_failure`)

- Failed checks should be retried once
- If still failing after retry, fix root cause
- Never skip failing checks

## Validation

- [ ] All lint checks pass
- [ ] All typecheck passes
- [ ] All tests pass (unit, integration, schema, config)
- [ ] Browser tests pass (if UI feature)
- [ ] No console errors in browser
