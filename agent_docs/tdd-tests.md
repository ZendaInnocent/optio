# Good and Bad Tests

## Good Tests

**Integration-style**: Test through real interfaces, not mocks of internal parts.

```typescript
// GOOD: Tests observable behavior
test("agent can execute task in isolated worktree", async () => {
  const agent = await createAgent({ repoUrl });
  const result = await agent.execute({ taskId: "123" });

  expect(result.status).toBe("completed");
  expect(result.logs).toContain("task executed");
});
```

Characteristics:

- Tests behavior users/callers care about
- Uses public API only
- Survives internal refactors
- Describes WHAT, not HOW
- One logical assertion per test

## Bad Tests

**Implementation-detail tests**: Coupled to internal structure.

```typescript
// BAD: Tests implementation details
test("worktree manager creates git worktree", async () => {
  const mockGit = jest.mock(GitClient);
  await worktreeManager.create({ path: "/tmp/repo" });

  expect(mockGit.worktree).toHaveBeenCalled();
});
```

Red flags:

- Mocking internal collaborators
- Testing private methods
- Asserting on call counts/order
- Test breaks when refactoring without behavior change
- Test name describes HOW not WHAT
- Verifying through external means instead of interface

```typescript
// BAD: Bypasses interface to verify
test("createAgent saves to database", async () => {
  await createAgent({ repoUrl });
  const row = await db.query("SELECT * FROM agents");
  expect(row).toBeDefined();
});

// GOOD: Verifies through interface
test("createAgent makes agent retrievable", async () => {
  const agent = await createAgent({ repoUrl });
  const retrieved = await getAgent(agent.id);

  expect(retrieved.repoUrl).toBe(repoUrl);
});
```

## Optio Examples

```typescript
// GOOD: Behavior-focused test
test("worktree is cleaned up when task is cancelled", async () => {
  const worktree = await worktreeService.create({ repoUrl, branch: "feature" });
  await worktreeService.cleanup(worktree.id);

  const exists = await worktreeService.get(worktree.id);
  expect(exists).toBeNull();
});

// BAD: Implementation-coupled test
test("cleanup calls git worktree remove", async () => {
  const mockGit = jest.mock(GitClient);
  await worktreeService.cleanup("wt-123");

  expect(mockGit.removeWorktree).toHaveBeenCalledWith("wt-123");
});
```
