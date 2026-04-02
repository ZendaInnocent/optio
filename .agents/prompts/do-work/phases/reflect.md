# Phase 5: Reflect & Improve

## Goal

Self-evaluate task completion quality and identify improvements for future work.

## Why

Agents should learn from each task. Reflection surfaces what worked, what didn't, and how to improve.

## When

Run after Commit phase completes successfully. Can also run on failure to understand what went wrong.

## Store Reflection

**IMPORTANT**: After completing reflection, store it using the Optio tool:

```
Use `create_reflection` tool with:
- taskId: current task ID
- whatWorked: array of successful approaches
- whatDidntWork: array of mistakes/inefficiencies
- improvements: array of specific improvements
- technicalDebt: array of items to address later
- goalAchievement: "complete" | "partial" | "failed"
- processQuality: "good" | "acceptable" | "poor"
- notes: any additional observations
```

You can also query past reflections with `search_reflections` and `get_reflection_stats` to identify patterns.

## Reflection Dimensions

### 1. Goal Achievement

- Did I complete the requested feature/fix?
- What remains unfinished?
- Were there scope creep or gold-plating?

### 2. Process Quality

- Was my exploration sufficient?
- Did I write tests first (TDD)?
- Did I verify before committing?
- Were commits atomic?

### 3. Time & Effort

- Where did I get stuck?
- What took longer than expected?
- Did I iterate unnecessarily?

### 4. Code Quality

- Is the code clear and maintainable?
- Did I follow project conventions?
- Are there technical debt items?

## Output Format

```markdown
## Reflection Summary

### What Worked

- [List successful approaches]

### What Didn't Work

- [List mistakes or inefficiencies]

### Improvements for Next Time

- [Specific actions to take]

### Technical Debt Noted

- [Items to address later]
```

## Config

| Setting              | Type    | Default | Description                         |
| -------------------- | ------- | ------- | ----------------------------------- |
| `enable_reflection`  | boolean | true    | Run reflection phase                |
| `reflect_on_failure` | boolean | true    | Run reflection even when task fails |

## Anti-Patterns

- **Skipping reflection** - Always reflect, success or failure
- **Vague learnings** - Be specific, not generic
- **No action items** - Always identify concrete improvements
