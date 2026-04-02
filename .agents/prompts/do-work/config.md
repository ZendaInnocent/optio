# Do Work - Configuration

All tunable parameters for the Do Work workflow. Toggle these to customize behavior.

## Version

**v1.1.0**

## Enforcement Rules

| Parameter                | Type    | Default | Description                                       |
| ------------------------ | ------- | ------- | ------------------------------------------------- |
| `stop_on_failure`        | boolean | true    | STOP execution when any check fails               |
| `run_browser_tests`      | boolean | true    | Run browser tests for UI features in verify phase |
| `require_lint_pass`      | boolean | true    | Must pass lint before commit                      |
| `require_typecheck_pass` | boolean | true    | Must pass typecheck before commit                 |
| `allow_wip_commit`       | boolean | false   | Allow commits with "Relates to #X" (WIP commits)  |

## Testing Requirements

### Backend

| Parameter                   | Type    | Default | Description                                  |
| --------------------------- | ------- | ------- | -------------------------------------------- |
| `require_unit_tests`        | boolean | true    | Unit tests required for every feature        |
| `require_integration_tests` | boolean | true    | Integration tests required for every feature |
| `require_schema_tests`      | boolean | true    | Schema tests required for backend features   |
| `require_config_tests`      | boolean | true    | Config tests required (no hardcoded values)  |

### Frontend

| Parameter                   | Type    | Default | Description                       |
| --------------------------- | ------- | ------- | --------------------------------- |
| `require_unit_tests`        | boolean | true    | Unit tests for components         |
| `require_behavioral_tests`  | boolean | true    | Behavioral tests for interactions |
| `require_integration_tests` | boolean | true    | Integration tests for flows       |

## Phase Behavior

### Phase 1: Explore & Plan

| Parameter                     | Type    | Default | Description                            |
| ----------------------------- | ------- | ------- | -------------------------------------- |
| `require_ubiquitous_language` | boolean | true    | Must read UBIQUITOUS_LANGUAGE.md first |
| `require_validation_test`     | boolean | true    | Each task must have at least one test  |
| `create_plan_file`            | boolean | true    | Save plan to .agents/plans/            |

### Phase 2: Implement

| Parameter             | Type    | Default | Description                              |
| --------------------- | ------- | ------- | ---------------------------------------- |
| `tdd_loop_enabled`    | boolean | true    | Use red-green-refactor cycle             |
| `min_refactor_passes` | number  | 1       | Minimum refactor passes before moving on |
| `test_isolation`      | boolean | true    | Each behavior in isolation               |

### Phase 3: Verify

| Parameter               | Type    | Default | Description                        |
| ----------------------- | ------- | ------- | ---------------------------------- |
| `pre_commit_hook_check` | boolean | true    | Run pre-commit hooks               |
| `browser_test_on_ui`    | boolean | true    | Test UI with chrome-devtools-mcp   |
| `retry_on_failure`      | boolean | true    | Retry failed checks before failing |

### Phase 4: Commit

| Parameter                    | Type    | Default | Description                                |
| ---------------------------- | ------- | ------- | ------------------------------------------ |
| `require_issue_link`         | boolean | true    | Must link to issue (Fix/Close/Resolve #X)  |
| `atomic_commits`             | boolean | true    | One behavior per commit                    |
| `update_ubiquitous_language` | boolean | true    | Update UBIQUITOUS_LANGUAGE.md if new terms |

### Phase 5: Reflect

| Parameter            | Type    | Default | Description                         |
| -------------------- | ------- | ------- | ----------------------------------- |
| `enable_reflection`  | boolean | true    | Run reflection phase after commit   |
| `reflect_on_failure` | boolean | true    | Run reflection even when task fails |

## Anti-Patterns (Forced)

These cannot be disabled - they are always enforced:

1. No "I'll fix it later" excuses
2. Warnings are failures
3. "Tests passed locally" doesn't matter if CI fails
4. No proceeding with failing checks
5. No skipping browser tests for UI features
