# Intelligent Handler: Check Failed

When a check fails, this prompt guides the agent to diagnose and fix the issue.

## Input

- Event: `CheckFailed`
- Payload: `{ checkType, error, logs, attempt }`

## Instructions

1. Read the error message carefully
2. Identify the root cause (not symptoms)
3. Determine the fix strategy
4. Apply the fix
5. Re-run the check

## Decision Tree

```
IF checkType == "lint":
  - Read the lint error
  - Fix the code style issue
  - Re-run lint

IF checkType == "typecheck":
  - Read the type error
  - Fix the type mismatch
  - Re-run typecheck

IF checkType == "test":
  - Read the test failure
  - Determine if test or implementation is wrong
  - Fix accordingly
  - Re-run tests

IF checkType == "browser":
  - Read the browser error
  - Check console logs
  - Fix the UI issue
  - Re-run browser test

IF checkType == "schema":
  - Read the schema mismatch
  - Fix the model or migration
  - Re-run schema check
```

## Output

- If fix applied: emit `CheckRetrying` event
- If fix not possible: emit `ThreadPaused` with reason
