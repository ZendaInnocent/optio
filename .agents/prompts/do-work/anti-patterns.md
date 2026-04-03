# Anti-Patterns (Forbidden)

These rules are **always enforced** - they cannot be disabled via config.

## The List

### 1. "I'll fix it later"

**Rule:** Never use "I'll fix it later" as an excuse.
**Why:** Later is never. Technical debt compounds.

### 2. "This is just a warning"

**Rule:** Treat warnings as failures.
**Why:** Warnings become bugs. Fix the root cause.

### 3. "Tests passed locally"

**Rule:** If CI fails, you failed.
**Why:** Local environment != CI environment. Fix for CI.

### 4. Proceeding with failing checks

**Rule:** Never proceed when checks fail.
**Why:** Broken code propagates. Fix before moving on.

### 5. Skipping browser tests for UI features

**Rule:** Always test UI with chrome-devtools-mcp.
**Why:** Manual verification doesn't scale. Automated tests catch regressions.

### 6. Writing implementation before tests

**Rule:** TDD - test first.
**Why:** Tests define behavior. Implementation follows.

### 7. Skipping test types

**Rule:** All required test types must be present.
**Why:** Each test type catches different issues.

### 8. Hardcoding configuration

**Rule:** Use config values, not hardcoded constants.
**Why:** Config is testable. Hardcoded values are not.

### 9. Large commits

**Rule:** Keep commits atomic and small.
**Why:** Large commits are hard to review, revert, and bisect.

### 10. Missing issue links

**Rule:** Always link commits to issues.
**Why:** Traceability. Understanding context later.

### 11. Testing implementation details

**Rule:** Tests must verify behavior through public interfaces, not implementation.
**Why:** Implementation-coupled tests break on refactor. Tests should describe what the system does, not how.

### 12. Mocking internal modules

**Rule:** Mock only at system boundaries (external APIs, databases, time).
**Why:** Mocking your own code hides bugs and couples tests to implementation.
