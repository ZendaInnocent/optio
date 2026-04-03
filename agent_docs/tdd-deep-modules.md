# Deep Modules

From "A Philosophy of Software Design":

**Deep module** = small interface + lots of implementation

```
┌─────────────────────┐
│   Small Interface   │  ← Few methods, simple params
├─────────────────────┤
│                     │
│  Deep Implementation│  ← Complex logic hidden
│                     │
└─────────────────────┘
```

**Shallow module** = large interface + little implementation (avoid)

```
┌─────────────────────────────────┐
│       Large Interface           │  ← Many methods, complex params
├─────────────────────────────────┤
│  Thin Implementation            │  ← Just passes through
└─────────────────────────────────┘
```

## Why Deep Modules Help Testing

A deep module requires fewer tests because:

- Less surface area to verify
- Complex logic is hidden behind simple interface
- Changes to internal implementation don't break tests

## Optio Examples

### Deep: WorktreeManager

```typescript
// Small interface, deep implementation
interface WorktreeManager {
  create(config: WorktreeConfig): Promise<Worktree>;
  cleanup(worktreeId: string): Promise<void>;
  get(worktreeId: string): Promise<Worktree | null>;
}
```

Only 3 methods to test. Internally handles:

- Git worktree creation
- Branch switching
- Path management
- Cleanup logic

### Shallow: Avoid This

```typescript
// Shallow - exposes internal details
interface WorktreeManager {
  create(config: WorktreeConfig): Promise<Worktree>;
  cleanup(worktreeId: string): Promise<void>;
  get(worktreeId: string): Promise<Worktree | null>;
  git(args: string[]): Promise<GitResult>; // expose internals
  branch(): Promise<Branch>; // expose internals
  config(): Promise<WorktreeConfig>; // expose internals
  path(): string; // expose internals
}
```

This exposes implementation details that tests shouldn't depend on.

## When Designing Interfaces

Ask:

- Can I reduce the number of methods?
- Can I simplify the parameters?
- Can I hide more complexity inside?
- What does the caller really need to know?

Keep the public API small. Hide the complexity inside.
