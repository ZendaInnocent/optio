# Plan: Decompose into Vertical Slices

## Trigger

After requirements analysis, when planning implementation

## Input

- Problem statement from analyze.md
- Dependencies list
- Risk assessment

## Instructions

1. Identify the smallest testable behavior
2. Create vertical slices (tracer bullets)
3. Each slice must:
   - Be testable in isolation
   - Have clear pass/fail criteria
   - Build on previous slices
4. Order slices by dependency
5. Assign test types to each slice

## Output Format

```yaml
slices:
  - id: slice-1
    description: "..."
    tests: ["unit", "integration"]
    dependencies: []
  - id: slice-2
    description: "..."
    tests: ["unit", "integration", "schema"]
    dependencies: ["slice-1"]
```

## Validation

- Each slice has at least one test
- No circular dependencies
- Clear ordering
