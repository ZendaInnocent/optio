# Review: Code Quality

## Trigger

Auto-detect when:

- PR is created
- User asks for code review
- After implementation phase

## Input

- Changed files
- Diff summary
- Test coverage report

## Instructions

1. Check for:
   - Code duplication
   - Naming consistency
   - Error handling
   - Edge cases
   - Performance issues
2. Rate each finding by severity
3. Suggest specific fixes

## Output

```
## Code Quality Review

### Issues Found
- [ ] HIGH: ...
- [ ] MEDIUM: ...
- [ ] LOW: ...

### Suggestions
- ...
```
