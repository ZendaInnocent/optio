# Refactor Candidates

After TDD cycle passes, look for opportunities to improve code structure.

## Red Flags

- **Duplication** → Extract function/class
- **Long methods** → Break into private helpers (keep tests on public interface)
- **Shallow modules** → Combine or deepen
- **Feature envy** → Move logic to where data lives
- **Primitive obsession** → Introduce value objects
- **Existing code** the new code reveals as problematic

## When Refactoring

1. **All tests must pass** before refactoring
2. **Run tests after each change** - never refactor while RED
3. **Refactor in small steps** - one change at a time

## Optio-Specific Refactors

### Extract: Worktree Creation

```typescript
// Before: logic mixed in handler
app.post("/worktree", async (req) => {
  const { repoUrl, branch } = req.body;
  const path = `/tmp/worktrees/${uuid()}`;
  await git.worktree(path, branch);
  await db.worktrees.create({ path, repoUrl, branch });
  return { path };
});

// After: extracted to service
const worktree = await worktreeService.create({ repoUrl, branch });
return worktree;
```

### Deepen: Pod Specification

```typescript
// Before: caller builds complex spec
const spec = {
  apiVersion: "v1",
  kind: "Pod",
  metadata: { name: `agent-${id}` },
  spec: {
    containers: [{
      name: "agent",
      image: "optio/agent:latest",
      env: [...],
      resources: {...}
    }]
  }
};

// After: hidden behind simple interface
const pod = await podManager.create(agent);
```

### Extract Duplication: Agent Initialization

If you see repeated pod/worktree setup logic, extract to shared function:

```typescript
// Extract common setup
async function setupAgentEnvironment(agent: Agent) {
  const worktree = await worktreeService.createForAgent(agent.id);
  const pod = await podManager.allocateForAgent(agent.id);
  return { worktree, pod };
}
```

## Never Refactor

- When tests are RED (fix tests first)
- Implementation without tests (add tests first)
- During feature implementation (finish first, refactor after)

## Summary

Refactor after GREEN, not during RED. Each small step should keep tests passing. If a refactor breaks tests, either:

1. The refactor broke behavior (revert)
2. The test was implementation-coupled (fix the test)

Focus on deepening modules and reducing surface area - less to test, more behavior verified.
