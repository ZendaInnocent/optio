# Do Work - Modular Implementation Workflow

> Version: v1.2.0
> This prompt is modular. See `config.md` for tunable parameters.
> **Default: Subagent Orchestration enabled** - delegate research, analysis, and parallel tasks to specialized sub-agents.

## Overview

Complete implementation workflow from exploration to commit using TDD with vertical slices.
This prompt uses **subagent orchestration by default** to maximize efficiency and quality.

## Subagent Orchestration (Default)

When `use_subagent_orchestration` is enabled (default: `true`):

### Delegation Strategy

1. **Codebase Analysis**: Delegate to sub-agents
   - Use for: finding patterns, understanding architecture, locating components
   - Parallelize independent analyses

2. **Bash-Intensive Tasks**: Delegate to `Bash` sub-agent
   - Use for: commands producing large output (aws CLI, gh CLI, log digging)
   - Keeps main thread context clean

3. **Coordinated Work**: Launch multiple sub-agents for independent tasks
   - Track results in master thread
   - Synthesize findings into coherent plan

### When to Delegate

- System understanding required
- Multiple independent research paths
- Heavy command-line operations
- Pattern discovery across codebase
- Parallel task execution

### Configuration

Controlled via `use_subagent_orchestration` in `config.md` (default: `true`).

---

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

| Phase        | Goal              | Key Config                                              |
| ------------ | ----------------- | ------------------------------------------------------- |
| 1. Explore   | Understand + plan | `require_validation_test`, `use_subagent_orchestration` |
| 2. Implement | TDD loop          | `tdd_loop_enabled`, `use_subagent_orchestration`        |
| 3. Verify    | All checks pass   | `stop_on_failure`, `use_subagent_orchestration`         |
| 4. Commit    | Atomic commits    | `atomic_commits`                                        |
| 5. Reflect   | Self-evaluate     | `enable_reflection`                                     |

---

## Execution

1. Read `config.md` to understand tunable parameters
2. Execute phases in order
3. Use hooks for custom behavior
4. Reference anti-patterns when tempted to take shortcuts
