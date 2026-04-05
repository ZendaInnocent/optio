# Task 3: Code Quality Improvements - Agent Run Service

## Objective

Fix race conditions, improve error handling, and expand test coverage for agent-run-service.

## Proposed Changes

### 1. transitionState - Atomic Conditional Update

**Current**: Read-then-write pattern vulnerable to race conditions.
**Fix**: Use atomic update with state check:

```typescript
const [updated] = await db
  .update(agentRuns)
  .set({ state: newState, updatedAt: new Date() })
  .where(and(eq(agentRuns.id, runId), eq(agentRuns.state, run.state)))
  .returning();

if (updated.length === 0) {
  const current = await getAgentRun(runId);
  if (!current) throw new Error("Agent run not found");
  if (current.state !== run.state) throw new Error("Concurrent state modification detected");
  throw new Error("Failed to update state");
}
```

Also import `and` from drizzle-orm.

### 2. switchMode - Existence Check

**Current**: Updates without verifying run exists.
**Fix**: Check existence before update, throw if not found, return updated record.

### 3. Error Consistency

Use consistent messages matching task-service patterns:

- "Agent run not found"
- "Invalid transition: X -> Y" (already present)
- "Concurrent state modification detected"

### 4. Expanded Tests (TDD Vertical Slices)

**Test A: Race condition detection**

- Simulate concurrent transition attempts
- First transition succeeds, second fails with race error

**Test B: switchMode on nonexistent run**

- Verify throws "Agent run not found"

**Test C: recordEvent/registerPr database insert**

- Verify db.insert called with correct values
- Test error propagation (at least one failure case per function)

**Test D: Invalid state transition message**

- Verify clear error message format (likely already covered)

## Affected Files

- `apps/api/src/services/agent-run-service.ts` - Implementation
- `apps/api/src/services/agent-run-service.test.ts` - Tests
- `apps/api/src/db/schema/agent-runs.ts` - Verify exports (probably fine)

## Edge Cases

- Race condition where run is deleted between read and update
- Multiple concurrent valid transitions (only one should succeed)
- Invalid state values (already validated by canTransition)
- Database connectivity failures during update/insert
- Empty result from update when run exists but state unchanged (shouldn't happen but handled)

## TDD Approach

Follow vertical slice pattern:

1. Write race condition test → fails
2. Implement atomic update → passes
3. Write switchMode existence test → fails
4. Add existence check → passes
5. Write recordEvent/registerPr db call tests → verify behavior
6. Run all tests → ensure pass
7. Run lint and typecheck
8. Commit
