# Do Work - Modular Implementation Workflow

> Version: v1.1.0
> This prompt is modular. See `config.md` for tunable parameters.

## Overview

Complete implementation workflow from exploration to commit using TDD with vertical slices.

## Configuration

All tunable parameters are in `config.md`. Default values enforce strict quality.

## Workflow Execution

### Phase 1: Explore & Plan

```
INCLUDE: phases/explore.md
```

### Phase 2: Implement

```
INCLUDE: phases/implement.md
```

### Phase 3: Verify

```
INCLUDE: phases/verify.md
```

### Phase 4: Commit

```
INCLUDE: phases/commit.md
```

### Phase 5: Reflect & Improve

```
INCLUDE: phases/reflect.md
```

## Hooks

- **Before Phase**: `INCLUDE: ../../hooks/pre-phase.md`
- **After Phase**: `INCLUDE: ../../hooks/post-phase.md`

## Anti-Patterns

Always enforced - see `anti-patterns.md`:

```
INCLUDE: anti-patterns.md
```

## Quick Reference

| Phase        | Goal              | Key Config                |
| ------------ | ----------------- | ------------------------- |
| 1. Explore   | Understand + plan | `require_validation_test` |
| 2. Implement | TDD loop          | `tdd_loop_enabled`        |
| 3. Verify    | All checks pass   | `stop_on_failure`         |
| 4. Commit    | Atomic commits    | `atomic_commits`          |
| 5. Reflect   | Self-evaluate     | `enable_reflection`       |

---

## Execution

1. Read `config.md` to understand tunable parameters
2. Execute phases in order
3. Use hooks for custom behavior
4. Reference anti-patterns when tempted to take shortcuts
