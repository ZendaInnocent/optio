# Test Cases

Scenarios to evaluate prompt quality. Run these against the prompt to validate it works correctly.

## Version

**v1.0.0** - Corresponds to do-work prompt v1.0.0

## Test Categories

### 1. Clarity Tests

#### TC-001: Unambiguous Instructions

**Input**: Prompt file
**Check**: No instruction contains ambiguous language (e.g., "should", "could", "might")
**Expected**: All imperative instructions use "must", "will", or "shall"

#### TC-002: File Path Resolution

**Input**: Prompt file
**Check**: All file references include path from repo root
**Expected**: No relative paths, no assumptions about current directory

### 2. Enforceability Tests

#### TC-003: Automatable Verification

**Input**: Each verification step in phases/verify.md
**Check**: Step can be run via CLI/script
**Expected**: 100% automatable

#### TC-004: Clear Failure States

**Input**: Each phase
**Check**: Each step has explicit pass/fail criteria
**Expected**: No "verify it works" without explicit criteria

### 3. Phase Execution Tests

#### TC-005: TDD Loop Completeness

**Input**: phases/implement.md
**Check**: All 6 TDD steps present (test → implement → refactor → verify → pre-commit → next)
**Expected**: All 6 steps documented

#### TC-006: Enforcement Loop

**Input**: phases/verify.md
**Check**: STOP-FIX-RE-RUN-REPEAT loop present
**Expected**: All 5 steps in order

#### TC-007: Issue Linking Rules

**Input**: phases/commit.md
**Check**: Distinguishes WIP vs completed work
**Expected**: "Relates to" for WIP, "Fix/Close/Resolve" for completed

### 4. Anti-Pattern Tests

#### TC-008: No Deferral Language

**Input**: anti-patterns.md
**Check**: "I'll fix it later" explicitly forbidden
**Expected**: Anti-pattern present with reason

#### TC-009: Warning Handling

**Input**: anti-patterns.md
**Check**: Warnings treated as failures
**Expected**: Explicit rule with "warnings are failures"

#### TC-010: CI Authority

**Input**: anti-patterns.md
**Check**: CI failure = failure
**Expected**: "Tests passed locally" explicitly rejected

### 5. Config Tests

#### TC-011: Config Completeness

**Input**: config.md
**Check**: All phases have tunable parameters
**Expected**: Every behavior controlled by config

#### TC-012: Default Safety

**Input**: config.md
**Check**: Defaults enforce quality (not relaxed)
**Expected**: `stop_on_failure: true`, `require_unit_tests: true`, etc.

### 6. Hook Tests

#### TC-013: Pre-Phase Hook

**Input**: main.md
**Check**: Pre-phase hook included
**Expected**: `INCLUDE: hooks/pre-phase.md` before each phase

#### TC-014: Post-Phase Hook

**Input**: main.md
**Check**: Post-phase hook included
**Expected**: `INCLUDE: hooks/post-phase.md` after each phase

## Running Tests

```bash
# Run all tests
pnpm eval:do-work

# Run specific category
pnpm eval:do-work:clarity
pnpm eval:do-work:enforceability

# Run single test
pnpm eval:do-work:tc-001
```

## Output Format

Each test produces:

```json
{
  "id": "TC-001",
  "name": "...",
  "passed": true/false,
  "details": "..."
}
```

Final score: `(passed / total) * 100%`
