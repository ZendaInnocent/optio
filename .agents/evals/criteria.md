# Eval Criteria

Success metrics for evaluating prompt quality. These criteria validate that the prompt itself is well-designed, not the agent's output.

## Version

**v1.1.0** - Corresponds to do-work prompt v1.1.0

## General Criteria

### Clarity

| Metric                     | Threshold | Description                                     |
| -------------------------- | --------- | ----------------------------------------------- |
| `unambiguous_instructions` | 100%      | No instruction can be interpreted multiple ways |
| `explicit_dependencies`    | 100%      | All file references use absolute paths          |
| `complete_coverage`        | 100%      | All required test types documented              |

### Enforceability

| Metric                | Threshold | Description                                  |
| --------------------- | --------- | -------------------------------------------- |
| `automatable_checks`  | 100%      | All verification steps can run automatically |
| `clear_failure_state` | 100%      | Each step has clear pass/fail criteria       |
| `no_human_guesswork`  | 100%      | Agent never needs to guess what to do        |

## Phase-Specific Criteria

### Phase 1: Explore & Plan

| Metric                      | Threshold | Description                      |
| --------------------------- | --------- | -------------------------------- |
| `domain_knowledge_required` | true      | Must read UBIQUITOUS_LANGUAGE.md |
| `plan_validation`           | true      | Each task has test coverage      |
| `feasibility_check`         | true      | Plan includes feasibility review |

### Phase 2: Implement

| Metric           | Threshold | Description                          |
| ---------------- | --------- | ------------------------------------ |
| `tdd_order`      | true      | Test must come before implementation |
| `test_isolation` | true      | One behavior at a time               |
| `all_test_types` | true      | All required test types present      |

### Phase 3: Verify

| Metric                   | Threshold | Description                        |
| ------------------------ | --------- | ---------------------------------- |
| `stop_on_failure`        | true      | Must stop when check fails         |
| `browser_tests_required` | true      | UI features must test in browser   |
| `retry_logic`            | true      | Failed checks retry before failing |

### Phase 4: Commit

| Metric                   | Threshold | Description                               |
| ------------------------ | --------- | ----------------------------------------- |
| `issue_link_required`    | true      | All commits must reference issues         |
| `atomic_commits`         | true      | One behavior per commit                   |
| `domain_language_update` | true      | New terms added to UBIQUITOUS_LANGUAGE.md |

### Phase 5: Reflect

| Metric               | Threshold | Description                       |
| -------------------- | --------- | --------------------------------- |
| `reflection_run`     | true      | Reflection phase executed         |
| `specific_learnings` | true      | Learnings are specific, not vague |
| `action_items`       | true      | Concrete improvements identified  |

## Anti-Pattern Enforcement

| Metric                  | Threshold | Description                              |
| ----------------------- | --------- | ---------------------------------------- |
| `no_deferrals`          | true      | "I'll fix it later" explicitly forbidden |
| `warnings_are_failures` | true      | Warning handling explicit                |
| `ci_authority`          | true      | CI failure = failure explicitly stated   |

## Scoring

### Pass Threshold

- All metrics at 100% threshold must pass
- Metrics with thresholds > 0 must meet threshold

### Weighting

- **Critical** (must pass): `stop_on_failure`, `tdd_order`, `issue_link_required`
- **High**: All other metrics
- **Medium**: Clarity metrics

## Output Format

Eval runner produces:

```json
{
  "version": "v1.0.0",
  "passed": true/false,
  "metrics": [
    {"name": "...", "passed": true/false, "reason": "..."}
  ],
  "summary": "..."
}
```
