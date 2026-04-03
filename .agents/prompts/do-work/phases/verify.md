# Phase 3: Verification Loops

## Goal

Ensure all checks pass before moving to commit.
Use subagent orchestration to automate and parallelize verification.

## Enforcement Rule (CRITICAL)

When any check fails:

1. **STOP** - Do not continue
2. **FIX** - Address root cause, not symptoms
3. **RE-RUN** - Verify the check passes
4. **REPEAT** - Until all checks pass
5. **ONLY THEN** - Proceed to next task

## Subagent Delegation (if enabled)

If `use_subagent_orchestration` is `true`:

### Parallel Verification

Delegate different check types to separate sub-agents:

- **Lint/Typecheck sub-agent**: Runs `pnpm lint` and `pnpm typecheck`
- **Test sub-agent**: Runs all test suites (unit, integration, schema, config)
- **Browser sub-agent**: Runs UI tests with `chrome-devtools-mcp`
- **Performance sub-agent**: Benchmarks and compares metrics

Launch all simultaneously, aggregate results. Fail fast on any failure.

### Command Execution

All checks MUST use `node scripts/run-silent.js` wrapper to minimize context waste.
Delegate to `Bash` sub-agent for commands that produce large output.

### Retry Handling

If `retry_on_failure` enabled:

- Sub-agent automatically retries failed checks once
- Captures diagnostic logs for failures
- Reports root cause analysis

### Browser Testing

For UI features, delegate to sub-agent with `chrome-devtools-mcp` access:

- Verify correct rendering
- Test user interactions
- Check for console errors
- Validate accessibility

## Manual Verification

If `use_subagent_orchestration` is `false`:

### Code Quality

- Run pre-commit hooks (lint, typecheck)
- **IMPORTANT**: Use `node scripts/run-silent.js` for all commands to reduce context waste. Do NOT run commands directly - always use the sandbox execution wrapper. See AGENTS.md for details.
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
- [ ] Subagent verification complete (if enabled)

## TDD Quality Check

Run TDD compliance check to ensure tests follow best practices:

```bash
node scripts/run-silent.js "tdd-check" "node scripts/check-tdd.js apps/api/src"
```

Checks:

- No mocks of internal modules (only external APIs)
- No assertions on call counts/order
- No direct DB queries (use public interfaces)
- No tests for private methods

If violations found, fix the tests before proceeding. See `agent_docs/tdd-tests.md` for examples.
